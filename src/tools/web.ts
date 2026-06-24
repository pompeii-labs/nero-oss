import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';

export class WebUtility {
    constructor(private tavilyApiKey: string) {}

    @tool({
        name: 'web_search',
        description: 'Search the web for current information, news, docs, or answers to questions.',
    })
    @toolparam({ key: 'query', type: 'string', required: true, description: 'The search query.' })
    async web_search(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const query = String(call.fn_args.query ?? '');
        if (!this.tavilyApiKey) return 'Web search unavailable: TAVILY_API_KEY not set.';
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: this.tavilyApiKey,
                    query,
                    search_depth: 'basic',
                    include_answer: true,
                    max_results: 5,
                }),
            });
            if (!res.ok) return `Search error: Tavily ${res.status}`;
            const data = (await res.json()) as {
                answer?: string;
                results?: Array<{ title: string; url: string; content?: string }>;
            };
            let out = '';
            if (data.answer) out += `**Answer:** ${data.answer}\n\n`;
            if (data.results?.length) {
                out += '**Sources:**\n';
                for (const r of data.results.slice(0, 5)) {
                    out += `- [${r.title}](${r.url})\n  ${r.content?.slice(0, 200) ?? ''}\n`;
                }
            }
            return out || 'No results found.';
        } catch (e) {
            return `Search error: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'fetch_url',
        description: 'Fetch the contents of a URL (text, JSON, or HTML).',
    })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'The URL to fetch.' })
    async fetch_url(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const url = String(call.fn_args.url ?? '');
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Nero/1.0',
                    Accept: 'text/html,application/json,text/plain,*/*',
                },
            });
            if (!res.ok) return `Fetch error: HTTP ${res.status} ${res.statusText}`;
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                return JSON.stringify(await res.json(), null, 2);
            }
            const text = await res.text();
            return text.length > 50_000 ? text.slice(0, 50_000) + '\n\n[truncated at 50KB]' : text;
        } catch (e) {
            return `Fetch error: ${(e as Error).message}`;
        }
    }
}
