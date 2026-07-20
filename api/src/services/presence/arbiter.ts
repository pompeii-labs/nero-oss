import { Device, PHONE_KINDS } from '../../models/device';
import { Presence } from '../../models/presence';

/**
 * Wakeword arbitration ("Echo Spatial Perception", loudest wins). Multiple ambient
 * devices hear "hey nero" at nearly the same time and each reports independently. We
 * group reports in a short window (time GROUPS them into one utterance), then pick the
 * device that heard it LOUDEST (loudness = closest to the user), move Nero there, and
 * stamp the presence row so that device auto-engages voice.
 *
 * In-memory + ephemeral by design: the window is sub-second, so nothing needs to
 * survive a restart (at worst one in-flight race is lost).
 */

const WINDOW_MS = 350; // collect competing detections this long after the first
const DEDUP_MS = 1500; // ignore reports this long after a win (tail of the same phrase)

export interface WakeReport {
    source: string; // device id
    score: number; // wakeword confidence 0..1
    rms: number; // peak loudness of the wake phrase at this device's mic
}

interface Pending extends WakeReport {
    at: number;
}

class WakeArbiter {
    private window: Pending[] | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private lastWinAt = 0;

    /** A device detected the wakeword. Joins (or opens) the current race window. */
    report(r: WakeReport): void {
        const now = Date.now();
        if (now - this.lastWinAt < DEDUP_MS) return; // still the tail of the last utterance
        const rep: Pending = { ...r, at: now };
        if (!this.window) {
            this.window = [rep];
            this.timer = setTimeout(() => void this.resolve(), WINDOW_MS);
        } else {
            this.window.push(rep);
        }
    }

    private async resolve(): Promise<void> {
        const reports = this.window ?? [];
        this.window = null;
        this.timer = null;
        if (!reports.length) return;

        // Keep the loudest report per device (a device won't normally double-fire, but
        // be safe), then drop phones + anything not currently online.
        const byDevice = new Map<string, Pending>();
        for (const r of reports) {
            const cur = byDevice.get(r.source);
            if (!cur || r.rms > cur.rms) byDevice.set(r.source, r);
        }
        const online = await Device.listOnline();
        const kindOf = new Map(online.map((d) => [d.id, d.kind]));
        const candidates = [...byDevice.values()].filter((r) => {
            const k = kindOf.get(r.source);
            return k !== undefined && !PHONE_KINDS.has(k);
        });
        if (!candidates.length) return;

        // Loudness decides; confidence breaks ties.
        candidates.sort((a, b) => b.rms - a.rms || b.score - a.score);
        const winner = candidates[0];
        this.lastWinAt = Date.now();
        await Presence.set(winner.source, { wake: true });
        console.log(
            `[wake] winner ${winner.source} rms=${winner.rms.toFixed(0)} score=${winner.score.toFixed(2)} ` +
                `over ${candidates.map((c) => `${c.source}:${c.rms.toFixed(0)}`).join(' ')}`,
        );
    }
}

export const wakeArbiter = new WakeArbiter();
