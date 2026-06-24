import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { runShell, expandPath } from './shell';

function shellQuote(s: string): string {
    return `'${s.replace(/'/g, `'\\''`)}'`;
}

export class FileUtility {
    @tool({
        name: 'read_file',
        description: 'Read a text file from the local filesystem and return its contents.',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: true,
        description: 'Absolute or relative file path.',
    })
    async read_file(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const path = String(call.fn_args.path ?? '');
        try {
            return await readFile(resolve(expandPath(path)), 'utf-8');
        } catch (e) {
            return `Error reading ${path}: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'write_file',
        description:
            'Write (create or overwrite) a text file, creating parent directories as needed.',
    })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'File path to write.' })
    @toolparam({
        key: 'content',
        type: 'string',
        required: true,
        description: 'Full file contents.',
    })
    async write_file(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const path = String(call.fn_args.path ?? '');
        const content = String(call.fn_args.content ?? '');
        try {
            const abs = resolve(expandPath(path));
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, content, 'utf-8');
            return `Wrote ${content.length} bytes to ${path}.`;
        } catch (e) {
            return `Error writing ${path}: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'edit_file',
        description:
            'Replace an exact substring in a file. old_string must appear exactly once. Use for surgical edits instead of rewriting the whole file.',
    })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'File path to edit.' })
    @toolparam({
        key: 'old_string',
        type: 'string',
        required: true,
        description: 'Exact text to replace (must be unique in the file).',
    })
    @toolparam({
        key: 'new_string',
        type: 'string',
        required: true,
        description: 'Replacement text.',
    })
    async edit_file(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const path = String(call.fn_args.path ?? '');
        const oldStr = String(call.fn_args.old_string ?? '');
        const newStr = String(call.fn_args.new_string ?? '');
        try {
            const abs = resolve(expandPath(path));
            const content = await readFile(abs, 'utf-8');
            const count = content.split(oldStr).length - 1;
            if (count === 0) return `Error: old_string not found in ${path}.`;
            if (count > 1)
                return `Error: old_string appears ${count} times in ${path}; make it unique.`;
            await writeFile(abs, content.replace(oldStr, newStr), 'utf-8');
            return `Edited ${path}.`;
        } catch (e) {
            return `Error editing ${path}: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'list_files',
        description: 'List the entries in a directory (directories marked with a trailing slash).',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory path (defaults to cwd).',
    })
    async list_files(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const path = call.fn_args.path ? String(call.fn_args.path) : '.';
        try {
            const entries = await readdir(resolve(expandPath(path)), { withFileTypes: true });
            if (entries.length === 0) return '(empty)';
            return entries
                .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
                .sort()
                .join('\n');
        } catch (e) {
            return `Error listing ${path}: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'glob',
        description:
            'Find files matching a glob pattern (e.g. "src/**/*.ts"). Returns matching paths.',
    })
    @toolparam({ key: 'pattern', type: 'string', required: true, description: 'Glob pattern.' })
    @toolparam({
        key: 'cwd',
        type: 'string',
        required: false,
        description: 'Base directory (defaults to cwd).',
    })
    async glob(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const pattern = String(call.fn_args.pattern ?? '');
        const cwd = call.fn_args.cwd ? expandPath(String(call.fn_args.cwd)) : process.cwd();
        try {
            const matches: string[] = [];
            const glob = new Bun.Glob(pattern);
            for await (const m of glob.scan({ cwd, dot: false })) {
                matches.push(join(cwd, m));
                if (matches.length >= 500) break;
            }
            return matches.length ? matches.join('\n') : 'No matches.';
        } catch (e) {
            return `Error globbing ${pattern}: ${(e as Error).message}`;
        }
    }

    @tool({
        name: 'grep_search',
        description:
            'Search file contents for a regex pattern (recursive). Returns matching file:line:text.',
    })
    @toolparam({
        key: 'pattern',
        type: 'string',
        required: true,
        description: 'Regex pattern to search for.',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory or file to search (defaults to cwd).',
    })
    async grep_search(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const pattern = String(call.fn_args.pattern ?? '');
        const path = call.fn_args.path ? expandPath(String(call.fn_args.path)) : '.';
        // Prefer ripgrep, fall back to grep.
        const rg = `rg -n --no-heading -e ${shellQuote(pattern)} ${shellQuote(path)} 2>/dev/null | head -200`;
        const gp = `grep -rnI -e ${shellQuote(pattern)} ${shellQuote(path)} 2>/dev/null | head -200`;
        const res = await runShell(`command -v rg >/dev/null && { ${rg}; } || { ${gp}; }`);
        const out = (res.stdout || '').trim();
        return out || 'No matches.';
    }
}
