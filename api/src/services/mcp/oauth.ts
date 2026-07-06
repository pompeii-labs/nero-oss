import { randomBytes, createHash } from 'crypto';

// MCP OAuth 2.1: well-known discovery, Dynamic Client Registration, PKCE, code
// exchange, refresh. Ported from OG Nero, de-CLI'd (the web drives the browser
// redirect + callback). Pure functions; no logging side effects beyond errors.

export interface OAuthProtectedResourceMetadata {
    resource: string;
    authorization_servers: string[];
    bearer_methods_supported?: string[];
    resource_documentation?: string;
    scopes_supported?: string[];
}

export interface OAuthAuthorizationServerMetadata {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    scopes_supported?: string[];
    response_types_supported?: string[];
    code_challenge_methods_supported?: string[];
    grant_types_supported?: string[];
}

export interface OAuthClientRegistration {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
    token_endpoint_auth_method?: string;
    grant_types?: string[];
    response_types?: string[];
    client_name?: string;
}

export interface OAuthTokens {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    issued_at?: number;
}

export interface StoredOAuthData {
    serverUrl: string;
    clientRegistration: OAuthClientRegistration;
    tokens?: OAuthTokens;
    authServerMetadata: OAuthAuthorizationServerMetadata;
}

function codeVerifier(): string {
    return randomBytes(32).toString('base64url');
}
function codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}
function randomState(): string {
    return randomBytes(16).toString('base64url');
}

/** Discover an MCP server's OAuth metadata via the .well-known endpoints. */
export async function discoverOAuthMetadata(serverUrl: string): Promise<{
    resource?: OAuthProtectedResourceMetadata;
    authServer?: OAuthAuthorizationServerMetadata;
} | null> {
    try {
        const baseUrl = new URL(serverUrl);
        let resource: OAuthProtectedResourceMetadata | undefined;
        let authServer: OAuthAuthorizationServerMetadata | undefined;

        const rRes = await fetch(
            new URL('/.well-known/oauth-protected-resource', baseUrl).toString(),
        );
        if (rRes.ok) resource = await rRes.json();

        if (resource?.authorization_servers?.length) {
            const a = resource.authorization_servers[0];
            const metaUrl = a.includes('/.well-known/')
                ? a
                : new URL('/.well-known/oauth-authorization-server', new URL(a)).toString();
            const aRes = await fetch(metaUrl);
            if (aRes.ok) authServer = await aRes.json();
        }

        if (!authServer) {
            const aRes = await fetch(
                new URL('/.well-known/oauth-authorization-server', baseUrl).toString(),
            );
            if (aRes.ok) authServer = await aRes.json();
        }

        if (!resource && !authServer) return null;
        return { resource, authServer };
    } catch {
        return null;
    }
}

/** Dynamic Client Registration. Returns null if the server doesn't support it. */
export async function registerClient(
    authServer: OAuthAuthorizationServerMetadata,
    clientName: string,
    redirectUri: string,
): Promise<OAuthClientRegistration | null> {
    if (!authServer.registration_endpoint) return null;
    try {
        const res = await fetch(authServer.registration_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name: clientName,
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            }),
        });
        if (!res.ok) {
            console.error('[mcp:oauth] client registration failed:', await res.text());
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error('[mcp:oauth] client registration error:', e);
        return null;
    }
}

export interface AuthorizationResult {
    codeVerifier: string;
    state: string;
    authUrl: string;
}

export function buildAuthorizationUrl(params: {
    authServer: OAuthAuthorizationServerMetadata;
    clientId: string;
    redirectUri: string;
    scope?: string;
}): AuthorizationResult {
    const verifier = codeVerifier();
    const challenge = codeChallenge(verifier);
    const state = randomState();

    const url = new URL(params.authServer.authorization_endpoint);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (params.scope) url.searchParams.set('scope', params.scope);

    return { codeVerifier: verifier, state, authUrl: url.toString() };
}

export async function exchangeCodeForTokens(
    authServer: OAuthAuthorizationServerMetadata,
    clientId: string,
    code: string,
    verifier: string,
    redirectUri: string,
): Promise<OAuthTokens | null> {
    try {
        const res = await fetch(authServer.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code,
                code_verifier: verifier,
                redirect_uri: redirectUri,
            }).toString(),
        });
        if (!res.ok) {
            console.error('[mcp:oauth] token exchange failed:', await res.text());
            return null;
        }
        const tokens: OAuthTokens = await res.json();
        tokens.issued_at = Date.now();
        return tokens;
    } catch (e) {
        console.error('[mcp:oauth] token exchange error:', e);
        return null;
    }
}

export async function refreshAccessToken(
    authServer: OAuthAuthorizationServerMetadata,
    clientId: string,
    refreshToken: string,
): Promise<OAuthTokens | null> {
    try {
        const res = await fetch(authServer.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: refreshToken,
            }).toString(),
        });
        if (!res.ok) {
            console.error('[mcp:oauth] token refresh failed:', await res.text());
            return null;
        }
        const tokens: OAuthTokens = await res.json();
        tokens.issued_at = Date.now();
        if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
        return tokens;
    } catch (e) {
        console.error('[mcp:oauth] token refresh error:', e);
        return null;
    }
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
    if (!tokens.expires_in || !tokens.issued_at) return false;
    const expiresAt = tokens.issued_at + tokens.expires_in * 1000;
    return Date.now() > expiresAt - 60_000;
}
