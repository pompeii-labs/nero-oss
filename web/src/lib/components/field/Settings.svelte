<script lang="ts">
    import { get, post, del } from '$lib/actions/helpers';

    let { open = $bindable(false) }: { open?: boolean } = $props();

    type Tab = 'secrets' | 'mcp';
    let tab = $state<Tab>('secrets');

    type SecretMeta = {
        key: string;
        isPlaceholder: boolean;
        description: string | null;
        updatedAt: number;
    };
    let secrets = $state<SecretMeta[]>([]);
    let secretVals = $state<Record<string, string>>({});
    let newSecretKey = $state('');
    let newSecretVal = $state('');

    type Mcp = {
        name: string;
        url: string;
        transport: string;
        connected: boolean;
        hasAuth: boolean;
        tools: string[];
    };
    let integrations = $state<Mcp[]>([]);
    let mcpName = $state('');
    let mcpUrl = $state('');
    let mcpKey = $state('');
    let busy = $state('');

    async function loadSecrets() {
        const r = await get<{ secrets: SecretMeta[] }>('/v1/secrets');
        if (r.success) secrets = r.data.secrets;
    }
    async function loadMcp() {
        const r = await get<{ integrations: Mcp[] }>('/v1/mcp/list');
        if (r.success) integrations = r.data.integrations;
    }
    $effect(() => {
        if (open) {
            void loadSecrets();
            void loadMcp();
        }
    });

    async function saveSecret(key: string) {
        const value = secretVals[key] ?? '';
        if (!value.trim()) return;
        busy = 'secret:' + key;
        await post('/v1/secrets', { key, value });
        secretVals[key] = '';
        await loadSecrets();
        busy = '';
    }
    async function addSecret() {
        const key = newSecretKey
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_');
        if (!key || !newSecretVal.trim()) return;
        await post('/v1/secrets', { key, value: newSecretVal });
        newSecretKey = '';
        newSecretVal = '';
        await loadSecrets();
    }
    async function removeSecret(key: string) {
        await del('/v1/secrets/' + encodeURIComponent(key));
        await loadSecrets();
    }

    async function connectMcp() {
        if (!mcpName.trim() || !mcpUrl.trim()) return;
        busy = 'mcp-connect';
        const r = await post<{ status?: string; authUrl?: string }>('/v1/mcp/connect', {
            name: mcpName.trim(),
            url: mcpUrl.trim(),
            apiKey: mcpKey.trim() || undefined,
        });
        if (r.success && r.data.status === 'auth_required' && r.data.authUrl) {
            window.open(r.data.authUrl, '_blank');
        }
        mcpName = mcpUrl = mcpKey = '';
        await loadMcp();
        busy = '';
    }
    async function mcpAction(name: string, action: 'disconnect' | 'reconnect') {
        busy = 'mcp:' + name;
        await post('/v1/mcp/' + action, { name });
        await loadMcp();
        busy = '';
    }
</script>

