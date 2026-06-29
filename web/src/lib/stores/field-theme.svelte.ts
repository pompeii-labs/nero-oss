import { browser } from '$app/environment';
import { setTheme, setFieldMode } from '$lib/actions/settings';

export type FieldTheme = 'obsidian' | 'forge';
export type FieldMode = 'night' | 'day';

export const FIELD_THEMES: { id: FieldTheme; label: string }[] = [
    { id: 'obsidian', label: 'Obsidian' },
    { id: 'forge', label: 'Forge' },
];

const THEME_KEY = 'nero-field-theme';
const MODE_KEY = 'nero-field-mode';

function initialTheme(): FieldTheme {
    if (!browser) return 'obsidian';
    return localStorage.getItem(THEME_KEY) === 'forge' ? 'forge' : 'obsidian';
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

    /** Apply a value locally without writing back — used for incoming sync from
     *  other screens (avoids a write loop). */
    applyTheme(t: FieldTheme) {
        this.value = t;
        if (browser) localStorage.setItem(THEME_KEY, t);
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

    toggle() {
        this.set(this.value === 'obsidian' ? 'forge' : 'obsidian');
    }

    toggleMode() {
        this.setMode(this.mode === 'night' ? 'day' : 'night');
    }
}

export const fieldTheme = new FieldThemeState();
