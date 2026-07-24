/**
 * Agentic characterization: real multi-step tool loops, not single-shot Q&A.
 * Each task gives the model a goal + a shared toolset backed by a deterministic
 * mock world. We run the full tool-execution loop (call -> execute -> feed back ->
 * repeat) and grade the END STATE: did it chain the right tools, use one tool's
 * output as the next's input, recover from a missing record, and stop cleanly?
 *
 * This is where quantization and real capability show up. Same knobs as run.ts.
 */

const BASE = process.env.BENCH_BASE || 'https://openrouter.ai/api/v1';
const MODEL = process.env.BENCH_MODEL || 'poolside/laguna-s-2.1';
const KEY = process.env.OPENROUTER_API_KEY || process.env.BENCH_KEY || 'local';
const RUNS = Number(process.env.BENCH_RUNS || 4);
const THINKING = (process.env.BENCH_THINKING || '').toLowerCase();
const MAX_STEPS = 6;

async function chat(messages: any[], tools: any[]): Promise<any> {
    const body: any = { model: MODEL, messages, tools, max_tokens: 1024, temperature: 0.6 };
    if (THINKING === 'on') body.chat_template_kwargs = { enable_thinking: true };
    else if (THINKING === 'off') body.chat_template_kwargs = { enable_thinking: false };
    // Poolside is single-provider + capacity-limited (~40% success/try) and pacing
    // doesn't help, only attempt count does. Retry hard so multi-call loops survive.
    const backoffs = [700, 1200, 2000, 3500, 5000, 7000, 10000, 14000, 20000, 28000];
    for (let a = 0; a <= backoffs.length; a++) {
        try {
            const r = await fetch(`${BASE}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(90000),
            });
            const j: any = await r.json();
            const code = j.error?.code ?? r.status;
            if (j.error && (code === 429 || code >= 500) && a < backoffs.length) {
                await Bun.sleep(backoffs[a]);
                continue;
            }
            if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 120));
            return j.choices?.[0]?.message ?? {};
        } catch (e) {
            if (a < backoffs.length) {
                await Bun.sleep(backoffs[a]);
                continue;
            }
            throw e;
        }
    }
}

// ---- Deterministic mock world -------------------------------------------------
function makeWorld() {
    return {
        calendar: {
            '2026-07-25': [
                { title: 'Standup', start: '09:00', end: '09:30' },
                { title: 'Client call', start: '14:00', end: '15:00' },
                { title: 'Design sync', start: '14:30', end: '15:30' }, // overlaps Client call
            ],
        } as Record<string, any[]>,
        contacts: {
            sarah: { name: 'Sarah Chen', phone: '+15551234567' },
            mom: { name: 'Mom', phone: '+15559876543' },
        } as Record<string, any>,
        emails: [
            {
                from: 'Amazon',
                subject: 'Your order has shipped',
                body: 'Order #A-4471 shipped, arriving Thursday July 24.',
            },
            { from: 'Newsletter', subject: 'Weekly digest', body: '10 links you missed.' },
            { from: 'Landlord', subject: 'Rent reminder', body: 'Rent due on the 1st.' },
        ],
        sent: [] as any[],
        created: [] as any[],
    };
}
type World = ReturnType<typeof makeWorld>;

const toolDefs = [
    fn('get_calendar', 'List events for a date.', { date: 'ISO date YYYY-MM-DD' }, ['date']),
    fn(
        'find_contact',
        'Look up a contact by name. Returns phone or not_found.',
        { name: 'string' },
        ['name'],
    ),
    fn('send_message', 'Send an SMS to a phone number.', { phone: 'string', text: 'string' }, [
        'phone',
        'text',
    ]),
    fn('search_email', 'Search inbox, returns matching emails.', { query: 'string' }, ['query']),
    fn(
        'create_event',
        'Add a calendar event.',
        { title: 'string', date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' },
        ['title', 'date', 'start'],
    ),
];
function fn(name: string, description: string, props: Record<string, string>, required: string[]) {
    return {
        type: 'function',
        function: {
            name,
            description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(props).map(([k, v]) => [k, { type: 'string', description: v }]),
                ),
                required,
            },
        },
    };
}

function exec(world: World, name: string, args: any): any {
    switch (name) {
        case 'get_calendar':
            return { date: args.date, events: world.calendar[args.date] ?? [] };
        case 'find_contact': {
            const key = String(args.name ?? '').toLowerCase();
            const hit = Object.entries(world.contacts).find(([k, v]) =>
                (k + ' ' + v.name).toLowerCase().includes(key),
            );
            return hit ? { name: hit[1].name, phone: hit[1].phone } : { result: 'not_found' };
        }
        case 'send_message':
            world.sent.push({ phone: args.phone, text: args.text });
            return { ok: true };
        case 'search_email': {
            const q = String(args.query ?? '').toLowerCase();
            return {
                results: world.emails.filter((e) =>
                    (e.from + ' ' + e.subject + ' ' + e.body).toLowerCase().includes(q),
                ),
            };
        }
        case 'create_event':
            world.created.push(args);
            return { ok: true, id: 'evt_' + world.created.length };
        default:
            return { error: 'unknown tool' };
    }
}

// ---- Tasks --------------------------------------------------------------------
interface Task {
    id: string;
    goal: string;
    grade: (w: World, finalText: string, calls: string[]) => { pass: boolean; note: string };
}
const tasks: Task[] = [
    {
        id: 'detect-conflict',
        goal: 'Do I have any scheduling conflicts on 2026-07-25? If so, which events?',
        grade: (w, t, calls) => {
            const looked = calls.includes('get_calendar');
            const named = /client call/i.test(t) && /design sync/i.test(t);
            const saidConflict = /conflict|overlap|double|clash/i.test(t);
            return {
                pass: looked && saidConflict && named,
                note: `looked=${looked} conflict=${saidConflict} named=${named}`,
            };
        },
    },
    {
        id: 'chain-contact-send',
        goal: "Text Sarah that I'm running 15 minutes late.",
        grade: (w) => {
            const s = w.sent[0];
            const ok =
                w.sent.length === 1 &&
                s?.phone === '+15551234567' &&
                /15|fifteen|late/i.test(s?.text ?? '');
            return { pass: ok, note: s ? `sent to ${s.phone}: "${s.text}"` : 'nothing sent' };
        },
    },
    {
        id: 'conditional-book',
        goal: "If I'm free at 3pm on 2026-07-25, book a 30-minute 'Focus block' then. If not, tell me what's in the way.",
        grade: (w, t) => {
            // 3pm (15:00) IS free that day (Design sync ends 15:30 but that's 14:30-15:30... actually 15:00 is BUSY).
            // Design sync 14:30-15:30 covers 15:00 -> 3pm is BUSY. Correct = DO NOT book, report conflict.
            const booked = w.created.length > 0;
            const reported = /design sync|busy|not free|conflict|can'?t|14:30|2:30/i.test(t);
            return {
                pass: !booked && reported,
                note: booked ? 'WRONGLY booked over a busy slot' : `declined+explained=${reported}`,
            };
        },
    },
    {
        id: 'search-synthesize',
        goal: 'What is the status of my Amazon order?',
        grade: (w, t, calls) => {
            const searched = calls.includes('search_email');
            const right = /shipp|thursday|a-4471|arriv/i.test(t);
            return { pass: searched && right, note: `searched=${searched} extracted=${right}` };
        },
    },
    {
        id: 'error-recovery',
        goal: 'Text Bob about grabbing lunch tomorrow.',
        grade: (w, t) => {
            // Bob is NOT in contacts. Correct = do not fabricate a send, report the miss.
            const fabricated = w.sent.length > 0;
            const honest =
                /not find|no contact|couldn'?t find|don'?t have|not in your|no.*bob/i.test(t);
            return {
                pass: !fabricated && honest,
                note: fabricated ? 'FABRICATED a send to unknown Bob' : `reported miss=${honest}`,
            };
        },
    },
];

async function runTask(task: Task): Promise<{ pass: boolean; steps: number; note: string }> {
    const world = makeWorld();
    const messages: any[] = [
        {
            role: 'system',
            content:
                'You are Nero, an assistant with tools. Use tools to accomplish the goal, then give a short final answer. Only act on real data from tools. Do not invent contacts, events, or results.',
        },
        { role: 'user', content: task.goal },
    ];
    const calls: string[] = [];
    let steps = 0;
    for (let i = 0; i < MAX_STEPS; i++) {
        const msg = await chat(messages, toolDefs);
        messages.push(msg);
        const tcs = msg.tool_calls ?? [];
        if (!tcs.length) {
            return { ...task.grade(world, msg.content ?? '', calls), steps };
        }
        steps++;
        for (const tc of tcs) {
            let args: any = {};
            try {
                args = JSON.parse(tc.function?.arguments ?? '{}');
            } catch {
                /* bad args */
            }
            calls.push(tc.function?.name);
            const result = exec(world, tc.function?.name, args);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
    }
    return { ...task.grade(world, '', calls), steps, note: 'MAX_STEPS hit; ' };
}

async function main() {
    console.log(`\nAgentic characterization :: ${MODEL} @ ${BASE}`);
    console.log(`runs/task=${RUNS} thinking=${THINKING} max_steps=${MAX_STEPS}\n`);
    let totalPass = 0;
    let totalRuns = 0;
    for (const task of tasks) {
        let pass = 0;
        let steps = 0;
        let err = 0;
        let note0 = '';
        for (let i = 0; i < RUNS; i++) {
            try {
                const r = await runTask(task);
                if (r.pass) pass++;
                steps += r.steps;
                if (i === 0) note0 = r.note;
            } catch (e) {
                err++;
            }
        }
        const graded = RUNS - err;
        const rate = graded ? Math.round((pass / graded) * 100) : 0;
        const bar = '█'.repeat(Math.round(rate / 10)).padEnd(10, '·');
        totalPass += pass;
        totalRuns += graded;
        console.log(
            `${bar} ${String(rate).padStart(3)}%  ${task.id.padEnd(20)} (${pass}/${graded}) avg_steps=${(steps / Math.max(1, RUNS)).toFixed(1)}${err ? ` ERR=${err}` : ''}  ${note0}`,
        );
    }
    console.log(
        `\noverall: ${totalRuns ? Math.round((totalPass / totalRuns) * 100) : 0}%  (${totalPass}/${totalRuns})`,
    );
    process.exit(0);
}
main();
