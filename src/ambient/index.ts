import { InterfaceManager } from '../interfaces/manager.js';
import type { NeroInterface, GlobalInterfaceEvent } from '../interfaces/types.js';
import type { AmbientConfig } from '../config.js';
import { fetchWeather, geolocate } from './weather.js';
import { Logger } from '../util/logger.js';

export interface AmbientCard {
    id: string;
    type: string;
    title: string;
    content: string;
    icon?: string;
    meta?: string;
    expiry?: number;
}

export interface AutonomyLogEntry {
    ts: number;
    type: 'tool' | 'session_start' | 'session_end';
    text: string;
}

const CLOCK_INTERVAL_MS = 30_000;
const WEATHER_INTERVAL_MS = 15 * 60_000;
const CARD_ROTATE_INTERVAL_MS = 15_000;

export type AutonomyStatus = 'active' | 'sleeping' | 'disabled';

export class AmbientManager {
    private interfaceManager: InterfaceManager;
    private config: AmbientConfig;
    private logger = new Logger('Ambient');
    private ambientInterfaces: Map<string, string> = new Map();
    private suppressedDisplays: Set<string> = new Set();
    private realInterfaceDevices: Map<string, string> = new Map();
    private cards: Map<string, AmbientCard> = new Map();
    private cardOrder: string[] = [];
    private activeCardIndex = 0;
    private clockTimer: NodeJS.Timeout | null = null;
    private weatherTimer: NodeJS.Timeout | null = null;
    private cardRotateTimer: NodeJS.Timeout | null = null;
    private expiryTimer: NodeJS.Timeout | null = null;
    private unsubscribe: (() => void) | null = null;
    private timezone: string;
    private cachedLocation: { lat: number; lon: number } | null = null;
    private autonomyLog: AutonomyLogEntry[] = [];
    private logClearTimer: NodeJS.Timeout | null = null;
    private readonly LOG_MAX = 30;
    private autonomyStatus: AutonomyStatus = 'disabled';
    private nextWakeTime: number | null = null;
    private activeProjectCount: number = 0;

