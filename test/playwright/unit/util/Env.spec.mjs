import { setup } from '../../setup.mjs';

const appName = 'EnvTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Env            from '../../../../src/util/Env.mjs';

test.describe('Neo.util.Env', () => {
    let warns;
    const captureWarn = (...args) => { warns.push(args); };

    test.beforeEach(() => { warns = []; });

    // Helper: build an opts bundle with custom env + capturing warn.
    const opts = env => ({env, warn: captureWarn});

    test.describe('parseNumber', () => {
        test('returns undefined for absent / null / empty (no warn — absent is not malformed)', () => {
            expect(Env.parseNumber('X', opts({}))).toBe(undefined);
            expect(Env.parseNumber('X', opts({X: null}))).toBe(undefined);
            expect(Env.parseNumber('X', opts({X: ''}))).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes well-formed numbers', () => {
            expect(Env.parseNumber('X', opts({X: '42'}))).toBe(42);
            expect(Env.parseNumber('X', opts({X: '3.14'}))).toBe(3.14);
            expect(Env.parseNumber('X', opts({X: '-7'}))).toBe(-7);
            expect(Env.parseNumber('X', opts({X: '0'}))).toBe(0);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined on non-finite input (Number(undefined) === NaN gotcha protection)', () => {
            expect(Env.parseNumber('X', opts({X: 'abc'}))).toBe(undefined);
            expect(Env.parseNumber('X', opts({X: 'NaN'}))).toBe(undefined);
            expect(Env.parseNumber('X', opts({X: 'Infinity'}))).toBe(undefined);
            expect(warns.length).toBe(3);
        });

        test('?? fallback pattern works correctly with absent input', () => {
            // The ?? fallback contract underpinning the canonical 2-value consumer chain:
            // `Env.parseX('NEO_X') ?? AiConfig.X`. Single source of name — env var name
            // appears ONCE per call site.
            // This MUST fall through to fallback when env var is absent (NOT NaN, which ?? would skip).
            const fallback = 99;
            expect(Env.parseNumber('X', opts({}))           ?? fallback).toBe(99);
            expect(Env.parseNumber('X', opts({X: ''}))      ?? fallback).toBe(99);
            expect(Env.parseNumber('X', opts({X: '42'}))    ?? fallback).toBe(42);
        });
    });

    test.describe('parseKeepAlive', () => {
        test('returns undefined for absent / null / empty', () => {
            expect(Env.parseKeepAlive('X', opts({}))).toBe(undefined);
            expect(Env.parseKeepAlive('X', opts({X: null}))).toBe(undefined);
            expect(Env.parseKeepAlive('X', opts({X: ''}))).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes numeric retention controls as numbers', () => {
            expect(Env.parseKeepAlive('X', opts({X: '-1'}))).toBe(-1);
            expect(Env.parseKeepAlive('X', opts({X: '0'}))).toBe(0);
            expect(Env.parseKeepAlive('X', opts({X: '60'}))).toBe(60);
            expect(warns.length).toBe(0);
        });

        test('keeps duration tokens as strings', () => {
            expect(Env.parseKeepAlive('X', opts({X: '10m'}))).toBe('10m');
            expect(Env.parseKeepAlive('X', opts({X: ' 1h '}))).toBe('1h');
            expect(warns.length).toBe(0);
        });
    });

    test.describe('parseCsv', () => {
        test('returns undefined for absent / null / empty', () => {
            expect(Env.parseCsv('X', opts({}))).toBe(undefined);
            expect(Env.parseCsv('X', opts({X: null}))).toBe(undefined);
            expect(Env.parseCsv('X', opts({X: ''}))).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes comma-separated values into a trimmed string array', () => {
            expect(Env.parseCsv('X', opts({X: 'client-a, client-b,client-c'}))).toEqual([
                'client-a',
                'client-b',
                'client-c'
            ]);
            expect(warns.length).toBe(0);
        });

        test('drops blank entries without warning', () => {
            expect(Env.parseCsv('X', opts({X: ' user-a, , user-b ,, '}))).toEqual(['user-a', 'user-b']);
            expect(Env.parseCsv('X', opts({X: ' , '}))).toEqual([]);
            expect(warns.length).toBe(0);
        });
    });

    test.describe('parseBool', () => {
        test('returns undefined for absent / null / empty', () => {
            expect(Env.parseBool('X', opts({}))).toBe(undefined);
            expect(Env.parseBool('X', opts({X: null}))).toBe(undefined);
            expect(Env.parseBool('X', opts({X: ''}))).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('accepts true tokens: true, yes, on, 1 (case-insensitive)', () => {
            expect(Env.parseBool('X', opts({X: 'true'}))).toBe(true);
            expect(Env.parseBool('X', opts({X: 'TRUE'}))).toBe(true);
            expect(Env.parseBool('X', opts({X: 'yes'}))).toBe(true);
            expect(Env.parseBool('X', opts({X: 'YES'}))).toBe(true);
            expect(Env.parseBool('X', opts({X: 'on'}))).toBe(true);
            expect(Env.parseBool('X', opts({X: '1'}))).toBe(true);
            expect(warns.length).toBe(0);
        });

        test('preserves PrimaryRepoSyncService.parseEnabledFlag legacy false tokens: 0, false, no, off', () => {
            expect(Env.parseBool('X', opts({X: 'false'}))).toBe(false);
            expect(Env.parseBool('X', opts({X: 'FALSE'}))).toBe(false);
            expect(Env.parseBool('X', opts({X: 'no'}))).toBe(false);
            expect(Env.parseBool('X', opts({X: 'NO'}))).toBe(false);
            expect(Env.parseBool('X', opts({X: 'off'}))).toBe(false);
            expect(Env.parseBool('X', opts({X: '0'}))).toBe(false);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined on unknown tokens', () => {
            expect(Env.parseBool('X', opts({X: 'maybe'}))).toBe(undefined);
            expect(Env.parseBool('X', opts({X: 'truthy'}))).toBe(undefined);
            expect(warns.length).toBe(2);
        });
    });

    test.describe('parsePort', () => {
        test('returns undefined for absent', () => {
            expect(Env.parsePort('X', opts({}))).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes valid ports in 1..65535', () => {
            expect(Env.parsePort('X', opts({X: '1'}))).toBe(1);
            expect(Env.parsePort('X', opts({X: '8080'}))).toBe(8080);
            expect(Env.parsePort('X', opts({X: '65535'}))).toBe(65535);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined for out-of-range / non-integer / non-numeric', () => {
            expect(Env.parsePort('X', opts({X: '0'}))).toBe(undefined);
            expect(Env.parsePort('X', opts({X: '65536'}))).toBe(undefined);
            expect(Env.parsePort('X', opts({X: '-1'}))).toBe(undefined);
            expect(Env.parsePort('X', opts({X: '3.14'}))).toBe(undefined);
            expect(Env.parsePort('X', opts({X: 'abc'}))).toBe(undefined);
            expect(warns.length).toBe(5);
        });
    });

    test.describe('parseUrl', () => {
        test('returns undefined for absent', () => {
            expect(Env.parseUrl('X', opts({}))).toBe(undefined);
        });

        test('decodes + normalizes (strips trailing slash)', () => {
            expect(Env.parseUrl('X', opts({X: 'https://example.com/'}))).toBe('https://example.com');
            expect(Env.parseUrl('X', opts({X: 'https://example.com/x'}))).toBe('https://example.com/x');
        });

        test('warns + returns undefined for malformed URL', () => {
            expect(Env.parseUrl('X', opts({X: 'not a url'}))).toBe(undefined);
            expect(Env.parseUrl('X', opts({X: '://bad'}))).toBe(undefined);
            expect(warns.length).toBe(2);
        });
    });

    test.describe('parseString', () => {
        test('returns raw string value from env (no parse, no warn)', () => {
            expect(Env.parseString('X', {env: {X: 'hello'}})).toBe('hello');
            expect(Env.parseString('X', {env: {X: 'orchestrator'}})).toBe('orchestrator');
        });

        test('returns undefined for absent / empty (consistent with other parsers)', () => {
            expect(Env.parseString('X', {env: {}})).toBe(undefined);
            expect(Env.parseString('X', {env: {X: ''}})).toBe(undefined);
        });

        test('reads from process.env by default when no opts.env passed', () => {
            const original = process.env.NEO_ENV_SPEC_PARSESTRING_TEST;
            process.env.NEO_ENV_SPEC_PARSESTRING_TEST = 'process-env-value';
            try {
                expect(Env.parseString('NEO_ENV_SPEC_PARSESTRING_TEST')).toBe('process-env-value');
            } finally {
                if (original === undefined) delete process.env.NEO_ENV_SPEC_PARSESTRING_TEST;
                else                        process.env.NEO_ENV_SPEC_PARSESTRING_TEST = original;
            }
        });
    });
});
