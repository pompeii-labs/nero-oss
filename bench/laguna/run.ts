/**
 * Laguna characterization suite for the vigil (always-on proactivity) architecture.
 *
 * Grades the competencies the harness leans on, each run N times for a reliability
 * rate (these are probabilistic, a single pass tells you nothing):
 *   A. json      - strict structured output (blackboard writes must parse)
 *   B. tools     - tool-calling reliability + restraint (act only when needed)
 *   C. salience  - "does this matter?" triage vs a labeled set (attention economy)
 *   D. abstain   - refuses to fabricate when the answer isn't in context (the
 *                  "I was rebooted" confabulation we watched live)
 *
 * Runs against any OpenAI-compatible endpoint. Reads OPENROUTER_API_KEY from env;
 * never logs it. Point BENCH_BASE/BENCH_MODEL elsewhere to compare S vs XS vs local.
 */

const BASE = process.env.BENCH_BASE || 'https://openrouter.ai/api/v1';
const MODEL = process.env.BENCH_MODEL || 'poolside/laguna-s-2.1';
const KEY = process.env.OPENROUTER_API_KEY || process.env.BENCH_KEY || 'local';
const RUNS = Number(process.env.BENCH_RUNS || 8);
// 'on' | 'off' | '' (provider default). Controls llama.cpp enable_thinking.
const THINKING = (process.env.BENCH_THINKING || '').toLowerCase();

interface CallResult {
    content: string;
    toolCalls: { name: string; args: any }[];
    ms: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    cost: number;
    error?: string;
}

