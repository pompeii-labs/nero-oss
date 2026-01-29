import { env } from '$env/dynamic/public';

export function getServerUrl(route: string = ''): string {
    const baseUrl = env.PUBLIC_NERO_SERVER_URL || 'http://localhost:4848';
    return `${baseUrl}${route}`;
}

export type ServerResponse<T> = { success: true; data: T } | { success: false; error: string };

export function buildServerResponse<T>(params: { data: T }): ServerResponse<T>;
export function buildServerResponse<T>(params: { error: string }): ServerResponse<T>;
export function buildServerResponse<T>(params: { data: T } | { error: string }): ServerResponse<T> {
    if ('data' in params) {
        return { success: true, data: params.data };
    } else {
        return { success: false, error: params.error };
    }
}
