import { Secret } from '../../models/secret';
import type { ActionFn, ActionKind } from '../../models/action';
import { LIFX } from './templates/lifx';
import { NATIVE } from './templates/native';
import { GENERIC } from './templates/generic';

/**
 * The action catalogue: templated things a dial slot can become. A provider's
 * templates light up once its secrets are set, mirroring how mcp/catalog.ts gates
 * built-in integrations.
 *
 * Templates carry `${SECRET}` refs and `{{param}}` holes. Instantiating fills the
 * params and leaves the secret refs alone, so a stored action never contains a
 * credential and rotating a token doesn't orphan anything.
 */

export interface ActionParam {
    key: string;
    label: string;
    description: string;
    /** Prefilled when the user doesn't say otherwise. */
    default?: string;
    required?: boolean;
    /** Fixed choices, when the API only accepts a few. */
    options?: string[];
}

export interface ActionTemplate {
    id: string;
    provider: string;
    label: string;
    icon: string;
    description: string;
    kind: Extract<ActionKind, 'http' | 'shell' | 'prompt' | 'agent'>;
    /** All must be set (and not placeholders) for this to be usable. */
    requiredSecrets: string[];
    params: ActionParam[];
    /** Arm-then-fire on the dial. For anything you'd regret double-tapping. */
    confirm?: boolean;
    /** http/shell: the request or command, with `${SECRET}` and `{{param}}`. */
    fn?: ActionFn;
    /** prompt/agent: the message or goal, with `{{param}}`. */
    body?: string;
    /** agent: Nero interviews the user on bind and writes `body` himself. */
    interview?: string;
}

export interface ActionProvider {
    id: string;
    name: string;
    description: string;
    requiredSecrets: string[];
    /** Shown when staging a missing secret, so the user knows where to get it. */
    secretHints: Record<string, string>;
}

export const PROVIDERS: ActionProvider[] = [
    ...LIFX.providers,
    ...NATIVE.providers,
    ...GENERIC.providers,
];

export const TEMPLATES: ActionTemplate[] = [
    ...LIFX.templates,
    ...NATIVE.templates,
    ...GENERIC.templates,
];

export function getTemplate(id: string): ActionTemplate | undefined {
    return TEMPLATES.find((t) => t.id === id);
}

export function getProvider(id: string): ActionProvider | undefined {
    return PROVIDERS.find((p) => p.id === id);
}

/** Which of a template's required secrets are still missing (empty or placeholder).
 *  Same shape as mcp/catalog.ts `missingSecrets`. */
export async function missingSecrets(template: ActionTemplate): Promise<string[]> {
    if (!template.requiredSecrets.length) return [];
    const vault = await Secret.loadMap();
    return template.requiredSecrets.filter((k) => !vault[k]);
}

export interface TemplateStatus extends Omit<ActionTemplate, 'fn'> {
    available: boolean;
    missing: string[];
}

/** The catalogue as the UI and Nero see it: no `fn`, because that's an
 *  implementation detail and can carry secret *names* we'd rather shape ourselves. */
export async function catalogStatus(): Promise<TemplateStatus[]> {
    const vault = await Secret.loadMap();
    return TEMPLATES.map(({ fn: _fn, ...t }) => {
        const missing = t.requiredSecrets.filter((k) => !vault[k]);
        return { ...t, available: missing.length === 0, missing };
    });
}

/** Ask the user for whatever a template needs but doesn't have. Surfaces as a
 *  placeholder in Settings → Secrets with a note on where to get it. */
export async function stageMissing(template: ActionTemplate): Promise<string[]> {
    const missing = await missingSecrets(template);
    const provider = getProvider(template.provider);
    for (const key of missing) {
        await Secret.stage(key, provider?.secretHints[key] ?? `Needed by ${template.label}`);
    }
    return missing;
}

const PARAM_REF = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Fill `{{param}}` holes. Secrets are deliberately NOT resolved here — they stay as
 *  `${NAME}` in the stored action and resolve at run time. */
export function fillParams(input: string, params: Record<string, string>): string {
    return input.replace(PARAM_REF, (_m, key: string) => params[key] ?? '');
}

export function fillFn(fn: ActionFn, params: Record<string, string>): ActionFn {
    if (fn.kind === 'shell') return { kind: 'shell', cmd: fillParams(fn.cmd, params) };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(fn.headers ?? {})) headers[k] = fillParams(v, params);
    return {
        kind: 'http',
        url: fillParams(fn.url, params),
        method: fn.method,
        headers,
        body: fn.body ? fillParams(fn.body, params) : undefined,
    };
}

/** Merge caller-supplied params over the template defaults, and report anything
 *  required that's still empty. */
export function resolveParams(
    template: ActionTemplate,
    supplied: Record<string, string>,
): { params: Record<string, string>; missing: string[] } {
    const params: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of template.params) {
        const value = (supplied[p.key] ?? p.default ?? '').trim();
        params[p.key] = value;
        if (p.required && !value) missing.push(p.key);
    }
    return { params, missing };
}
