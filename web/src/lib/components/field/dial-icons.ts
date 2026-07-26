import type { Component } from 'svelte';
import Zap from '@lucide/svelte/icons/zap';
import Terminal from '@lucide/svelte/icons/terminal';
import Play from '@lucide/svelte/icons/play';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Moon from '@lucide/svelte/icons/moon';
import Music from '@lucide/svelte/icons/music';
import Camera from '@lucide/svelte/icons/camera';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Mic from '@lucide/svelte/icons/mic';
import Globe from '@lucide/svelte/icons/globe';
import Home from '@lucide/svelte/icons/house';
import Lock from '@lucide/svelte/icons/lock';
import AudioLines from '@lucide/svelte/icons/audio-lines';
import Palette from '@lucide/svelte/icons/palette';
import Settings from '@lucide/svelte/icons/settings';
import Wrench from '@lucide/svelte/icons/wrench';
import Radio from '@lucide/svelte/icons/radio';
import Plus from '@lucide/svelte/icons/plus';

/** Icon keys the dial can draw. `create_action` advertises the first twelve to Nero;
 *  the rest back the built-in wedges. */
export const DIAL_ICONS: Record<string, Component> = {
    zap: Zap,
    terminal: Terminal,
    play: Play,
    refresh: RefreshCw,
    moon: Moon,
    music: Music,
    camera: Camera,
    chat: MessageSquare,
    mic: Mic,
    globe: Globe,
    home: Home,
    lock: Lock,
    wave: AudioLines,
    palette: Palette,
    settings: Settings,
    wrench: Wrench,
    radio: Radio,
    plus: Plus,
};

export function dialIcon(key: string): Component {
    return DIAL_ICONS[key] ?? Zap;
}
