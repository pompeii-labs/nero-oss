import { Secret } from '../models/secret';

/** OAuth config for a built-in integration. The api owns the flow; the server is dumb. */
export interface IntegrationOAuth {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    /** Vault secret keys holding the user's OAuth client id + secret. */
    clientIdKey: string;
    clientSecretKey: string;
    /** Env var the (dumb) server reads for the access token, injected at connect. */
    tokenEnvVar: string;
}

/** A built-in integration: an MCP server that lights up when its secrets are present. */
export interface Integration {
    id: string;
    name: string;
    description: string;
    /** All must be set (non-placeholder) for the integration to auto-wire. */
    requiredSecrets: string[];
    /** How to spawn the bundled server (in-process stdio by default). */
    server: { command: string; args: string[] };
    oauth?: IntegrationOAuth;
}

export type IntegrationStatus = 'needs-secret' | 'needs-auth' | 'connected';

const googleServer = new URL('./servers/google/index.ts', import.meta.url).pathname;

export const CATALOG: Integration[] = [
    {
        id: 'google',
        name: 'Google (Gmail + Calendar)',
        description:
            'Search/read Gmail, draft + send email with explicit approval, read + create Google Calendar events.',
        requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        server: { command: 'bun', args: [googleServer] },
        oauth: {
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: [
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar.events',
            ],
            clientIdKey: 'GOOGLE_CLIENT_ID',
            clientSecretKey: 'GOOGLE_CLIENT_SECRET',
            tokenEnvVar: 'GOOGLE_ACCESS_TOKEN',
        },
    },
];

export function getIntegration(id: string): Integration | undefined {
    return CATALOG.find((i) => i.id === id);
}

/** Which required secrets are still missing (empty/placeholder). */
export async function missingSecrets(integ: Integration): Promise<string[]> {
    const vault = await Secret.loadMap();
    return integ.requiredSecrets.filter((k) => !vault[k]);
}

export async function secretsSatisfied(integ: Integration): Promise<boolean> {
    return (await missingSecrets(integ)).length === 0;
}
