import { get, post, patch, del } from './helpers';

/** Eight slots around the orb, 0 at twelve o'clock going clockwise. */
export const SLOTS = 8;

export type ActionKind = 'builtin' | 'http' | 'shell' | 'prompt' | 'agent';
export type ActionStatus = 'ready' | 'drafting' | 'testing' | 'failed';

export interface DialAction {
    id: string;
    slot: number;
    label: string;
    icon: string;
    kind: ActionKind;
    body: string;
    confirm: boolean;
    status: ActionStatus;
    draft_log: string;
    cwd: string;
    last_run_at: number;
    created_at: number;
    updated_at: number;
}

/** One rendered position on the dial: a builtin the Field owns or a custom action. */
export interface Wedge {
    /** Action id for custom wedges; the builtin key for built-ins. */
    id: string;
    label: string;
    icon: string;
    custom: boolean;
    /** Renders the wedge filled, for capabilities that are currently on. */
    on?: boolean;
    /** Needs a second press before it fires. */
    confirm?: boolean;
    /** Nero is still building this one, or couldn't. */
    status?: ActionStatus;
}

export interface ActionParam {
    key: string;
    label: string;
    description: string;
    default?: string;
    required?: boolean;
    options?: string[];
}

/** A catalogue template. `available` is false when a secret it needs isn't set yet. */
export interface ActionTemplate {
    id: string;
    provider: string;
    label: string;
    icon: string;
    description: string;
    kind: ActionKind;
    requiredSecrets: string[];
    params: ActionParam[];
    confirm?: boolean;
    available: boolean;
    missing: string[];
}

export interface ActionProvider {
    id: string;
    name: string;
    description: string;
    secretHints: Record<string, string>;
}

export async function loadCatalog(): Promise<{
    templates: ActionTemplate[];
    providers: ActionProvider[];
}> {
    const r = await get<{ templates: ActionTemplate[]; providers: ActionProvider[] }>(
        '/v1/actions/catalog',
    );
    return r.success ? r.data : { templates: [], providers: [] };
}

export function bindTemplate(input: {
    template: string;
    slot: number;
    label?: string;
    params?: Record<string, string>;
}) {
    return post<{ action: DialAction; missingSecrets?: string[] }>(
        '/v1/actions/from-template',
        input,
    );
}

export interface ActionResult {
    ok: boolean;
    output: string;
    builtin?: string;
}

export async function listActions(): Promise<DialAction[]> {
    const r = await get<{ actions: DialAction[] }>('/v1/actions');
    return r.success ? r.data.actions : [];
}

export function createAction(input: {
    label: string;
    kind: ActionKind;
    body: string;
    icon?: string;
    slot?: number;
    confirm?: boolean;
    cwd?: string;
}) {
    return post<DialAction>('/v1/actions', input);
}

export function updateAction(id: string, patchBody: Partial<DialAction>) {
    return patch<DialAction>(`/v1/actions/${id}`, patchBody);
}

/** Bind an existing action to a slot, or -1 to unassign it. It stays in the library
 *  either way; only deleteAction removes it. */
export function assignAction(id: string, slot: number) {
    return patch<DialAction>(`/v1/actions/${id}`, { slot });
}

export function deleteAction(id: string) {
    return del<{ ok: boolean }>(`/v1/actions/${id}`);
}

/** Hand a slot to Nero: he drafts, runs it for real, and binds it. Returns false if
 *  the request didn't land, so the UI can say so instead of looking inert. */
export async function authorAction(goal: string, slot: number): Promise<boolean> {
    const r = await post<{ started?: boolean }>('/v1/actions/author', { goal, slot });
    return r.success;
}

export async function runAction(id: string): Promise<ActionResult> {
    const r = await post<ActionResult>(`/v1/actions/${id}/run`);
    return r.success ? r.data : { ok: false, output: r.error.message };
}