async function call(opts: {
    messages: any[];
    tools?: any[];
    maxTokens?: number;
}): Promise<CallResult> {
    const body: any = {
        model: MODEL,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 800,
        temperature: 0.7,
    };
    if (opts.tools) body.tools = opts.tools;
    if (THINKING === 'on') body.chat_template_kwargs = { enable_thinking: true };
    else if (THINKING === 'off') body.chat_template_kwargs = { enable_thinking: false };
    const t = Date.now();
    // Retry transient upstream limits (429) + 5xx + timeouts with backoff, so a
    // provider hiccup doesn't get scored as a model failure.
    const backoffs = [1500, 4000, 9000, 18000];
    let lastErr = 'unknown';
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
        try {
            const r = await fetch(`${BASE}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(90000),
            });
            const j: any = await r.json();
            const ms = Date.now() - t;
            const code = j.error?.code ?? r.status;
            const retryable = code === 429 || (code >= 500 && code < 600);
            if (j.error && retryable && attempt < backoffs.length) {
                lastErr = `${code} rate/5xx`;
                await Bun.sleep(backoffs[attempt]);
                continue;
            }
            if (j.error) return blank(ms, JSON.stringify(j.error).slice(0, 120));
            const msg = j.choices?.[0]?.message ?? {};
            const toolCalls = (msg.tool_calls ?? []).map((tc: any) => ({
                name: tc.function?.name,
                args: safeParse(tc.function?.arguments),
            }));
            const u = j.usage ?? {};
            return {
                content: msg.content ?? '',
                toolCalls,
                ms,
                promptTokens: u.prompt_tokens ?? 0,
                completionTokens: u.completion_tokens ?? 0,
                cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
                reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
                cost: u.cost ?? 0,
            };
        } catch (e) {
            lastErr = String(e).slice(0, 120);
            if (attempt < backoffs.length) {
                await Bun.sleep(backoffs[attempt]);
                continue;
            }
            return blank(Date.now() - t, lastErr);
        }
    }
    return blank(Date.now() - t, lastErr);
}

function blank(ms: number, error: string): CallResult {
    return {
        content: '',
        toolCalls: [],
        ms,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        cost: 0,
        error,
    };
}
function safeParse(s: any): any {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}
/** Pull the first JSON object out of a response, tolerating ```json fences and prose. */
function extractJson(s: string): any {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : s;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(body.slice(start, end + 1));
    } catch {
        return null;
    }
}

interface Case {
    id: string;
    build: () => { messages: any[]; tools?: any[]; maxTokens?: number };
    grade: (r: CallResult) => { pass: boolean; strict?: boolean; note?: string };
}

// A. JSON discipline: must emit a parseable object with the right shape. `strict`
//    = no prose around it at all (the harness can `JSON.parse` the whole body).
const jsonCases: Case[] = [
    {
        id: 'decision-object',
        build: () => ({
            messages: [
                {
                    role: 'system',
                    content:
                        'You output ONLY a JSON object, no prose, no code fences. Schema: {"decision":"act"|"wait"|"ignore","confidence":number,"reason":string}',
                },
                {
                    role: 'user',
                    content:
                        'A calendar event "Dentist" starts in 25 minutes and the user has not left yet. Decide.',
                },
            ],
            maxTokens: 200,
        }),
        grade: (r) => {
            const strictObj = safeParse(r.content.trim());
            const obj = strictObj ?? extractJson(r.content);
            if (!obj) return { pass: false, note: 'no JSON' };
            const ok =
                ['act', 'wait', 'ignore'].includes(obj.decision) &&
                typeof obj.confidence === 'number' &&
                typeof obj.reason === 'string';
            return { pass: ok, strict: !!strictObj, note: ok ? '' : 'bad shape' };
        },
    },
    {
        id: 'array-extraction',
        build: () => ({
            messages: [
                {
                    role: 'system',
                    content:
                        'Output ONLY a JSON array of strings, no prose. Extract the action items.',
                },
                {
                    role: 'user',
                    content:
                        'Email: "Hey, can you send the invoice, book the venue for the 12th, and confirm headcount by Friday? Also loved the deck."',
                },
            ],
            maxTokens: 200,
        }),
        grade: (r) => {
            const strict = safeParse(r.content.trim());
            const arr = Array.isArray(strict)
                ? strict
                : (() => {
                      const m = r.content.match(/\[[\s\S]*\]/);
                      return m ? safeParse(m[0]) : null;
                  })();
            if (!Array.isArray(arr)) return { pass: false, note: 'no array' };
            return {
                pass: arr.length === 3,
                strict: Array.isArray(strict),
                note: `n=${arr.length}`,
            };
        },
    },
];

// B. Tool calling: fires the right tool with valid args when needed, and does NOT
//    fabricate a tool call when the answer is trivial (restraint).
const tools = [
    {
        type: 'function',
        function: {
            name: 'get_calendar',
            description: "Fetch the user's calendar events for a day.",
            parameters: {
                type: 'object',
                properties: { date: { type: 'string', description: 'ISO date, YYYY-MM-DD' } },
                required: ['date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'send_message',
            description: 'Send a message to the user on a medium.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string' },
                    urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
                },
                required: ['text'],
            },
        },
    },
];
const toolCases: Case[] = [
    {
        id: 'needs-calendar',
        build: () => ({
            messages: [
                { role: 'system', content: 'You are Nero. Use tools when needed.' },
                { role: 'user', content: "What's on my calendar for 2026-07-25?" },
            ],
            tools,
        }),
        grade: (r) => {
            const tc = r.toolCalls[0];
            const ok = tc?.name === 'get_calendar' && typeof tc.args?.date === 'string';
            return { pass: ok, note: tc ? `${tc.name}(${JSON.stringify(tc.args)})` : 'no call' };
        },
    },
    {
        id: 'restraint-no-tool',
        build: () => ({
            messages: [
                { role: 'system', content: 'You are Nero. Use tools ONLY when necessary.' },
                { role: 'user', content: 'What is 2 plus 2?' },
            ],
            tools,
        }),
        grade: (r) => {
            const called = r.toolCalls.length > 0;
            return {
                pass: !called && /4|four/i.test(r.content),
                note: called ? `wrongly called ${r.toolCalls[0]?.name}` : 'answered directly',
            };
        },
    },
];

// C. Salience: classify events as worth surfacing vs noise, vs ground truth.
const salienceEvents: { text: string; matters: boolean }[] = [
    {
        text: 'Production API error rate jumped from 0.1% to 12% in the last 5 minutes.',
        matters: true,
    },
    { text: 'A newsletter you never open sent its weekly digest.', matters: false },
    { text: 'Your flight tomorrow at 6am was just delayed by 3 hours.', matters: true },
    { text: 'GitHub star count on a repo went from 40 to 41.', matters: false },
    {
        text: 'Calendar: "Board meeting" moved from 2pm to 9am, 40 minutes from now.',
        matters: true,
    },
    { text: 'A Slack channel you muted has 200 new messages about lunch.', matters: false },
    { text: 'Your domain SSL cert expires in 18 hours.', matters: true },
    { text: 'A cron job that runs every minute logged "done" again.', matters: false },
];
const salienceCases: Case[] = salienceEvents.map((ev, i) => ({
    id: `salience-${i}-${ev.matters ? 'signal' : 'noise'}`,
    build: () => ({
        messages: [
            {
                role: 'system',
                content:
                    'You triage events for whether they are worth interrupting the user. Output ONLY "YES" (worth surfacing now) or "NO" (noise / can wait).',
            },
            { role: 'user', content: ev.text },
        ],
        maxTokens: 64,
    }),
    grade: (r) => {
        const said = /yes/i.test(r.content) ? true : /no/i.test(r.content) ? false : null;
        if (said === null) return { pass: false, note: 'unparseable' };
        return { pass: said === ev.matters, note: said ? 'YES' : 'NO' };
    },
}));

// D. Abstain: the info is NOT in context. Must not fabricate.
const abstainCases: Case[] = [
    {
        id: 'unknown-preference',
        build: () => ({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are Nero. Only use facts present in this conversation. If you do not know, say you do not know. Do not guess.',
                },
                { role: 'user', content: "What's my sister's name?" },
            ],
            maxTokens: 120,
        }),
        grade: (r) => {
            const abstained =
                /don'?t know|not sure|no (info|record|mention|idea)|don'?t have (any )?(info|that|a record)|no information|haven'?t|you haven'?t (told|mentioned|shared)|(wasn'?t|not) provided|not in (our|this|the)|can'?t find|unaware|no way (for me )?to know/i.test(
                    r.content,
                );
            return { pass: abstained, note: r.content.slice(0, 70).replace(/\n/g, ' ') };
        },
    },
    {
        id: 'no-tools-claimed',
        build: () => ({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are Nero. You have NO tools connected right now. If asked to do something requiring a tool, say you cannot rather than pretending.',
                },
                { role: 'user', content: 'Read my latest email out loud.' },
            ],
            maxTokens: 120,
        }),
        grade: (r) => {
            const honest =
                /can'?t|cannot|no (tool|access|email|connection)|not connected|unable|don'?t have/i.test(
                    r.content,
                );
            return { pass: honest, note: r.content.slice(0, 70).replace(/\n/g, ' ') };
        },
    },
];

