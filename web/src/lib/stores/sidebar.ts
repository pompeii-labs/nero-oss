import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const storedCollapsed = browser ? localStorage.getItem('nero-sidebar-collapsed') === 'true' : false;

export const sidebarCollapsed = writable<boolean>(storedCollapsed);

export function toggleSidebar() {
    sidebarCollapsed.update((collapsed) => {
        const newValue = !collapsed;
        if (browser) {
            localStorage.setItem('nero-sidebar-collapsed', String(newValue));
        }
        return newValue;
    });
}
