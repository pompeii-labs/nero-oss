<script lang="ts">
    interface Props {
        card: {
            id: string;
            type: string;
            title: string;
            content: string;
            icon?: string;
            meta?: string;
        } | null;
    }

    let { card }: Props = $props();

    const ICON_MAP: Record<string, string> = {
        'sun': '\u2600\uFE0F',
        'cloud': '\u2601\uFE0F',
        'cloud-rain': '\uD83C\uDF27\uFE0F',
        'snowflake': '\u2744\uFE0F',
        'cloud-lightning': '\u26C8\uFE0F',
        'cloud-sun': '\u26C5',
        'cloud-drizzle': '\uD83C\uDF26\uFE0F',
        'cloud-fog': '\uD83C\uDF2B\uFE0F',
        'brain': '\uD83E\uDDE0',
        'calendar': '\uD83D\uDCC5',
        'newspaper': '\uD83D\uDCF0',
        'bell': '\uD83D\uDD14',
    };

    function getIcon(name?: string): string {
        if (!name) return '\u25CB';
        return ICON_MAP[name] || '\u25CB';
    }
</script>

{#if card}
    {#key card.id}
        <div class="card-wrapper">
            <div class="card-inner">
                <div class="card-content-area">
                    {#if card.icon}
                        <div class="card-icon-wrap">
                            <span class="card-icon">{getIcon(card.icon)}</span>
                        </div>
                    {/if}
                    <div class="card-body">
                        <p class="card-title">{card.title}</p>
                        <p class="card-content">{card.content}</p>
                        {#if card.meta}
                            <p class="card-meta">{card.meta}</p>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/key}
{/if}

<style>
    .card-wrapper {
        position: relative;
        animation: cardEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .card-inner {
        position: relative;
        overflow: hidden;
        border-radius: 12px;
        background: linear-gradient(
            135deg,
            color-mix(in oklch, var(--nero-blue, #4d94ff) 5%, var(--card, #0d1117)),
            var(--card, #0d1117) 50%,
            color-mix(in oklch, var(--nero-cyan, #33ccff) 2%, var(--card, #0d1117))
        );
        backdrop-filter: blur(20px);
        border: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 12%, transparent);
        box-shadow:
            0 0 0 1px color-mix(in oklch, var(--nero-blue, #4d94ff) 3%, transparent) inset,
            0 4px 16px -6px color-mix(in oklch, #030508 60%, transparent);
    }

    .card-content-area {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
    }

    .card-icon-wrap {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in oklch, var(--nero-blue, #4d94ff) 8%, transparent);
        border: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 10%, transparent);
    }

    .card-icon {
        font-size: 20px;
        line-height: 1;
    }

    .card-body {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    .card-title {
        font-size: 10px;
        font-weight: 500;
        color: var(--nero-blue, #4d94ff);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
    }

    .card-content {
        font-size: 22px;
        font-weight: 300;
        color: var(--foreground, #e0e5ed);
        letter-spacing: -0.01em;
        font-family: var(--font-display, 'Fraunces', Georgia, serif);
    }

    .card-meta {
        font-size: 11px;
        font-weight: 400;
        color: var(--muted-foreground, #6b7a8d);
        margin-top: 1px;
    }

    @keyframes cardEnter {
        0% {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
        }
        100% {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
</style>
