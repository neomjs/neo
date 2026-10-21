import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'IdGeneratorTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import IdGenerator    from '../../../../src/core/IdGenerator.mjs';

// Every spec in the run shares the counters, so each test uses its own name.
// The default name ('neo') is shared with the whole engine: for it, only the
// growth between our own calls is asserted, never a fixed number.
test.describe('Neo.core.IdGenerator', () => {
    test('counts calls for the same name, starting at 1', () => {
        expect(IdGenerator.getId('test-a')).toBe('neo-test-a-1');
        expect(IdGenerator.getId('test-a')).toBe('neo-test-a-2');
    });

    test('keeps a separate counter for each name', () => {
        IdGenerator.getId('test-b-other');
        IdGenerator.getId('test-b-other');

        expect(IdGenerator.getId('test-b')).toBe('neo-test-b-1');
    });

    test('shares one counter between no name, an empty name and "neo", with no name in the id', () => {
        const first = IdGenerator.getId();
        const match = /^neo-(\d+)$/.exec(first);

        expect(match).not.toBeNull();

        const n = Number(match[1]);

        expect(IdGenerator.getId('')).toBe(`neo-${n + 1}`);
        expect(IdGenerator.getId('neo')).toBe(`neo-${n + 2}`);
    });

    test('Neo.getId uses the same function and counters', () => {
        expect(Neo.getId('test-c')).toBe('neo-test-c-1');
        expect(IdGenerator.getId('test-c')).toBe('neo-test-c-2');
    });

    test('uses "neo-" as the base prefix', () => {
        expect(IdGenerator.base).toBe('neo-');
    });

    test('is registered as Neo.core.IdGenerator', () => {
        expect(Neo.core.IdGenerator).toBe(IdGenerator);
    });
});
