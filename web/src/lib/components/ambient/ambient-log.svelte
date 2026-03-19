<script lang="ts">
    interface LogEntry {
        ts: number;
        type: 'tool' | 'session_start' | 'session_end';
        text: string;
    }

    interface Props {
        entries: LogEntry[];
    }

    let { entries }: Props = $props();

    function formatTime(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    function label(type: LogEntry['type']): string {
        if (type === 'session_start') return 'SES';
        if (type === 'session_end') return 'END';
        return 'RUN';
    }
</script>

<div class="log-root">
    <div class="log-inner">
        {#each entries as entry (entry.ts + entry.text)}
            <p
                class="log-line"
                class:session={entry.type === 'session_start' || entry.type === 'session_end'}
            >
                <span class="log-ts">{formatTime(entry.ts)}</span>
                <span class="log-label">{label(entry.type)}</span>
                <span class="log-text">{entry.text}</span>
            </p>
        {/each}
    </div>
</div>

<style>
    .log-root {
        max-height: 180px;
        overflow: hidden;
        pointer-events: none;
        mask-image: linear-gradient(to bottom, transparent 0%, black 40%);
        -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 40%);
    }

    .log-inner {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 100%;
    }

    .log-line {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 11px;
        line-height: 1.6;
        color: var(--foreground, #e0e5ed);
        opacity: 0.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .log-line.session {
        opacity: 0.5;
        color: var(--nero-blue, #4d94ff);
    }

    .log-ts {
        color: var(--muted-foreground, #6b7a8d);
        margin-right: 10px;
    }

    .log-label {
        display: inline-block;
        width: 3ch;
        text-align: right;
        margin-right: 10px;
        color: var(--muted-foreground, #6b7a8d);
    }

    .log-line.session .log-ts,
    .log-line.session .log-label {
        color: var(--nero-blue, #4d94ff);
    }

    .log-text {
        color: inherit;
    }
</style>