    constructor(interfaceManager: InterfaceManager, config: AmbientConfig, timezone?: string) {
        this.interfaceManager = interfaceManager;
        this.config = config;
        this.timezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    start(): void {
        if (!this.config.enabled) return;

        this.unsubscribe = this.interfaceManager.subscribeGlobal((event) => {
            this.handleGlobalEvent(event);
        });

        this.startTimers();
        this.logger.info('Ambient display system started');
    }

    shutdown(): void {
        this.stopTimers();

        if (this.logClearTimer) {
            clearTimeout(this.logClearTimer);
            this.logClearTimer = null;
        }

        for (const [displayName, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.close(ifaceId);
        }
        this.ambientInterfaces.clear();
        this.suppressedDisplays.clear();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    pushCard(card: AmbientCard, activate: boolean = true): void {
        if (card.expiry && card.expiry < Date.now()) return;

        this.cards.set(card.id, card);
        if (!this.cardOrder.includes(card.id)) {
            this.cardOrder.push(card.id);
        }

        this.broadcastCardState();
        if (activate) this.setActiveCard(card.id);
    }

    removeCard(id: string): void {
        this.cards.delete(id);
        this.cardOrder = this.cardOrder.filter((cid) => cid !== id);
        if (this.activeCardIndex >= this.cardOrder.length) {
            this.activeCardIndex = 0;
        }
        this.broadcastCardState();
    }

    getCards(): AmbientCard[] {
        return Array.from(this.cards.values());
    }

    pushLogEntry(entry: AutonomyLogEntry): void {
        this.autonomyLog.push(entry);
        if (this.autonomyLog.length > this.LOG_MAX) {
            this.autonomyLog = this.autonomyLog.slice(-this.LOG_MAX);
        }
        this.broadcastLogState();
    }

    startAutonomyLog(sessionId: string): void {
        if (this.logClearTimer) {
            clearTimeout(this.logClearTimer);
            this.logClearTimer = null;
        }
        this.autonomyLog = [];
        this.pushLogEntry({
            ts: Date.now(),
            type: 'session_start',
            text: `session ${sessionId.slice(0, 8)} started`,
        });
    }

    endAutonomyLog(sessionId: string): void {
        this.pushLogEntry({
            ts: Date.now(),
            type: 'session_end',
            text: `session ${sessionId.slice(0, 8)} ended`,
        });
        this.logClearTimer = setTimeout(() => {
            this.autonomyLog = [];
            this.broadcastLogState();
            this.logClearTimer = null;
        }, 30_000);
    }

    setAutonomyStatus(
        status: AutonomyStatus,
        nextWakeTime?: number | null,
        activeProjectCount?: number,
    ): void {
        this.autonomyStatus = status;
        if (nextWakeTime !== undefined) this.nextWakeTime = nextWakeTime;
        if (activeProjectCount !== undefined) this.activeProjectCount = activeProjectCount;

        for (const [, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.updateState(ifaceId, 'autonomyStatus', this.autonomyStatus);
            this.interfaceManager.updateState(ifaceId, 'nextWakeTime', this.nextWakeTime);
            this.interfaceManager.updateState(
                ifaceId,
                'activeProjectCount',
                this.activeProjectCount,
            );
        }
    }

    private broadcastLogState(): void {
        for (const [, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.updateState(ifaceId, 'autonomyLog', [...this.autonomyLog]);
        }
    }

    private handleGlobalEvent(event: GlobalInterfaceEvent): void {
        switch (event.type) {
            case 'device_connected':
                this.onDeviceConnected(event.deviceName);
                break;
            case 'device_disconnected':
                this.onDeviceDisconnected(event.deviceName);
                break;
            case 'opened':
                if (!event.iface.ambient && event.iface.targetDevice) {
                    this.realInterfaceDevices.set(event.iface.id, event.iface.targetDevice);
                    this.onRealInterfaceOpened(event.iface.targetDevice);
                }
                break;
            case 'closed': {
                const deviceName = this.realInterfaceDevices.get(event.id);
                if (deviceName) {
                    this.realInterfaceDevices.delete(event.id);
                    this.checkRestoreAmbient(deviceName);
                }
                const ambientDisplay = this.findAmbientByInterfaceId(event.id);
                if (ambientDisplay) {
                    this.ambientInterfaces.delete(ambientDisplay);
                }
                break;
            }
        }
    }

    private onDeviceConnected(deviceName: string): void {
        if (this.ambientInterfaces.has(deviceName)) return;

        const realInterfaces = this.interfaceManager.getRealInterfacesForDevice(deviceName);
        if (realInterfaces.length > 0) {
            this.suppressedDisplays.add(deviceName);
            return;
        }

        this.createAmbientInterface(deviceName);
    }

    private onDeviceDisconnected(deviceName: string): void {
        const ifaceId = this.ambientInterfaces.get(deviceName);
        if (ifaceId) {
            this.interfaceManager.close(ifaceId);
            this.ambientInterfaces.delete(deviceName);
        }
        this.suppressedDisplays.delete(deviceName);
    }

    private onRealInterfaceOpened(displayName: string): void {
        if (!this.ambientInterfaces.has(displayName)) return;

        this.suppressedDisplays.add(displayName);
        const ifaceId = this.ambientInterfaces.get(displayName)!;
        this.interfaceManager.close(ifaceId);
        this.ambientInterfaces.delete(displayName);

        this.interfaceManager.emitGlobal({ type: 'ambient_suppress', displayName });
    }

    private checkRestoreAmbient(displayName: string): void {
        if (!this.suppressedDisplays.has(displayName)) return;

        const realInterfaces = this.interfaceManager.getRealInterfacesForDevice(displayName);
        if (realInterfaces.length > 0) return;

        this.suppressedDisplays.delete(displayName);

        const device = this.interfaceManager.getDeviceByName(displayName);
        if (!device) return;

        const iface = this.createAmbientInterface(displayName);
        if (iface) {
            this.interfaceManager.emitGlobal({ type: 'ambient_restore', displayName, iface });
        }
    }

    private findAmbientByInterfaceId(id: string): string | null {
        for (const [displayName, ifaceId] of this.ambientInterfaces) {
            if (ifaceId === id) return displayName;
        }
        return null;
    }

    private createAmbientInterface(displayName: string): NeroInterface | null {
        if (!this.config.enabled) return null;

        const now = new Date();
        const timeStr = this.formatTime(now);
        const dateStr = this.formatDate(now);

        const state: Record<string, any> = {
            time: timeStr,
            date: dateStr,
            activeCard: null,
            cards: [],
            autonomyLog: [...this.autonomyLog],
            autonomyStatus: this.autonomyStatus,
            nextWakeTime: this.nextWakeTime,
            activeProjectCount: this.activeProjectCount,
        };

        const cards = this.getSerializedCards();
        if (cards.length > 0) {
            state.cards = cards;
            state.activeCard = cards[0]?.id ?? null;
        }

        const iface = this.interfaceManager.create({
            title: 'Ambient',
            width: 0,
            height: 0,
            components: [],
            state,
            targetDevice: displayName,
            ambient: true,
        });

        this.ambientInterfaces.set(displayName, iface.id);
        return iface;
    }

    private startTimers(): void {
        this.updateClock();
        this.clockTimer = setInterval(() => this.updateClock(), CLOCK_INTERVAL_MS);

        if (this.config.weather) {
            this.updateWeather();
            this.weatherTimer = setInterval(() => this.updateWeather(), WEATHER_INTERVAL_MS);
        }

        this.cardRotateTimer = setInterval(() => this.rotateCard(), CARD_ROTATE_INTERVAL_MS);

        this.expiryTimer = setInterval(() => this.cleanExpiredCards(), 60_000);
    }

    private stopTimers(): void {
        if (this.clockTimer) {
            clearInterval(this.clockTimer);
            this.clockTimer = null;
        }
        if (this.weatherTimer) {
            clearInterval(this.weatherTimer);
            this.weatherTimer = null;
        }
        if (this.cardRotateTimer) {
            clearInterval(this.cardRotateTimer);
            this.cardRotateTimer = null;
        }
        if (this.expiryTimer) {
            clearInterval(this.expiryTimer);
            this.expiryTimer = null;
        }
    }

    private updateClock(): void {
        const now = new Date();
        const timeStr = this.formatTime(now);
        const dateStr = this.formatDate(now);

        for (const [, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.updateState(ifaceId, 'time', timeStr);
            this.interfaceManager.updateState(ifaceId, 'date', dateStr);
        }
    }

    private async resolveLocation(): Promise<{ lat: number; lon: number } | null> {
        if (this.cachedLocation) return this.cachedLocation;

        if (typeof this.config.weather === 'object') {
            this.cachedLocation = this.config.weather;
            return this.cachedLocation;
        }

        this.logger.info('Resolving weather location via IP...');
        const loc = await geolocate();
        if (loc) {
            this.cachedLocation = loc;
            this.logger.info(`Location resolved: ${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`);
        } else {
            this.logger.warn('Failed to resolve location via IP');
        }
        return this.cachedLocation;
    }

    private async updateWeather(): Promise<void> {
        if (!this.config.weather) return;

        const location = await this.resolveLocation();
        if (!location) return;

        const weather = await fetchWeather(location.lat, location.lon);

        if (weather) {
            this.logger.debug(`Weather: ${weather.temp}°F, ${weather.condition}`);

            const isNew = !this.cards.has('weather');

            this.cards.set('weather', {
                id: 'weather',
                type: 'weather',
                title: weather.condition,
                content: `${weather.temp}°F`,
                icon: weather.icon,
                meta: `H: ${weather.high}° L: ${weather.low}°`,
            });
            if (!this.cardOrder.includes('weather')) {
                this.cardOrder.unshift('weather');
            }

            this.broadcastCardState();

            if (isNew || this.cardOrder.length === 1) {
                this.activeCardIndex = this.cardOrder.indexOf('weather');
                this.setActiveCard('weather');
            }
        } else {
            this.logger.warn('Weather fetch returned null');
            if (this.cards.has('weather')) {
                this.removeCard('weather');
            }
        }
    }

    private rotateCard(): void {
        if (this.cardOrder.length === 0) return;

        this.activeCardIndex = (this.activeCardIndex + 1) % this.cardOrder.length;
        const activeId = this.cardOrder[this.activeCardIndex];

        this.setActiveCard(activeId);
    }

    private setActiveCard(id: string): void {
        for (const [, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.updateState(ifaceId, 'activeCard', id);
        }
    }

    private broadcastCardState(): void {
        const cards = this.getSerializedCards();
        for (const [, ifaceId] of this.ambientInterfaces) {
            this.interfaceManager.updateState(ifaceId, 'cards', cards);
        }
    }

    private getSerializedCards(): any[] {
        return this.cardOrder
            .map((id) => this.cards.get(id))
            .filter((c): c is AmbientCard => c != null);
    }

    private cleanExpiredCards(): void {
        const now = Date.now();
        for (const [id, card] of this.cards) {
            if (card.expiry && card.expiry < now) {
                this.removeCard(id);
            }
        }
    }

    private formatTime(date: Date): string {
        return date.toLocaleTimeString('en-US', {
            timeZone: this.timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    }

    private formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            timeZone: this.timezone,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        });
    }
}
