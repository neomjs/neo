import {test, expect}        from '@playwright/test';
import {resolveWindowTarget} from '../../../../../../../ai/services/neural-link/windowOps.mjs';

test.describe('Neural Link window ops target resolution (#13446)', () => {
    test('resolves a known topology window to its owning session', () => {
        const window = {id: 'win-a'};

        const result = resolveWindowTarget({
            sessionData: new Map([
                ['session-a', {windows: new Map([['win-a', window]])}]
            ]),
            windowId: 'win-a'
        });

        expect(result).toEqual({sessionId: 'session-a', window})
    });

    test('fails loud for unknown and scoped-out windows', () => {
        const sessionData = new Map([
            ['session-a', {windows: new Map([['win-a', {id: 'win-a'}]])}]
        ]);

        expect(() => resolveWindowTarget({sessionData, windowId: 'win-b'})).toThrow(/Unknown windowId 'win-b'/);
        expect(() => resolveWindowTarget({sessionData, sessionId: 'session-b', windowId: 'win-a'}))
            .toThrow(/Unknown windowId 'win-a' for session 'session-b'/)
    });

    test('requires an explicit session for ambiguous window ids', () => {
        const sessionData = new Map([
            ['session-a', {windows: new Map([['win-a', {id: 'win-a'}]])}],
            ['session-b', {windows: new Map([['win-a', {id: 'win-a'}]])}]
        ]);

        expect(() => resolveWindowTarget({sessionData, windowId: 'win-a'})).toThrow(/Ambiguous windowId 'win-a'/);

        expect(resolveWindowTarget({sessionData, sessionId: 'session-b', windowId: 'win-a'}).sessionId).toBe('session-b')
    });
});
