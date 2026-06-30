import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { runShell, formatShell } from './shell';
import { Args } from '../util/args';

export class BashUtility {
    @tool({
        name: 'run_bash',
        description:
            'Run a bash command on the host machine and return its output. Use for anything not covered by a dedicated tool (running builds, git, processes, system inspection). Full access to the local machine.',
    })
    @toolparam({
        key: 'command',
        type: 'string',
        required: true,
        description: 'The bash command to run.',
    })
    @toolparam({
        key: 'cwd',
        type: 'string',
        required: false,
        description: 'Working directory (defaults to the server cwd).',
    })
    async run_bash(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const command = a.str('command');
        if (!command.trim()) return 'No command provided.';
        const cwd = call.fn_args.cwd ? String(call.fn_args.cwd) : undefined;
        return formatShell(await runShell(command, { cwd }));
    }
}
