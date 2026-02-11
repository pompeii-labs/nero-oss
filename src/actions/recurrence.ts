export type RecurrenceUnit =
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'every_x_minutes'
    | 'every_x_hours';

export interface RecurrenceRule {
    unit: RecurrenceUnit;
    day_of_week?: number;
    day_of_month?: number;
    month?: number;
    hour?: number;
    minute?: number;
    every_x_minutes?: number;
    every_x_hours?: number;
}

export function computeNextRun(currentTimestamp: Date, rule: RecurrenceRule): Date {
    const next = new Date(currentTimestamp);

    switch (rule.unit) {
        case 'every_x_minutes': {
            const minutes = rule.every_x_minutes || 30;
            next.setMinutes(next.getMinutes() + minutes);
            break;
        }

        case 'every_x_hours': {
            const hours = rule.every_x_hours || 1;
            next.setHours(next.getHours() + hours);
            break;
        }

        case 'daily': {
            next.setDate(next.getDate() + 1);
            if (rule.hour !== undefined) next.setHours(rule.hour);
            if (rule.minute !== undefined) next.setMinutes(rule.minute);
            next.setSeconds(0, 0);
            break;
        }

        case 'weekly': {
            const targetDay = rule.day_of_week ?? next.getDay();
            let daysUntil = targetDay - next.getDay();
            if (daysUntil <= 0) daysUntil += 7;
            next.setDate(next.getDate() + daysUntil);
            if (rule.hour !== undefined) next.setHours(rule.hour);
            if (rule.minute !== undefined) next.setMinutes(rule.minute);
            next.setSeconds(0, 0);
            break;
        }

        case 'monthly': {
            next.setMonth(next.getMonth() + 1);
            if (rule.day_of_month !== undefined) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(rule.day_of_month, lastDay));
            }
            if (rule.hour !== undefined) next.setHours(rule.hour);
            if (rule.minute !== undefined) next.setMinutes(rule.minute);
            next.setSeconds(0, 0);
            break;
        }

        case 'yearly': {
            next.setFullYear(next.getFullYear() + 1);
            if (rule.month !== undefined) next.setMonth(rule.month);
            if (rule.day_of_month !== undefined) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(rule.day_of_month, lastDay));
            }
            if (rule.hour !== undefined) next.setHours(rule.hour);
            if (rule.minute !== undefined) next.setMinutes(rule.minute);
            next.setSeconds(0, 0);
            break;
        }
    }

    return next;
}

export function describeRecurrence(rule: RecurrenceRule): string {
    switch (rule.unit) {
        case 'every_x_minutes':
            return `every ${rule.every_x_minutes || 30} minutes`;
        case 'every_x_hours':
            return `every ${rule.every_x_hours || 1} hour${(rule.every_x_hours || 1) > 1 ? 's' : ''}`;
        case 'daily': {
            const time =
                rule.hour !== undefined
                    ? ` at ${String(rule.hour).padStart(2, '0')}:${String(rule.minute ?? 0).padStart(2, '0')}`
                    : '';
            return `daily${time}`;
        }
        case 'weekly': {
            const days = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
            ];
            const day = rule.day_of_week !== undefined ? ` on ${days[rule.day_of_week]}` : '';
            const time =
                rule.hour !== undefined
                    ? ` at ${String(rule.hour).padStart(2, '0')}:${String(rule.minute ?? 0).padStart(2, '0')}`
                    : '';
            return `weekly${day}${time}`;
        }
        case 'monthly': {
            const day =
                rule.day_of_month !== undefined ? ` on the ${ordinal(rule.day_of_month)}` : '';
            const time =
                rule.hour !== undefined
                    ? ` at ${String(rule.hour).padStart(2, '0')}:${String(rule.minute ?? 0).padStart(2, '0')}`
                    : '';
            return `monthly${day}${time}`;
        }
        case 'yearly':
            return 'yearly';
        default:
            return rule.unit;
    }
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function parseRecurrence(raw: string | null): RecurrenceRule | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as RecurrenceRule;
    } catch {
        return null;
    }
}
