import { env } from '$env/dynamic/public';

export function getServerUrl(route: string = ''): string {
    const baseUrl = env.PUBLIC_NERO_SERVER_URL || 'http://localhost:4848';
    return `${baseUrl}${route}`;
}

export type NeroResult<T> =
    | { success: true; data: T }
    | { success: false; error: { message: string; status?: number } };

async function request<T>(path: string, options: RequestInit = {}): Promise<NeroResult<T>> {
    try {
        const res = await fetch(getServerUrl(path), {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Request failed');
            return { success: false, error: { message: errorText, status: res.status } };
        }
        const data = await res.json();
        return { success: true, data };
    } catch (err) {
        return {
            success: false,
            error: { message: err instanceof Error ? err.message : 'Request failed' },
        };
    }
}

export function get<T>(path: string): Promise<NeroResult<T>> {
    return request<T>(path, { method: 'GET' });
}

export function post<T>(path: string, body?: unknown): Promise<NeroResult<T>> {
    return request<T>(path, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

export function put<T>(path: string, body?: unknown): Promise<NeroResult<T>> {
    return request<T>(path, {
        method: 'PUT',
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

export function del<T>(path: string): Promise<NeroResult<T>> {
    return request<T>(path, { method: 'DELETE' });
}
