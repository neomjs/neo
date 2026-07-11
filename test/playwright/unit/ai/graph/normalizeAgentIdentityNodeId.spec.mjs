import {test, expect}                 from '@playwright/test';
import {normalizeAgentIdentityNodeId} from '../../../../../ai/graph/normalizeAgentIdentityNodeId.mjs';

test.describe('normalizeAgentIdentityNodeId', () => {
    test('canonicalizes direct bare, canonical, and redundant-prefix identities', () => {
        const cases = [
            ['neo-gpt',             '@neo-gpt'],
            ['  neo-opus-ada  ',    '@neo-opus-ada'],
            ['@neo-gemini-pro',     '@neo-gemini-pro'],
            ['@@neo-gpt',           '@neo-gpt'],
            ['@@@@neo-opus-grace',  '@neo-opus-grace'],
            ['',                    '']
        ];

        for (const [input, expected] of cases) {
            const normalized = normalizeAgentIdentityNodeId(input);
            expect(normalized).toBe(expected);
            expect(normalizeAgentIdentityNodeId(normalized)).toBe(expected);
        }
    });

    test('leaves mailbox addressing grammar outside the graph primitive', () => {
        expect(normalizeAgentIdentityNodeId('AGENT:*')).toBe('AGENT:*');
        expect(normalizeAgentIdentityNodeId('AGENT:neo-gpt')).toBe('AGENT:neo-gpt');
        expect(normalizeAgentIdentityNodeId('role:librarian')).toBe('role:librarian');
        expect(normalizeAgentIdentityNodeId('human:tobiu')).toBe('human:tobiu');
    });

    test('passes non-string values through without inventing identities', () => {
        const objectIdentity = {id: 'neo-gpt'};

        expect(normalizeAgentIdentityNodeId(null)).toBeNull();
        expect(normalizeAgentIdentityNodeId(undefined)).toBeUndefined();
        expect(normalizeAgentIdentityNodeId(42)).toBe(42);
        expect(normalizeAgentIdentityNodeId(objectIdentity)).toBe(objectIdentity);
    });
});
