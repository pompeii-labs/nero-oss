import type { MagmaUtilities, MagmaToolParam } from '@pompeii-labs/magma/types';
import { getMcpClient } from './client';

type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';

interface JsonSchema {
    type?: string | string[];
    description?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    required?: string[];
    enum?: unknown[];
}

function mapType(t: unknown): ParamType {
    if (t === 'integer') return 'number';
    if (t === 'number' || t === 'boolean' || t === 'object' || t === 'array' || t === 'string')
        return t;
    return 'string';
}

/** Recursively convert a JSON-Schema node to a Magma param. Object params always
 *  get a `properties` array, array params always get `items` (Magma requires
 *  both), so MCP tools with under-specified schemas don't blow up convertTools. */
function convertSchema(schema: JsonSchema): MagmaToolParam {
    const rawType = Array.isArray(schema.type)
        ? schema.type.find((t) => t !== 'null')
        : schema.type;
    const type = mapType(rawType);

    if (type === 'object') {
        const props = schema.properties ?? {};
        const required = new Set(schema.required ?? []);
        return {
            type: 'object',
            description: schema.description,
            properties: Object.entries(props).map(([k, sub]) => ({
                key: k,
                required: required.has(k),
                ...convertSchema(sub),
            })),
        } as MagmaToolParam;
    }

    if (type === 'array') {
        return {
            type: 'array',
            description: schema.description,
            items: convertSchema(schema.items ?? { type: 'string' }),
        } as MagmaToolParam;
    }

    const base: Record<string, unknown> = { type, description: schema.description };
    if (type === 'string' && Array.isArray(schema.enum)) base.enum = schema.enum;
    return base as MagmaToolParam;
}

function schemaToParams(schema: unknown): MagmaToolParam[] {
    const s = schema as JsonSchema;
    if (!s || typeof s !== 'object' || !s.properties) return [];
    const required = new Set(s.required ?? []);
    return Object.entries(s.properties).map(([k, sub]) => ({
        key: k,
        required: required.has(k),
        ...convertSchema(sub),
    })) as MagmaToolParam[];
}

/**
 * Bridge connected MCP servers' tools into Magma tools at runtime. Tool names are
 * namespaced `<server>_<tool>`; calls dispatch to the live MCP client. Any tool
 * whose schema can't be converted is skipped rather than breaking the whole set.
 */
/** Provider tool names must match ^[a-zA-Z0-9_-]{1,64}$ (Anthropic/OpenAI), so
 *  replace illegal chars (dots from aggregators like Smithery) and bound length. */
function sanitizeName(raw: string, used: Set<string>): string {
    let name = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    if (used.has(name)) {
        let i = 2;
        let candidate = `${name.slice(0, 61)}_${i}`;
        while (used.has(candidate)) candidate = `${name.slice(0, 61)}_${++i}`;
        name = candidate;
    }
    used.add(name);
    return name;
}

export function mcpUtilities(): MagmaUtilities {
    const client = getMcpClient();
    const tools = [];
    const used = new Set<string>();
    for (const t of client.getTools()) {
        try {
            tools.push({
                name: sanitizeName(`${t.server}_${t.name}`, used),
                description: t.description ?? `MCP tool ${t.name} on ${t.server}`,
                params: schemaToParams(t.inputSchema),
                target: async (call: { fn_args?: Record<string, unknown> }) =>
                    client.callTool(t.server, t.name, call.fn_args ?? {}),
                enabled: () => true,
            });
        } catch (e) {
            console.error(`[mcp] skipping tool ${t.server}_${t.name}:`, e);
        }
    }
    return { tools, middleware: [], hooks: [], jobs: [] } as unknown as MagmaUtilities;
}
