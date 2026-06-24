import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import * as devices from '../data/devices';
import * as presence from '../data/presence';

/** Nero's awareness of and control over where he physically is. The orb is a
 *  single entity that lives on one screen at a time; these let him see the
 *  screens on the network and move himself between them. Panel tools (throwing
 *  interfaces) come alongside these. */
export class DisplayUtility {
    @tool({
        name: 'list_devices',
        description:
            'List the screens on the network you can move to or throw panels onto: their names, ids, sizes, online status, and which one you are currently on.',
    })
    async list_devices(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const ds = await devices.list();
        if (!ds.length) return 'No devices connected right now.';
        const here = await presence.get();
        const lines = ds.map(
            (d) =>
                `${d.id === here ? '> ' : '  '}${d.name} [${d.id}] ${d.screenW}x${d.screenH} ${d.connected ? 'online' : 'offline'}`,
        );
        return `${lines.join('\n')}\n(> = where you are now)`;
    }

    @tool({
        name: 'move_to',
        description:
            'Move yourself (the orb) to a different screen. You can only be in one place at a time. Use list_devices first if unsure of names.',
    })
    @toolparam({
        key: 'device',
        type: 'string',
        required: true,
        description: 'The device id or name to move to.',
    })
    async move_to(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const target = String(call.fn_args.device ?? '').trim();
        const ds = await devices.list();
        const match = ds.find(
            (d) => d.id === target || d.name.toLowerCase() === target.toLowerCase(),
        );
        if (!match) return `No device matching "${target}". Use list_devices to see options.`;
        await presence.set(match.id);
        return `Moved to ${match.name}.`;
    }
}
