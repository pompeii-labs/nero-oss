<script lang="ts">
    let { component, resolvedContent = '' }: {
        component: any;
        resolvedContent?: string;
    } = $props();

    const variantClasses: Record<string, string> = {
        heading: 'text-lg font-semibold text-foreground',
        body: 'text-sm text-foreground/80',
        caption: 'text-xs text-foreground/50',
        mono: 'text-sm font-mono text-foreground/70',
    };

    const isMono = $derived(component.variant === 'mono');

    const ANSI_COLORS: Record<number, string> = {
        30: '#4a4a4a', 31: '#e06c75', 32: '#98c379', 33: '#e5c07b',
        34: '#61afef', 35: '#c678dd', 36: '#56b6c2', 37: '#abb2bf',
        90: '#5c6370', 91: '#e06c75', 92: '#98c379', 93: '#e5c07b',
        94: '#61afef', 95: '#c678dd', 96: '#56b6c2', 97: '#ffffff',
    };

    const ANSI_256: string[] = (() => {
        const colors: string[] = [];
        const base = [0,95,135,175,215,255];
        colors.push('#000000','#e06c75','#98c379','#e5c07b','#61afef','#c678dd','#56b6c2','#abb2bf');
        colors.push('#5c6370','#e06c75','#98c379','#e5c07b','#61afef','#c678dd','#56b6c2','#ffffff');
        for (let r = 0; r < 6; r++)
            for (let g = 0; g < 6; g++)
                for (let b = 0; b < 6; b++)
                    colors.push(`rgb(${base[r]},${base[g]},${base[b]})`);
        for (let i = 0; i < 24; i++) {
            const v = 8 + i * 10;
            colors.push(`rgb(${v},${v},${v})`);
        }
        return colors;
    })();

    function escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function ansiToHtml(text: string): string {
        const re = /\x1b\[([0-9;]*)m/g;
        let result = '';
        let last = 0;
        let fg = '';
        let bold = false;
        let dim = false;
        let spanOpen = false;

        for (const match of text.matchAll(re)) {
            if (match.index! > last) {
                const chunk = escapeHtml(text.slice(last, match.index));
                if (chunk) {
                    if (spanOpen) result += '</span>';
                    const styles: string[] = [];
                    if (fg) styles.push(`color:${fg}`);
                    if (bold) styles.push('font-weight:bold');
                    if (dim) styles.push('opacity:0.6');
                    if (styles.length > 0) {
                        result += `<span style="${styles.join(';')}">${chunk}`;
                        spanOpen = true;
                    } else {
                        result += chunk;
                        spanOpen = false;
                    }
                }
            }
            last = match.index! + match[0].length;

            const params = match[1].split(';').map(Number);
            let i = 0;
            while (i < params.length) {
                const p = params[i];
                if (p === 0) { fg = ''; bold = false; dim = false; }
                else if (p === 1) bold = true;
                else if (p === 2) dim = true;
                else if (p === 22) { bold = false; dim = false; }
                else if (p === 39) fg = '';
                else if (p >= 30 && p <= 37) fg = ANSI_COLORS[p] || '';
                else if (p >= 90 && p <= 97) fg = ANSI_COLORS[p] || '';
                else if (p === 38 && params[i + 1] === 5) {
                    fg = ANSI_256[params[i + 2]] || '';
                    i += 2;
                }
                i++;
            }
        }

        if (last < text.length) {
            const chunk = escapeHtml(text.slice(last));
            if (spanOpen) result += '</span>';
            if (fg || bold || dim) {
                const styles: string[] = [];
                if (fg) styles.push(`color:${fg}`);
                if (bold) styles.push('font-weight:bold');
                if (dim) styles.push('opacity:0.6');
                result += `<span style="${styles.join(';')}">${chunk}</span>`;
            } else {
                result += chunk;
            }
        } else if (spanOpen) {
            result += '</span>';
        }

        return result;
    }

    const hasAnsi = $derived(resolvedContent.includes('\x1b['));
    const renderedHtml = $derived(hasAnsi ? ansiToHtml(resolvedContent) : '');
</script>

{#if isMono}
    {#if hasAnsi}
        <pre class="whitespace-pre-wrap break-words m-0 bg-foreground/5 rounded-md p-2 max-h-96 overflow-auto text-sm font-mono text-foreground/70">{@html renderedHtml}</pre>
    {:else}
        <pre class="whitespace-pre-wrap break-words m-0 bg-foreground/5 rounded-md p-2 max-h-96 overflow-auto text-sm font-mono text-foreground/70">{resolvedContent}</pre>
    {/if}
{:else}
    <p class={variantClasses[component.variant || 'body']}>
        {resolvedContent}
    </p>
{/if}
