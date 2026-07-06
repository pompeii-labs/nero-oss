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

/** Register/refresh this device. The server assigns/keeps the name and returns it. */
export async function registerDevice(): Promise<{ id: string; name: string }> {
    const id = deviceId();
    const res = await post<{ id: string; name: string }>('/v1/devices/register', {
        id,
        name: requestedName(),
        screenW: window.innerWidth,
        screenH: window.innerHeight,
    });
    return { id, name: res.success ? res.data.name : '' };
}

export async function heartbeatDevice(): Promise<void> {
    await post('/v1/devices/heartbeat', { id: deviceId() });
}

/** Move the orb (Nero) onto this device. */
export async function bringNeroHere(): Promise<void> {
    await post('/v1/presence', { deviceId: deviceId() });
}
