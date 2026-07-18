import { DataModel } from './datamodel';
import { getLux, unwrap } from '@nero/shared/lux';

export interface PushTokenData {
    id: string;
    token: string;
    platform: string;
    bundle_id: string | null;
    created_at: number;
}

/** A device's APNs (or other platform) push token, registered by the native app. */
export class PushToken extends DataModel<PushTokenData> {
    static readonly tableName = 'push_tokens';

    token!: string;
    platform!: string;
    bundle_id!: string | null;
    created_at!: number;

    constructor(data: PushTokenData) {
        super();
        Object.assign(this, data);
    }

    /** Idempotent: a device re-registers the same token on every launch. */
    static async register(token: string, platform = 'ios', bundleId?: string): Promise<void> {
        const rows = unwrap(
            await getLux().table('push_tokens').select().eq('token', token).limit(1),
        ) as unknown[];
        if (rows.length) return;
        unwrap(
            await getLux()
                .table('push_tokens')
                .insert({ token, platform, bundle_id: bundleId ?? null } as never),
        );
    }

    static async all(): Promise<PushToken[]> {
        const rows = unwrap(await getLux().table('push_tokens').select()) as PushTokenData[];
        return rows.map((r) => new PushToken(r));
    }

    static async remove(token: string): Promise<void> {
        unwrap(await getLux().table('push_tokens').delete().eq('token', token));
    }
}
