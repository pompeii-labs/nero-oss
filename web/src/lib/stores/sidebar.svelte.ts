import { browser } from '$app/environment';

function createSidebarStore() {
    let collapsed = $state(
        browser ? localStorage.getItem('nero-sidebar-collapsed') === 'true' : false,
    );

    function toggle() {
        collapsed = !collapsed;
        if (browser) {
            localStorage.setItem('nero-sidebar-collapsed', String(collapsed));
        }
    }

    return {
        get collapsed() {
            return collapsed;
        },
        toggle,
    };
}

export const sidebar = createSidebarStore();
