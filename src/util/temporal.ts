const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(date: Date | string): string {
    const now = new Date();
    const then = typeof date === 'string' ? new Date(date) : date;
    const diff = now.getTime() - then.getTime();

    if (diff < MINUTE) {
        return 'just now';
    }

    if (diff < HOUR) {
        const mins = Math.floor(diff / MINUTE);
        return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    }

    if (diff < DAY) {
        const hours = Math.floor(diff / HOUR);
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    if (diff < 2 * DAY) {
        const time = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `yesterday at ${time}`;
    }

    if (diff < 7 * DAY) {
        const days = Math.floor(diff / DAY);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    const weeks = Math.floor(diff / (7 * DAY));
    if (weeks < 4) {
        return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }

    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatSessionAge(date: Date | string): string {
    const now = new Date();
    const then = typeof date === 'string' ? new Date(date) : date;
    const diff = now.getTime() - then.getTime();

    if (diff < HOUR) {
        const mins = Math.floor(diff / MINUTE);
        return `${mins}m ago`;
    }

    if (diff < DAY) {
        const hours = Math.floor(diff / HOUR);
        return `${hours}h ago`;
    }

    if (diff < 2 * DAY) {
        return 'yesterday';
    }

    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
}

export function isWithinMinutes(date: Date | string, minutes: number): boolean {
    const now = new Date();
    const then = typeof date === 'string' ? new Date(date) : date;
    const diff = now.getTime() - then.getTime();
    return diff < minutes * MINUTE;
}

export function getTimeSinceMinutes(date: Date | string): number {
    const now = new Date();
    const then = typeof date === 'string' ? new Date(date) : date;
    return Math.floor((now.getTime() - then.getTime()) / MINUTE);
}