{#if open}
    <div
        class="scrim"
        onclick={() => (open = false)}
        onkeydown={(e) => e.key === 'Escape' && (open = false)}
        role="presentation"
    ></div>
    <aside class="settings" data-theme="obsidian">
        <header class="s-head">
            <span class="s-title">Settings</span>
            <button class="s-close" onclick={() => (open = false)} aria-label="Close settings">✕</button>
        </header>
        <nav class="s-nav">
            <button class:active={tab === 'secrets'} onclick={() => (tab = 'secrets')}>Secrets</button>
            <button class:active={tab === 'mcp'} onclick={() => (tab = 'mcp')}>MCP</button>
        </nav>

        <div class="s-body">
            {#if tab === 'secrets'}
                {#if secrets.length === 0}<p class="s-empty">No secrets yet.</p>{/if}
                {#each secrets as s (s.key)}
                    <div class="s-item" class:placeholder={s.isPlaceholder}>
                        <div class="s-item-head">
                            <span class="s-key">{s.key}</span>
                            <span class="s-status" class:need={s.isPlaceholder}>
                                {s.isPlaceholder ? 'needs value' : 'set'}
                            </span>
                            <button class="s-del" onclick={() => removeSecret(s.key)} aria-label="Delete">✕</button>
                        </div>
                        {#if s.description}<p class="s-desc">{s.description}</p>{/if}
                        <div class="s-row">
                            <input
                                type="password"
                                placeholder={s.isPlaceholder ? 'paste value…' : 'update value…'}
                                bind:value={secretVals[s.key]}
                                onkeydown={(e) => e.key === 'Enter' && saveSecret(s.key)}
                            />
                            <button disabled={busy === 'secret:' + s.key} onclick={() => saveSecret(s.key)}>save</button>
                        </div>
                    </div>
                {/each}
                <div class="s-item add">
                    <div class="s-row">
                        <input placeholder="NEW_SECRET_NAME" bind:value={newSecretKey} />
                    </div>
                    <div class="s-row">
                        <input type="password" placeholder="value" bind:value={newSecretVal} />
                        <button onclick={addSecret}>add</button>
                    </div>
                </div>
            {:else}
                {#if integrations.length === 0}<p class="s-empty">No MCP servers connected.</p>{/if}
                {#each integrations as m (m.name)}
                    <div class="s-item">
                        <div class="s-item-head">
                            <span class="s-key">{m.name}</span>
                            <span class="s-status" class:on={m.connected}>
                                {m.connected ? `${m.tools.length} tools` : 'offline'}
                            </span>
                        </div>
                        <p class="s-desc">{m.url}</p>
                        <div class="s-row end">
                            {#if m.connected}
                                <button disabled={busy === 'mcp:' + m.name} onclick={() => mcpAction(m.name, 'disconnect')}>disconnect</button>
                            {:else}
                                <button disabled={busy === 'mcp:' + m.name} onclick={() => mcpAction(m.name, 'reconnect')}>reconnect</button>
                            {/if}
                        </div>
                    </div>
                {/each}
                <div class="s-item add">
                    <div class="s-row"><input placeholder="name" bind:value={mcpName} /></div>
                    <div class="s-row"><input placeholder="https://server/mcp" bind:value={mcpUrl} /></div>
                    <div class="s-row">
                        <input type="password" placeholder="api key (optional)" bind:value={mcpKey} />
                        <button disabled={busy === 'mcp-connect'} onclick={connectMcp}>connect</button>
                    </div>
                </div>
            {/if}
        </div>
    </aside>
{/if}

<style>
    .scrim {
        position: fixed;
        inset: 0;
        z-index: 90;
        background: rgb(0 0 0 / 0.45);
        backdrop-filter: blur(2px);
        animation: fade 0.2s ease;
    }
    .settings {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 91;
        width: min(420px, 92vw);
        display: flex;
        flex-direction: column;
        background: var(--panel-bg);
        backdrop-filter: blur(18px) saturate(1.1);
        border-left: 1px solid rgb(var(--holo) / 0.14);
        box-shadow: -30px 0 80px rgb(0 0 0 / 0.5);
        color: var(--text);
        animation: slide 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes slide {
        from {
            transform: translateX(100%);
        }
    }
    @keyframes fade {
        from {
            opacity: 0;
        }
    }
    .s-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid rgb(var(--holo) / 0.08);
    }
    .s-title {
        font-family: var(--font-display);
        font-size: 20px;
        letter-spacing: 0.01em;
    }
    .s-close {
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        font-size: 14px;
        padding: 4px 8px;
        border-radius: 6px;
    }
    .s-close:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.08);
    }
    .s-nav {
        display: flex;
        gap: 4px;
        padding: 10px 16px 0;
    }
    .s-nav button {
        background: none;
        border: none;
        color: var(--text-faint);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        padding: 7px 12px;
        border-radius: 7px 7px 0 0;
        border-bottom: 1.5px solid transparent;
    }
    .s-nav button:hover {
        color: var(--text-dim);
    }
    .s-nav button.active {
        color: rgb(var(--holo-soft));
        border-bottom-color: rgb(var(--holo) / 0.6);
    }
    .s-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .s-empty {
        color: var(--text-faint);
        font-family: var(--font-mono);
        font-size: 12px;
        text-align: center;
        padding: 24px 0;
    }
    .s-item {
        border: 1px solid rgb(var(--holo) / 0.1);
        border-radius: 10px;
        padding: 12px 13px;
        background: rgb(var(--holo) / 0.02);
    }
    .s-item.placeholder {
        border-color: rgb(var(--holo2) / 0.35);
        background: rgb(var(--holo2) / 0.04);
    }
    .s-item.add {
        border-style: dashed;
        border-color: rgb(var(--holo) / 0.16);
        background: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .s-item-head {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .s-key {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--text);
        font-weight: 500;
        flex: 1;
        word-break: break-all;
    }
    .s-status {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-faint);
        border: 1px solid rgb(var(--holo) / 0.15);
        border-radius: 20px;
        padding: 2px 8px;
        white-space: nowrap;
    }
    .s-status.need {
        color: rgb(var(--holo2));
        border-color: rgb(var(--holo2) / 0.4);
    }
    .s-status.on {
        color: rgb(var(--holo-soft));
        border-color: rgb(var(--holo) / 0.4);
    }
    .s-del {
        background: none;
        border: none;
        color: var(--text-faint);
        cursor: pointer;
        font-size: 11px;
        padding: 2px 4px;
    }
    .s-del:hover {
        color: rgb(var(--holo2));
    }
    .s-desc {
        color: var(--text-dim);
        font-size: 12px;
        line-height: 1.45;
        margin: 8px 0 10px;
    }
    .s-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
    }
    .s-row.end {
        justify-content: flex-end;
    }
    .s-row input {
        flex: 1;
        min-width: 0;
        background: rgb(0 0 0 / 0.25);
        border: 1px solid rgb(var(--holo) / 0.14);
        border-radius: 7px;
        color: var(--text);
        font-family: var(--font-mono);
        font-size: 12px;
        padding: 8px 10px;
        outline: none;
    }
    .s-row input:focus {
        border-color: rgb(var(--holo) / 0.4);
    }
    .s-row button {
        background: rgb(var(--holo) / 0.1);
        border: 1px solid rgb(var(--holo) / 0.28);
        border-radius: 7px;
        color: rgb(var(--holo-soft));
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        cursor: pointer;
        padding: 8px 14px;
        white-space: nowrap;
    }
    .s-row button:hover:not(:disabled) {
        background: rgb(var(--holo) / 0.18);
    }
    .s-row button:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
