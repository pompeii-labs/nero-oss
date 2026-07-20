import { post } from './actions/helpers';

/**
 * This browser's identity as a "device" Nero can live on / throw panels to. The id
 * is persisted in localStorage so the same physical screen keeps its identity
 * across reloads. The NAME is assigned by the server: the first display becomes
 * "main", any other gets a requested name (?name=) or a random unused callsign.
 */
const ID_KEY = 'nero.device.id';

function param(key: string): string | null {
    const v = new URLSearchParams(location.search).get(key);
    return v && v.trim() ? v.trim() : null;
}
const slug = (s: string) => `dev-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// crypto.randomUUID is secure-context only (HTTPS/localhost); over a plain-HTTP LAN
// IP it's undefined, so fall back to a non-crypto id (device ids aren't secrets).
function randomShortId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(16).slice(2, 10);
}

/** `?name=kitchen` makes this tab a distinct display named "kitchen". `?device=`
 *  is the legacy id-only override (distinct device, server picks the name). */
export function deviceId(): string {
    const named = param('name');
    if (named) return slug(named);
    const legacy = param('device');
    if (legacy) return slug(legacy);
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
        id = `dev-${randomShortId()}`;
        localStorage.setItem(ID_KEY, id);
    }
    return id;
}

/** An explicit name request from `?name=`, if any; otherwise the server names it. */
export function requestedName(): string | undefined {
    return param('name') ?? undefined;
}

/** This device's platform kind, used for the server default name + the phone rules
 *  (phones never win the wakeword race, never receive panels). iPadOS Safari lies and
 *  reports as a Mac, so we disambiguate it by touch support. */
export function platformKind(): string {
    const ua = navigator.userAgent;
    const touch = typeof document !== 'undefined' && 'ontouchend' in document;
    if (/iPhone/.test(ua)) return 'iphone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'ipad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'android' : 'ipad';
    if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
    if (/Windows/.test(ua)) return 'windows';
    if (/Linux/.test(ua)) return 'linux';
    return 'web';
}

/** True if this browser is a handheld phone (never an ambient wakeword competitor). */
export function isPhone(): boolean {
    return platformKind() === 'iphone' || platformKind() === 'android';
}

/** Register/refresh this device. The server assigns/keeps the name and returns it. */
export async function registerDevice(): Promise<{ id: string; name: string }> {
    const id = deviceId();
    const res = await post<{ id: string; name: string }>('/v1/devices/register', {
        id,
        name: requestedName(),
        kind: platformKind(),
        screenW: window.innerWidth,
        screenH: window.innerHeight,
    });
    return { id, name: res.success ? res.data.name : '' };
}

/** Rename a device (Settings > Devices). */
export async function renameDevice(id: string, name: string): Promise<void> {
    await post('/v1/devices/rename', { id, name });
}

/** Forget a device (removes it from the registry). */
export async function forgetDevice(id: string): Promise<void> {
    await post('/v1/devices/forget', { id });
}

export async function heartbeatDevice(): Promise<void> {
    await post('/v1/devices/heartbeat', { id: deviceId() });
}

/** Move the orb (Nero) onto this device. */
export async function bringNeroHere(): Promise<void> {
    await post('/v1/presence', { deviceId: deviceId() });
}

/** Opt this display into (or out of) ambient presence: a glanceable orb + wakeword
 *  listening even when Nero isn't focused here. */
export async function setAmbient(ambient: boolean, room?: string | null): Promise<void> {
    await post('/v1/devices/ambient', { id: deviceId(), ambient, room });
}

/** Report a local wakeword hit to the server arbiter, which groups near-simultaneous
 *  detections across devices and moves Nero to the loudest (closest) one. */
export async function reportWake(rms: number, score: number): Promise<void> {
    await post('/v1/wake', { source: deviceId(), rms, score });
}
