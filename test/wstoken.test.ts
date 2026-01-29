import { describe, test, expect } from 'bun:test';
import crypto from 'crypto';
import { createWsToken, verifyWsToken } from '../src/util/wstoken';

describe('WebSocket Token Security', () => {
    const TEST_LICENSE_KEY = 'test-license-key-12345';

    describe('Token Creation', () => {
        test('creates token with expected format', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');

            expect(parts.length).toBe(2);
            expect(parts[0]).toMatch(/^\d+$/);
            expect(parts[1]).toMatch(/^[a-f0-9]{16}$/);
        });

        test('timestamp is current epoch seconds', () => {
            const before = Math.floor(Date.now() / 1000);
            const token = createWsToken(TEST_LICENSE_KEY);
            const after = Math.floor(Date.now() / 1000);

            const timestamp = parseInt(token.split('.')[0], 10);
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        test('different keys produce different HMACs', () => {
            const token1 = createWsToken('key-one');
            const token2 = createWsToken('key-two');

            const hmac1 = token1.split('.')[1];
            const hmac2 = token2.split('.')[1];

            expect(hmac1).not.toBe(hmac2);
        });
    });

    describe('Token Verification', () => {
        test('valid token is accepted', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            expect(verifyWsToken(token, TEST_LICENSE_KEY)).toBe(true);
        });

        test('token with wrong key is rejected', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            expect(verifyWsToken(token, 'wrong-key')).toBe(false);
        });

        test('malformed token (no dot) is rejected', () => {
            expect(verifyWsToken('notokenformat', TEST_LICENSE_KEY)).toBe(false);
        });

        test('malformed token (multiple dots) is rejected', () => {
            expect(verifyWsToken('too.many.dots.here', TEST_LICENSE_KEY)).toBe(false);
        });

        test('token with non-numeric timestamp is rejected', () => {
            expect(verifyWsToken('notanumber.abcdef1234567890', TEST_LICENSE_KEY)).toBe(false);
        });

        test('empty token is rejected', () => {
            expect(verifyWsToken('', TEST_LICENSE_KEY)).toBe(false);
        });

        test('token with empty parts is rejected', () => {
            expect(verifyWsToken('.', TEST_LICENSE_KEY)).toBe(false);
            expect(verifyWsToken('123.', TEST_LICENSE_KEY)).toBe(false);
            expect(verifyWsToken('.abc', TEST_LICENSE_KEY)).toBe(false);
        });
    });

    describe('Token Expiration', () => {
        test('expired token (>60s old) is rejected', () => {
            const oldTimestamp = Math.floor(Date.now() / 1000) - 61;
            const hmac = crypto
                .createHmac('sha256', TEST_LICENSE_KEY)
                .update(oldTimestamp.toString())
                .digest('hex')
                .slice(0, 16);
            const expiredToken = `${oldTimestamp}.${hmac}`;

            expect(verifyWsToken(expiredToken, TEST_LICENSE_KEY)).toBe(false);
        });

        test('future token (>60s ahead) is rejected', () => {
            const futureTimestamp = Math.floor(Date.now() / 1000) + 61;
            const hmac = crypto
                .createHmac('sha256', TEST_LICENSE_KEY)
                .update(futureTimestamp.toString())
                .digest('hex')
                .slice(0, 16);
            const futureToken = `${futureTimestamp}.${hmac}`;

            expect(verifyWsToken(futureToken, TEST_LICENSE_KEY)).toBe(false);
        });

        test('token within TTL window is accepted', () => {
            const recentTimestamp = Math.floor(Date.now() / 1000) - 30;
            const hmac = crypto
                .createHmac('sha256', TEST_LICENSE_KEY)
                .update(recentTimestamp.toString())
                .digest('hex')
                .slice(0, 16);
            const recentToken = `${recentTimestamp}.${hmac}`;

            expect(verifyWsToken(recentToken, TEST_LICENSE_KEY)).toBe(true);
        });

        test('token at boundary (59s) is accepted', () => {
            const boundaryTimestamp = Math.floor(Date.now() / 1000) - 59;
            const hmac = crypto
                .createHmac('sha256', TEST_LICENSE_KEY)
                .update(boundaryTimestamp.toString())
                .digest('hex')
                .slice(0, 16);
            const boundaryToken = `${boundaryTimestamp}.${hmac}`;

            expect(verifyWsToken(boundaryToken, TEST_LICENSE_KEY)).toBe(true);
        });
    });

    describe('HMAC Tampering Prevention', () => {
        test('modified HMAC is rejected', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');
            const tamperedHmac = parts[1].split('').reverse().join('');
            const tamperedToken = `${parts[0]}.${tamperedHmac}`;

            expect(verifyWsToken(tamperedToken, TEST_LICENSE_KEY)).toBe(false);
        });

        test('truncated HMAC is rejected', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');
            const truncatedHmac = parts[1].slice(0, 8);
            const tamperedToken = `${parts[0]}.${truncatedHmac}`;

            expect(verifyWsToken(tamperedToken, TEST_LICENSE_KEY)).toBe(false);
        });

        test('extended HMAC is rejected', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');
            const extendedHmac = parts[1] + 'extra';
            const tamperedToken = `${parts[0]}.${extendedHmac}`;

            expect(verifyWsToken(tamperedToken, TEST_LICENSE_KEY)).toBe(false);
        });

        test('timestamp modification invalidates HMAC', () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');
            const modifiedTimestamp = parseInt(parts[0]) + 1;
            const tamperedToken = `${modifiedTimestamp}.${parts[1]}`;

            expect(verifyWsToken(tamperedToken, TEST_LICENSE_KEY)).toBe(false);
        });
    });

    describe('Timing Attack Resistance', () => {
        test('verification time is consistent for valid/invalid HMACs', async () => {
            const token = createWsToken(TEST_LICENSE_KEY);
            const parts = token.split('.');

            const validHmac = parts[1];
            const partiallyWrongHmac = 'x' + validHmac.slice(1);
            const totallyWrongHmac = 'xxxxxxxxxxxxxxxx';

            const iterations = 100;
            const validTimes: number[] = [];
            const partialTimes: number[] = [];
            const wrongTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const validStart = performance.now();
                verifyWsToken(token, TEST_LICENSE_KEY);
                validTimes.push(performance.now() - validStart);

                const partialStart = performance.now();
                verifyWsToken(`${parts[0]}.${partiallyWrongHmac}`, TEST_LICENSE_KEY);
                partialTimes.push(performance.now() - partialStart);

                const wrongStart = performance.now();
                verifyWsToken(`${parts[0]}.${totallyWrongHmac}`, TEST_LICENSE_KEY);
                wrongTimes.push(performance.now() - wrongStart);
            }

            const avgValid = validTimes.reduce((a, b) => a + b) / iterations;
            const avgPartial = partialTimes.reduce((a, b) => a + b) / iterations;
            const avgWrong = wrongTimes.reduce((a, b) => a + b) / iterations;

            const maxDiff = Math.max(
                Math.abs(avgValid - avgPartial),
                Math.abs(avgValid - avgWrong),
                Math.abs(avgPartial - avgWrong),
            );

            expect(maxDiff).toBeLessThan(0.5);
        });
    });

    describe('Edge Cases', () => {
        test('handles unicode in license key', () => {
            const unicodeKey = 'license-key-🔑-unicode';
            const token = createWsToken(unicodeKey);
            expect(verifyWsToken(token, unicodeKey)).toBe(true);
        });

        test('handles very long license key', () => {
            const longKey = 'x'.repeat(10000);
            const token = createWsToken(longKey);
            expect(verifyWsToken(token, longKey)).toBe(true);
        });

        test('handles empty license key', () => {
            const token = createWsToken('');
            expect(verifyWsToken(token, '')).toBe(true);
            expect(verifyWsToken(token, 'notempty')).toBe(false);
        });

        test('handles special characters in license key', () => {
            const specialKey = '!@#$%^&*()_+-=[]{}|;:",.<>?/\\';
            const token = createWsToken(specialKey);
            expect(verifyWsToken(token, specialKey)).toBe(true);
        });
    });
});
