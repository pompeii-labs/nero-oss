import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const storedTheme = browser ? (localStorage.getItem('nero-theme') as Theme) : null;

export const theme = writable<Theme>(storedTheme || 'dark');

export function toggleTheme() {
    theme.update((t) => {
        const newTheme = t === 'dark' ? 'light' : 'dark';
        if (browser) {
            localStorage.setItem('nero-theme', newTheme);
            document.documentElement.classList.toggle('light', newTheme === 'light');
        }
        return newTheme;
    });
}

export function initTheme() {
    if (browser) {
        const stored = localStorage.getItem('nero-theme') as Theme;
        if (stored === 'light') {
            document.documentElement.classList.add('light');
            theme.set('light');
        }
    }
}
