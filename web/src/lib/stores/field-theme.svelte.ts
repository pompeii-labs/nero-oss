import { browser } from '$app/environment';
import { setTheme, setFieldMode } from '$lib/actions/settings';

export type FieldTheme = 'vector' | 'forge';
export type FieldMode = 'night' | 'day';

export const FIELD_THEMES: { id: FieldTheme; label: string }[] = [
    { id: 'vector', label: 'Vector' },
    { id: 'forge', label: 'Forge' },
];

/** Obsidian was retired; anything still holding it lands on the default. */
const DEFAULT_THEME: FieldTheme = 'vector';

function coerce(value: string | null | undefined): FieldTheme {
    return FIELD_THEMES.some((t) => t.id === value) ? (value as FieldTheme) : DEFAULT_THEME;
}

/** Themes that render the instrument chrome (HUD frame, ruler ticks, grid). */
const HUD_THEMES: FieldTheme[] = ['vector'];

const THEME_KEY = 'nero-field-theme';
const MODE_KEY = 'nero-field-mode';

function initialTheme(): FieldTheme {
    if (!browser) return DEFAULT_THEME;
    return coerce(localStorage.getItem(THEME_KEY));
}
function initialMode(): FieldMode {
    if (!browser) return 'night';
    return localStorage.getItem(MODE_KEY) === 'day' ? 'day' : 'night';
}

class FieldThemeState {
    value = $state<FieldTheme>(initialTheme());
    mode = $state<FieldMode>(initialMode());

    /** The composite applied to `data-theme` — e.g. "obsidian" or "obsidian-day". */
    get dataTheme(): string {
        return this.mode === 'day' ? `${this.value}-day` : this.value;
    }

    /** True when the active theme wants the instrument chrome drawn. */
    get hud(): boolean {
        return HUD_THEMES.includes(this.value);
    }

    /** Apply a value locally without writing back — used for incoming sync from
     *  other screens (avoids a write loop). */
    applyTheme(t: FieldTheme) {
        // incoming sync can still carry a retired name from another screen or the server
        this.value = coerce(t);
        if (browser) localStorage.setItem(THEME_KEY, this.value);
    }
    applyMode(m: FieldMode) {
        this.mode = m;
        if (browser) localStorage.setItem(MODE_KEY, m);
    }

    set(t: FieldTheme) {
        this.applyTheme(t);
        if (browser) void setTheme(t); // shared across all screens
    }

    setMode(m: FieldMode) {
        this.applyMode(m);
        if (browser) void setFieldMode(m);
    }

    /** Step to the next theme in the list. What the dial's THEME wedge fires. */
    cycle() {
        const i = FIELD_THEMES.findIndex((t) => t.id === this.value);
        this.set(FIELD_THEMES[(i + 1) % FIELD_THEMES.length].id);
    }

    toggle() {
        this.cycle();
    }

    toggleMode() {
        this.setMode(this.mode === 'night' ? 'day' : 'night');
    }
}

export const fieldTheme = new FieldThemeState();