const batteries: { name: string; cases: Case[] }[] = [
    { name: 'A. json', cases: jsonCases },
    { name: 'B. tools', cases: toolCases },
    { name: 'C. salience', cases: salienceCases },
    { name: 'D. abstain', cases: abstainCases },
];

async function main() {
    console.log(`\nLaguna characterization :: ${MODEL} @ ${BASE}`);
    console.log(`runs/case=${RUNS} thinking=${THINKING}\n`);
    let totalCost = 0;
    const latencies: number[] = [];
    for (const bat of batteries) {
        let batPass = 0;
        let batTotal = 0;
        console.log(`── ${bat.name}`);
        for (const c of bat.cases) {
            let pass = 0;
            let strict = 0;
            let errs = 0;
            const notes: string[] = [];
            for (let i = 0; i < RUNS; i++) {
                const req = c.build();
                const r = await call(req);
                if (r.error) {
                    errs++;
                    notes.push(r.error);
                    continue;
                }
                totalCost += r.cost;
                latencies.push(r.ms);
                const g = c.grade(r);
                if (g.pass) pass++;
                if (g.strict) strict++;
                if (i === 0 && g.note) notes.push(g.note);
            }
            const graded = RUNS - errs;
            batPass += pass;
            batTotal += graded;
            const rate = graded ? Math.round((pass / graded) * 100) : 0;
            const bar = '█'.repeat(Math.round(rate / 10)).padEnd(10, '·');
            const strictTag = bat.name.includes('json') ? ` strict=${strict}/${graded}` : '';
            const errTag = errs ? ` ERR=${errs}` : '';
            console.log(
                `   ${bar} ${String(rate).padStart(3)}%  ${c.id.padEnd(22)} (${pass}/${graded})${strictTag}${errTag}  ${notes[0] ?? ''}`,
            );
        }
        console.log(
            `   → ${bat.name} overall: ${Math.round((batPass / batTotal) * 100)}%  (${batPass}/${batTotal})\n`,
        );
    }
    latencies.sort((a, b) => a - b);
    const p = (q: number) => latencies[Math.floor(latencies.length * q)] ?? 0;
    console.log(
        `latency p50=${p(0.5)}ms p90=${p(0.9)}ms  |  spend this run: $${totalCost.toFixed(5)}`,
    );
    process.exit(0);
}
main();
