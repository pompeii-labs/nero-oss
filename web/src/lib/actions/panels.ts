import { post } from './helpers';

export function closePanel(id: string): Promise<unknown> {
    return post(`/v1/panels/${id}/close`);
}

export function movePanel(id: string, geom: { x?: number; y?: number; w?: number; h?: number }) {
    return post(`/v1/panels/${id}/geometry`, geom);
}

export function maximizePanel(id: string, on: boolean): Promise<unknown> {
    return post(`/v1/panels/${id}/maximize`, { on });
}

/** A `call` button -> run one of the panel's named server-side functions (no LLM turn). */
export function callPanel(id: string, fn: string): Promise<unknown> {
    return post(`/v1/panels/${id}/call`, { fn });
}

/** A button press on a panel -> a labeled interaction event Nero receives. */
export function interactPanel(
    id: string,
    payload: { control: string; intent?: string; value?: unknown },
): Promise<unknown> {
    return post(`/v1/panels/${id}/interact`, payload);
}
