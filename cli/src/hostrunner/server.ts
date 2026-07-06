/**
 * The host-runner: a tiny daemon that runs on the HOST and executes the runner ops
 * the containerized api forwards to it (fs + exec against real repos/toolchains/git/gh).
 * It IS a HostRunner behind an authenticated HTTP surface. Started by `nero start`.
 */
import { HostRunner, type ExecOpts } from '@nero/shared/runner';

const runner = new HostRunner();

interface ExecBody extends ExecOpts {
    command: string;
}
interface PathBody {
    path: string;
}
interface WriteBody {
    path: string;
    content: string;
}

async function handle(op: string, body: unknown): Promise<unknown | undefined> {
    switch (op) {
        case 'exec': {
            const { command, ...opts } = body as ExecBody;
            return runner.exec(command, opts);
        }
        case 'read':
            return { content: await runner.readFile((body as PathBody).path) };
        case 'write':
            await runner.writeFile((body as WriteBody).path, (body as WriteBody).content);
            return { ok: true };
        case 'mkdir':
            await runner.mkdir((body as PathBody).path);
            return { ok: true };
        case 'readdir':
            return { entries: await runner.readdir((body as PathBody).path) };
        default:
            return undefined;
    }
}

export function startHostRunner(): void {
    const token = process.env.NERO_RUNNER_TOKEN ?? '';
    const port = Number(process.env.NERO_RUNNER_PORT ?? 7717);
    Bun.serve({
        port,
        idleTimeout: 240,
        async fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === '/health') return new Response('ok');
            if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
            // A configured token is required; without one the daemon is open (dev only).
            if (token && req.headers.get('authorization') !== `Bearer ${token}`)
                return new Response('unauthorized', { status: 401 });
            const op = url.pathname.replace(/^\//, '');
            try {
                const result = await handle(op, await req.json());
                if (result === undefined) return new Response('unknown op', { status: 404 });
                return Response.json(result);
            } catch (e) {
                return new Response(String(e), { status: 500 });
            }
        },
    });
    console.log(`nero host-runner listening on :${port}`);
}

if (import.meta.main) startHostRunner();
