import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import {
    formatRelativeTime,
    formatSessionAge,
    isWithinMinutes,
    getTimeSinceMinutes,
} from '../src/util/temporal';
import { SessionService } from '../src/services/session';
import { SessionManager } from '../src/services/session-manager';

describe('Temporal Utilities', () => {
    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    describe('formatRelativeTime', () => {
        test('returns "just now" for times less than a minute ago', () => {
            const now = new Date();
            const thirtySecsAgo = new Date(now.getTime() - 30 * 1000);
            expect(formatRelativeTime(thirtySecsAgo)).toBe('just now');
        });

        test('returns minutes ago for times under an hour', () => {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * MINUTE);
            expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
        });

        test('returns singular minute for 1 minute ago', () => {
            const now = new Date();
            const oneMinAgo = new Date(now.getTime() - 1 * MINUTE - 1000);
            expect(formatRelativeTime(oneMinAgo)).toBe('1 minute ago');
        });

        test('returns hours ago for times under a day', () => {
            const now = new Date();
            const twoHoursAgo = new Date(now.getTime() - 2 * HOUR);
            expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
        });

        test('returns singular hour for 1 hour ago', () => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 1 * HOUR - 1000);
            expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
        });

        test('returns "yesterday at" for times 1-2 days ago', () => {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 30 * HOUR);
            const result = formatRelativeTime(yesterday);
            expect(result).toMatch(/^yesterday at/);
        });

        test('returns days ago for times under a week', () => {
            const now = new Date();
            const threeDaysAgo = new Date(now.getTime() - 3 * DAY);
            expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
        });

        test('returns weeks ago for times under a month', () => {
            const now = new Date();
            const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
            expect(formatRelativeTime(twoWeeksAgo)).toBe('2 weeks ago');
        });

        test('handles string dates', () => {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * MINUTE).toISOString();
            expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
        });
    });

    describe('formatSessionAge', () => {
        test('returns minutes format for times under an hour', () => {
            const now = new Date();
            const thirtyMinAgo = new Date(now.getTime() - 30 * MINUTE);
            expect(formatSessionAge(thirtyMinAgo)).toBe('30m ago');
        });

        test('returns hours format for times under a day', () => {
            const now = new Date();
            const fiveHoursAgo = new Date(now.getTime() - 5 * HOUR);
            expect(formatSessionAge(fiveHoursAgo)).toBe('5h ago');
        });

        test('returns "yesterday" for times 1-2 days ago', () => {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 30 * HOUR);
            expect(formatSessionAge(yesterday)).toBe('yesterday');
        });

        test('returns days format for times over 2 days', () => {
            const now = new Date();
            const fiveDaysAgo = new Date(now.getTime() - 5 * DAY);
            expect(formatSessionAge(fiveDaysAgo)).toBe('5d ago');
        });
    });

    describe('isWithinMinutes', () => {
        test('returns true when time is within threshold', () => {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * MINUTE);
            expect(isWithinMinutes(fiveMinAgo, 10)).toBe(true);
        });

        test('returns false when time exceeds threshold', () => {
            const now = new Date();
            const fifteenMinAgo = new Date(now.getTime() - 15 * MINUTE);
            expect(isWithinMinutes(fifteenMinAgo, 10)).toBe(false);
        });

        test('returns true for exact boundary', () => {
            const now = new Date();
            const tenMinAgo = new Date(now.getTime() - 10 * MINUTE + 100);
            expect(isWithinMinutes(tenMinAgo, 10)).toBe(true);
        });
    });

    describe('getTimeSinceMinutes', () => {
        test('returns correct minutes elapsed', () => {
            const now = new Date();
            const tenMinAgo = new Date(now.getTime() - 10 * MINUTE);
            expect(getTimeSinceMinutes(tenMinAgo)).toBe(10);
        });

        test('rounds down partial minutes', () => {
            const now = new Date();
            const tenAndHalfMinAgo = new Date(now.getTime() - 10.5 * MINUTE);
            expect(getTimeSinceMinutes(tenAndHalfMinAgo)).toBe(10);
        });

        test('handles string dates', () => {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * MINUTE).toISOString();
            expect(getTimeSinceMinutes(fiveMinAgo)).toBe(5);
        });
    });
});

describe('SessionService', () => {
    describe('constructor', () => {
        test('uses default gap threshold of 30 minutes', () => {
            const service = new SessionService();
            expect(service).toBeDefined();
        });

        test('accepts custom gap threshold', () => {
            const service = new SessionService(60);
            expect(service).toBeDefined();
        });
    });

    describe('detectSession (without DB)', () => {
        test('returns default session info when DB not connected', async () => {
            const service = new SessionService(30);
            const info = await service.detectSession();

            expect(info.isNewSession).toBe(false);
            expect(info.currentSessionStart).toBeNull();
            expect(info.lastMessageTime).toBeNull();
            expect(info.gapMinutes).toBe(0);
        });
    });

    describe('findCurrentSessionStart (without DB)', () => {
        test('returns null when DB not connected', async () => {
            const service = new SessionService(30);
            const result = await service.findCurrentSessionStart();
            expect(result).toBeNull();
        });
    });

    describe('getUnsummarizedPreviousSession (without DB)', () => {
        test('returns null when DB not connected', async () => {
            const service = new SessionService(30);
            const result = await service.getUnsummarizedPreviousSession();
            expect(result).toBeNull();
        });
    });

    describe('getMessagesSinceSessionStart (without DB)', () => {
        test('returns empty array when DB not connected', async () => {
            const service = new SessionService(30);
            const result = await service.getMessagesSinceSessionStart(new Date(), 50);
            expect(result).toEqual([]);
        });
    });
});

describe('SessionManager', () => {
    const mockOpenAI = {
        chat: {
            completions: {
                create: mock(() =>
                    Promise.resolve({
                        choices: [{ message: { content: 'Test summary' } }],
                    }),
                ),
            },
        },
    } as any;

    const defaultSettings = {
        enabled: true,
        gapThresholdMinutes: 30,
        autoSummarize: true,
        autoExtractMemories: true,
        maxSessionSummaries: 5,
    };

    describe('constructor', () => {
        test('creates session manager with valid config', () => {
            const manager = new SessionManager({
                openaiClient: mockOpenAI,
                model: 'test-model',
                settings: defaultSettings,
            });
            expect(manager).toBeDefined();
        });

        test('provides access to session service', () => {
            const manager = new SessionManager({
                openaiClient: mockOpenAI,
                model: 'test-model',
                settings: defaultSettings,
            });
            const service = manager.getSessionService();
            expect(service).toBeInstanceOf(SessionService);
        });
    });

    describe('onUserMessage', () => {
        test('does nothing when sessions disabled', async () => {
            const manager = new SessionManager({
                openaiClient: mockOpenAI,
                model: 'test-model',
                settings: { ...defaultSettings, enabled: false },
            });

            await manager.onUserMessage();
        });

        test('does nothing when autoSummarize disabled', async () => {
            const manager = new SessionManager({
                openaiClient: mockOpenAI,
                model: 'test-model',
                settings: { ...defaultSettings, autoSummarize: false },
            });

            await manager.onUserMessage();
        });
    });
});
