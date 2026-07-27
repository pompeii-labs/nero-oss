/**
 * Every glyph a dial wedge can wear.
 *
 * This is the canonical list: `web/src/lib/components/field/dial-icons.ts` maps each
 * key to a Lucide component and `ios/Sources/Field/RadialDial.swift` maps it to an SF
 * Symbol. A key missing from either falls back to a bolt, so add to all three.
 *
 * Keys are named for the thing, not the drawing, so Nero can pick one from the goal
 * without seeing the artwork.
 */
export const DIAL_ICONS = [
    // home and devices
    'home',
    'lightbulb',
    'lamp',
    'tv',
    'speaker',
    'thermostat',
    'fan',
    'plug',
    'door',
    'blinds',
    'lock',
    'unlock',
    'power',
    'battery',
    'wifi',

    // media
    'play',
    'pause',
    'next',
    'prev',
    'music',
    'volume',
    'mute',
    'headphones',
    'video',
    'film',
    'mic',
    'radio',

    // people and messages
    'chat',
    'mail',
    'phone',
    'send',
    'bell',
    'users',
    'user',

    // time and planning
    'calendar',
    'clock',
    'timer',
    'alarm',
    'check',
    'list',
    'flag',
    'bookmark',
    'star',
    'pin',

    // work and data
    'terminal',
    'code',
    'git',
    'database',
    'server',
    'cloud',
    'folder',
    'file',
    'download',
    'upload',
    'link',
    'search',
    'chart',
    'trending',
    'dollar',
    'briefcase',
    'book',
    'pencil',
    'clipboard',

    // getting around
    'globe',
    'map',
    'navigation',
    'car',
    'plane',
    'train',
    'bike',

    // weather
    'sun',
    'moon',
    'rain',
    'snow',
    'wind',

    // everything else
    'zap',
    'refresh',
    'settings',
    'wrench',
    'sliders',
    'palette',
    'camera',
    'image',
    'eye',
    'shield',
    'key',
    'trash',
    'archive',
    'package',
    'gift',
    'heart',
    'coffee',
    'dumbbell',
    'pill',
    'cart',
    'wave',
    'sparkles',
    'brain',
    'flame',
    'droplet',
    'leaf',
    'paw',
] as const;

export type DialIcon = (typeof DIAL_ICONS)[number];

export const DEFAULT_ICON: DialIcon = 'zap';

export function isDialIcon(key: string): key is DialIcon {
    return (DIAL_ICONS as readonly string[]).includes(key);
}

/** For a tool description: the whole set, comma separated. */
export const ICON_LIST = DIAL_ICONS.join(', ');
