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

    test.describe('parseNumber', () => {
        test('returns undefined for absent / null / empty (no warn — absent is not malformed)', () => {
            expect(Env.parseNumber(undefined, 'X', captureWarn)).toBe(undefined);
            expect(Env.parseNumber(null,      'X', captureWarn)).toBe(undefined);
            expect(Env.parseNumber('',        'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes well-formed numbers', () => {
            expect(Env.parseNumber('42',   'X', captureWarn)).toBe(42);
            expect(Env.parseNumber('3.14', 'X', captureWarn)).toBe(3.14);
            expect(Env.parseNumber('-7',   'X', captureWarn)).toBe(-7);
            expect(Env.parseNumber('0',    'X', captureWarn)).toBe(0);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined on non-finite input (Number(undefined) === NaN gotcha protection)', () => {
            expect(Env.parseNumber('abc',      'X', captureWarn)).toBe(undefined);
            expect(Env.parseNumber('NaN',      'X', captureWarn)).toBe(undefined);
            expect(Env.parseNumber('Infinity', 'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(3);
        });

        test('?? fallback pattern works correctly with absent input', () => {
            // The load-bearing consumer pattern: Env.parseNumber(process.env.X, 'X') ?? AiConfig.X
            // This MUST fall through to fallback when env var is absent (NOT NaN, which ?? would skip).
            const fallback = 99;
            expect(Env.parseNumber(undefined, 'X', captureWarn) ?? fallback).toBe(99);
            expect(Env.parseNumber('',        'X', captureWarn) ?? fallback).toBe(99);
            expect(Env.parseNumber('42',      'X', captureWarn) ?? fallback).toBe(42);
        });
    });

    test.describe('parseBool', () => {
        test('returns undefined for absent / null / empty', () => {
            expect(Env.parseBool(undefined, 'X', captureWarn)).toBe(undefined);
            expect(Env.parseBool(null,      'X', captureWarn)).toBe(undefined);
            expect(Env.parseBool('',        'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('accepts true tokens: true, yes, on, 1 (case-insensitive)', () => {
            expect(Env.parseBool('true', 'X', captureWarn)).toBe(true);
            expect(Env.parseBool('TRUE', 'X', captureWarn)).toBe(true);
            expect(Env.parseBool('yes',  'X', captureWarn)).toBe(true);
            expect(Env.parseBool('YES',  'X', captureWarn)).toBe(true);
            expect(Env.parseBool('on',   'X', captureWarn)).toBe(true);
            expect(Env.parseBool('1',    'X', captureWarn)).toBe(true);
            expect(warns.length).toBe(0);
        });

        test('preserves PrimaryRepoSyncService.parseEnabledFlag legacy false tokens: 0, false, no, off', () => {
            expect(Env.parseBool('false', 'X', captureWarn)).toBe(false);
            expect(Env.parseBool('FALSE', 'X', captureWarn)).toBe(false);
            expect(Env.parseBool('no',    'X', captureWarn)).toBe(false);
            expect(Env.parseBool('NO',    'X', captureWarn)).toBe(false);
            expect(Env.parseBool('off',   'X', captureWarn)).toBe(false);
            expect(Env.parseBool('0',     'X', captureWarn)).toBe(false);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined on unknown tokens', () => {
            expect(Env.parseBool('maybe',  'X', captureWarn)).toBe(undefined);
            expect(Env.parseBool('truthy', 'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(2);
        });
    });

    test.describe('parsePort', () => {
        test('returns undefined for absent', () => {
            expect(Env.parsePort(undefined, 'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(0);
        });

        test('decodes valid ports in 1..65535', () => {
            expect(Env.parsePort('1',     'X', captureWarn)).toBe(1);
            expect(Env.parsePort('8080',  'X', captureWarn)).toBe(8080);
            expect(Env.parsePort('65535', 'X', captureWarn)).toBe(65535);
            expect(warns.length).toBe(0);
        });

        test('warns + returns undefined for out-of-range / non-integer / non-numeric', () => {
            expect(Env.parsePort('0',     'X', captureWarn)).toBe(undefined);
            expect(Env.parsePort('65536', 'X', captureWarn)).toBe(undefined);
            expect(Env.parsePort('-1',    'X', captureWarn)).toBe(undefined);
            expect(Env.parsePort('3.14',  'X', captureWarn)).toBe(undefined);
            expect(Env.parsePort('abc',   'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(5);
        });
    });

    test.describe('parseUrl', () => {
        test('returns undefined for absent', () => {
            expect(Env.parseUrl(undefined, 'X', captureWarn)).toBe(undefined);
        });

        test('decodes + normalizes (strips trailing slash)', () => {
            expect(Env.parseUrl('https://example.com/',  'X', captureWarn)).toBe('https://example.com');
            expect(Env.parseUrl('https://example.com/x', 'X', captureWarn)).toBe('https://example.com/x');
        });

        test('warns + returns undefined for malformed URL', () => {
            expect(Env.parseUrl('not a url', 'X', captureWarn)).toBe(undefined);
            expect(Env.parseUrl('://bad',    'X', captureWarn)).toBe(undefined);
            expect(warns.length).toBe(2);
        });
    });

    test.describe('parseString', () => {
        test('passthrough identity', () => {
            expect(Env.parseString('hello')).toBe('hello');
            expect(Env.parseString('')).toBe('');
            expect(Env.parseString(undefined)).toBe(undefined);
        });
    });

    test.describe('setDeep', () => {
        test('sets value at simple path', () => {
            const obj = { a: { b: { c: 1 } } };
            Env.setDeep(obj, 'a.b.c', 42);
            expect(obj.a.b.c).toBe(42);
        });

        test('blocks prototype pollution via __proto__', () => {
            const obj = { a: {} };
            Env.setDeep(obj, 'a.__proto__.polluted', 'YES');
            expect({}.polluted).toBe(undefined);
        });

        test('blocks prototype pollution via constructor', () => {
            const obj = { a: {} };
            Env.setDeep(obj, 'a.constructor.prototype.polluted', 'YES');
            expect({}.polluted).toBe(undefined);
        });

        test('refuses to traverse non-object intermediate keys', () => {
            const obj = { a: { b: 'leaf' } };
            Env.setDeep(obj, 'a.b.c', 42);
            expect(obj.a.b).toBe('leaf');
        });
    });

    test.describe('applyEnvBindings', () => {
        test('applies string bindings from env', () => {
            const data = { name: '' };
            const bindings = { name: 'TEST_NAME' };
            const env = { TEST_NAME: 'orchestrator' };
            Env.applyEnvBindings(data, bindings, env);
            expect(data.name).toBe('orchestrator');
        });

        test('applies typed bindings with custom parser', () => {
            const data = { config: { port: 0 } };
            const bindings = { 'config.port': { var: 'TEST_PORT', parse: Env.parsePort } };
            const env = { TEST_PORT: '8080' };
            Env.applyEnvBindings(data, bindings, env);
            expect(data.config.port).toBe(8080);
        });

        test('skips bindings when env var absent (leaves existing data untouched)', () => {
            const data = { port: 99 };
            const bindings = { port: { var: 'TEST_ABSENT', parse: Env.parsePort } };
            Env.applyEnvBindings(data, bindings, {});
            expect(data.port).toBe(99);
        });

        test('skips bindings when parser returns undefined (malformed input warned)', () => {
            const data = { port: 99 };
            const bindings = { port: { var: 'TEST_BAD', parse: Env.parsePort } };
            Env.applyEnvBindings(data, bindings, { TEST_BAD: 'not-a-port' }, captureWarn);
            expect(data.port).toBe(99);
            expect(warns.length).toBe(1);
        });
    });
});
