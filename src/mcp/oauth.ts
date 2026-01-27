import { randomBytes, createHash } from 'crypto';
import { spawn } from 'child_process';
import chalk from 'chalk';

export interface OAuthProtectedResourceMetadata {
    resource: string;
    authorization_servers: string[];
    bearer_methods_supported?: string[];
    resource_documentation?: string;
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
    client_id_issued_at?: number;
    client_secret_expires_at?: number;
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

function generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
    return randomBytes(16).toString('base64url');
}

export async function discoverOAuthMetadata(
    serverUrl: string
): Promise<{ resource?: OAuthProtectedResourceMetadata; authServer?: OAuthAuthorizationServerMetadata } | null> {
    try {
        const baseUrl = new URL(serverUrl);
        const resourceUrl = new URL('/.well-known/oauth-protected-resource', baseUrl);

        const resourceResponse = await fetch(resourceUrl.toString());
        if (!resourceResponse.ok) {
            return null;
        }

        const resourceMetadata: OAuthProtectedResourceMetadata = await resourceResponse.json();

        if (!resourceMetadata.authorization_servers || resourceMetadata.authorization_servers.length === 0) {
            console.log(chalk.yellow('No authorization servers found in resource metadata'));
            return { resource: resourceMetadata };
        }

        const authServerUrl = resourceMetadata.authorization_servers[0];
        let authServerMetadataUrl: string;

        if (authServerUrl.includes('/.well-known/')) {
            authServerMetadataUrl = authServerUrl;
        } else {
            const authBase = new URL(authServerUrl);
            authServerMetadataUrl = new URL('/.well-known/oauth-authorization-server', authBase).toString();
        }

        const authServerResponse = await fetch(authServerMetadataUrl);
        if (!authServerResponse.ok) {
            console.log(chalk.yellow(`Failed to fetch auth server metadata from ${authServerMetadataUrl}`));
            return { resource: resourceMetadata };
        }

        const authServerMetadata: OAuthAuthorizationServerMetadata = await authServerResponse.json();

        return {
            resource: resourceMetadata,
            authServer: authServerMetadata,
        };
    } catch (error) {
        return null;
    }
}

export async function registerClient(
    authServerMetadata: OAuthAuthorizationServerMetadata,
    clientName: string,
    redirectUri: string
): Promise<OAuthClientRegistration | null> {
    if (!authServerMetadata.registration_endpoint) {
        console.log(chalk.yellow('No registration endpoint available'));
        return null;
    }

    try {
        const response = await fetch(authServerMetadata.registration_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_name: clientName,
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.log(chalk.red(`Client registration failed: ${error}`));
            return null;
        }

        return await response.json();
    } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Client registration error: ${err.message}`));
        return null;
    }
}

export interface AuthorizationParams {
    authServerMetadata: OAuthAuthorizationServerMetadata;
    clientId: string;
    redirectUri: string;
    scope?: string;
}

export interface AuthorizationResult {
    codeVerifier: string;
    state: string;
    authUrl: string;
}

export function buildAuthorizationUrl(params: AuthorizationParams): AuthorizationResult {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    const url = new URL(params.authServerMetadata.authorization_endpoint);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    if (params.scope) {
        url.searchParams.set('scope', params.scope);
    }

    return {
        codeVerifier,
        state,
        authUrl: url.toString(),
    };
}

export async function exchangeCodeForTokens(
    authServerMetadata: OAuthAuthorizationServerMetadata,
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string
): Promise<OAuthTokens | null> {
    try {
        const response = await fetch(authServerMetadata.token_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
            }).toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            console.log(chalk.red(`Token exchange failed: ${error}`));
            return null;
        }

        const tokens: OAuthTokens = await response.json();
        tokens.issued_at = Date.now();
        return tokens;
    } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Token exchange error: ${err.message}`));
        return null;
    }
}

export async function refreshAccessToken(
    authServerMetadata: OAuthAuthorizationServerMetadata,
    clientId: string,
    refreshToken: string
): Promise<OAuthTokens | null> {
    try {
        const response = await fetch(authServerMetadata.token_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: refreshToken,
            }).toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            console.log(chalk.red(`Token refresh failed: ${error}`));
            return null;
        }

        const tokens: OAuthTokens = await response.json();
        tokens.issued_at = Date.now();
        return tokens;
    } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Token refresh error: ${err.message}`));
        return null;
    }
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
    if (!tokens.expires_in || !tokens.issued_at) {
        return false;
    }
    const expiresAt = tokens.issued_at + (tokens.expires_in * 1000);
    const bufferMs = 60 * 1000;
    return Date.now() > (expiresAt - bufferMs);
}

export function openBrowser(url: string): void {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
        command = 'open';
        args = [url];
    } else if (platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', url];
    } else {
        command = 'xdg-open';
        args = [url];
    }

    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}
