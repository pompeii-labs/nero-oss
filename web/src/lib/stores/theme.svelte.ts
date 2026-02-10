import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

function createThemeStore() {
    let current = $state<Theme>('dark');

    function init() {
        if (browser) {
            const stored = localStorage.getItem('nero-theme') as Theme;
            if (stored === 'light') {
                current = 'light';
                document.documentElement.classList.add('light');
            }
        }
    }

    function toggle() {
        const next = current === 'dark' ? 'light' : 'dark';
        current = next;
        if (browser) {
            localStorage.setItem('nero-theme', next);
            document.documentElement.classList.toggle('light', next === 'light');
        }
    }

    return {
        get value() {
            return current;
        },
        init,
        toggle,
    };
}

export const theme = createThemeStore();
