import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'HashHistoryUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import HashHistory    from '../../../../src/util/HashHistory.mjs';

/**
 * `Neo.util.HashHistory` is a singleton, so its stacks survive from one test to the next.
 * Every test starts from empty stacks, and removes the change listener it adds.
 */
test.describe('Neo.util.HashHistory', () => {
    test.beforeEach(() => {
        HashHistory.stacks = {}
    });

    test('first() is the newest entry and second() the one before it', () => {
        const a = {hashString: 'a', windowId: 'w1'},
              b = {hashString: 'b', windowId: 'w1'};

        HashHistory.push(a);
        HashHistory.push(b);

        expect(HashHistory.first('w1')).toBe(b);
        expect(HashHistory.second('w1')).toBe(a)
    });

    test('the same hashString twice in a row is stored once and fires change once', () => {
        const events = [],
              onChange = (...args) => events.push(args);

        HashHistory.on('change', onChange);

        try {
            HashHistory.push({hashString: 'a', windowId: 'w1'});
            HashHistory.push({hashString: 'a', windowId: 'w1'});

            expect(HashHistory.getCount('w1')).toBe(1);
            expect(events.length).toBe(1)
        } finally {
            HashHistory.un('change', onChange)
        }
    });

    test('change fires with the new entry and the previous one, null on the first push', () => {
        const events   = [],
              onChange = (...args) => events.push(args),
              a        = {hashString: 'a', windowId: 'w1'},
              b        = {hashString: 'b', windowId: 'w1'};

        HashHistory.on('change', onChange);

        try {
            HashHistory.push(a);
            HashHistory.push(b);

            expect(events.length).toBe(2);
            expect(events[0][0]).toBe(a);
            expect(events[0][1]).toBeNull();
            expect(events[1][0]).toBe(b);
            expect(events[1][1]).toBe(a)
        } finally {
            HashHistory.un('change', onChange)
        }
    });

    test('each window has its own stack', () => {
        HashHistory.push({hashString: 'a', windowId: 'w1'});
        HashHistory.push({hashString: 'b', windowId: 'w1'});
        HashHistory.push({hashString: 'a', windowId: 'w2'});

        expect(HashHistory.getCount('w1')).toBe(2);
        expect(HashHistory.getCount('w2')).toBe(1);
        expect(HashHistory.first('w2').hashString).toBe('a');
        expect(HashHistory.first('w1').hashString).toBe('b')
    });

    test('pushing past maxItems drops the oldest entry and keeps the count at maxItems', () => {
        const entries = [];

        expect(HashHistory.maxItems).toBe(50);

        for (let i = 0; i < 51; i++) {
            entries.push({hashString: `route-${i}`, windowId: 'w1'});
            HashHistory.push(entries[i])
        }

        expect(HashHistory.getCount('w1')).toBe(50);
        expect(HashHistory.getStack('w1')).not.toContain(entries[0]);
        expect(HashHistory.getAt(49, 'w1')).toBe(entries[1]);
        expect(HashHistory.first('w1')).toBe(entries[50])
    });

    test('getAt(0) is the newest entry', () => {
        const a = {hashString: 'a', windowId: 'w1'},
              b = {hashString: 'b', windowId: 'w1'};

        HashHistory.push(a);
        HashHistory.push(b);

        expect(HashHistory.getAt(0, 'w1')).toBe(b);
        expect(HashHistory.getAt(1, 'w1')).toBe(a)
    });

    test('a read without a windowId uses the first window\'s stack', () => {
        const w1 = {hashString: 'a', windowId: 'w1'};

        HashHistory.push(w1);
        HashHistory.push({hashString: 'b', windowId: 'w2'});

        expect(HashHistory.first()).toBe(w1);
        expect(HashHistory.getCount()).toBe(1);
        expect(HashHistory.getStack()).toBe(HashHistory.getStack('w1'))
    });

    /**
     * push() runs `delete data[windowId]`: it deletes the key named after the window id's value
     * (here `w1`), not the `windowId` property, so stored entries keep their windowId.
     */
    test('push deletes the key named after the window id, not windowId itself', () => {
        const entry = {hashString: 'a', windowId: 'w1', w1: 'named after the window'};

        HashHistory.push(entry);

        expect(HashHistory.first('w1')).toBe(entry);
        expect(entry.windowId).toBe('w1');
        expect(entry).not.toHaveProperty('w1')
    });
});
