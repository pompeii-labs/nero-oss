import type {
    NeroInterface,
    NeroComponent,
    InterfaceUpdatePatch,
    InterfaceEvent,
    InterfaceAction,
    InterfaceTrigger,
    GlobalInterfaceEvent,
    DisplayDevice,
} from './types.js';

const MIN_INTERVAL_MS = 10_000;

export class InterfaceManager {
    private interfaces: Map<string, NeroInterface> = new Map();
    private listeners: Map<string, Set<(event: InterfaceEvent) => void>> = new Map();
    private globalListeners: Set<(event: GlobalInterfaceEvent) => void> = new Set();
    private triggerTimers: Map<string, NodeJS.Timeout[]> = new Map();
    private actionExecutor?: (interfaceId: string, action: InterfaceAction) => Promise<void>;
    private _webClientCount = 0;
    private devices: Map<string, DisplayDevice> = new Map();

    setActionExecutor(fn: (interfaceId: string, action: InterfaceAction) => Promise<void>): void {
        this.actionExecutor = fn;
    }

    addWebClient(): void {
        this._webClientCount++;
    }

    removeWebClient(): void {
        this._webClientCount = Math.max(0, this._webClientCount - 1);
    }

    hasWebClients(): boolean {
        return this._webClientCount > 0;
    }

    registerDevice(id: string, name: string): void {
        for (const [existingId, device] of this.devices) {
            if (device.name === name && existingId !== id) {
                this.devices.delete(existingId);
            }
        }
        this.devices.set(id, { id, name, connectedAt: Date.now() });
    }

    unregisterDevice(id: string): void {
        this.devices.delete(id);
    }

    getDevices(): DisplayDevice[] {
        return Array.from(this.devices.values());
    }

    getDeviceByName(name: string): DisplayDevice | undefined {
        for (const device of this.devices.values()) {
            if (device.name === name) return device;
        }
        return undefined;
    }

    moveToDevice(interfaceId: string, targetDeviceName: string): boolean {
        const iface = this.interfaces.get(interfaceId);
        if (!iface) return false;

        const fromDevice = iface.targetDevice;
        iface.targetDevice = targetDeviceName;

        this.emitGlobal({ type: 'moved', id: interfaceId, fromDevice, toDevice: targetDeviceName });
        return true;
    }

    subscribeGlobal(cb: (event: GlobalInterfaceEvent) => void): () => void {
        this.globalListeners.add(cb);
        return () => {
            this.globalListeners.delete(cb);
        };
    }

    emitVoiceMigrate(targetDevice: string): void {
        this.emitGlobal({ type: 'voice_migrate', targetDevice });
    }

    emitPresence(display: string): void {
        this.emitGlobal({ type: 'presence', display });
    }

    private emitGlobal(event: GlobalInterfaceEvent): void {
        for (const cb of this.globalListeners) {
            try {
                cb(event);
            } catch {}
        }
    }

    create(schema: Omit<NeroInterface, 'id'>): NeroInterface {
        const id = crypto.randomUUID();
        const iface: NeroInterface = { id, ...schema };
        this.interfaces.set(id, iface);

        this.emitGlobal({ type: 'opened', iface });

        if (iface.triggers && iface.triggers.length > 0 && this.actionExecutor) {
            this.startTriggers(id, iface.triggers);
        }

        return iface;
    }

    private startTriggers(id: string, triggers: InterfaceTrigger[]): void {
        const timers: NodeJS.Timeout[] = [];

        for (const trigger of triggers) {
            if (trigger.type === 'onOpen') {
                this.actionExecutor!(id, trigger.action);
            } else if (trigger.type === 'interval') {
                const ms = Math.max(trigger.intervalMs, MIN_INTERVAL_MS);
                this.actionExecutor!(id, trigger.action);
                const timer = setInterval(() => {
                    if (!this.interfaces.has(id)) {
                        clearInterval(timer);
                        return;
                    }
                    this.actionExecutor!(id, trigger.action);
                }, ms);
                timers.push(timer);
            }
        }

        if (timers.length > 0) {
            this.triggerTimers.set(id, timers);
        }
    }

    get(id: string): NeroInterface | undefined {
        return this.interfaces.get(id);
    }

    update(id: string, patch: InterfaceUpdatePatch): void {
        const iface = this.interfaces.get(id);
        if (!iface) return;

        if (patch.title !== undefined) iface.title = patch.title;
        if (patch.width !== undefined) iface.width = patch.width;
        if (patch.height !== undefined) iface.height = patch.height;
        if (patch.accentColor !== undefined) iface.accentColor = patch.accentColor;
        if (patch.components) {
            iface.components = mergeComponents(iface.components, patch.components);
        }

        if (patch.addComponents) {
            iface.components = [...iface.components, ...patch.addComponents];
        }

        if (patch.removeComponentIds) {
            const removeSet = new Set(patch.removeComponentIds);
            iface.components = removeComponents(iface.components, removeSet);
        }

        if (patch.state) {
            iface.state = { ...(iface.state || {}), ...patch.state };
        }

        this.broadcast(id, { type: 'update', patch });
    }

    close(id: string): void {
        const timers = this.triggerTimers.get(id);
        if (timers) {
            for (const timer of timers) clearInterval(timer);
            this.triggerTimers.delete(id);
        }

        this.broadcast(id, { type: 'close' });
        this.interfaces.delete(id);
        this.listeners.delete(id);

        this.emitGlobal({ type: 'closed', id });
    }

    list(): NeroInterface[] {
        return Array.from(this.interfaces.values());
    }

    subscribe(id: string, cb: (event: InterfaceEvent) => void): () => void {
        if (!this.listeners.has(id)) {
            this.listeners.set(id, new Set());
        }
        this.listeners.get(id)!.add(cb);
        return () => {
            this.listeners.get(id)?.delete(cb);
        };
    }

    updateState(id: string, key: string, value: any): void {
        const iface = this.interfaces.get(id);
        if (!iface) return;

        if (!iface.state) iface.state = {};
        iface.state[key] = value;

        this.broadcast(id, { type: 'state_change', key, value });
    }

    private broadcast(id: string, event: InterfaceEvent): void {
        const subs = this.listeners.get(id);
        if (!subs) return;
        for (const cb of subs) {
            try {
                cb(event);
            } catch {}
        }
    }
}

function mergeComponents(existing: NeroComponent[], incoming: NeroComponent[]): NeroComponent[] {
    const incomingMap = new Map(incoming.map((c) => [c.id, c]));
    const merged = existing.map((c) => incomingMap.get(c.id) ?? c);
    for (const c of incoming) {
        if (!existing.some((e) => e.id === c.id)) merged.push(c);
    }
    return merged;
}

function removeComponents(components: NeroComponent[], ids: Set<string>): NeroComponent[] {
    return components
        .filter((c) => !ids.has(c.id))
        .map((c) => {
            if ('children' in c && Array.isArray(c.children)) {
                return { ...c, children: removeComponents(c.children, ids) };
            }
            return c;
        });
}
