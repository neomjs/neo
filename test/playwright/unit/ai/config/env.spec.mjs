import {setup} from '../../../setup.mjs';

const appName = 'AiConfigEnvTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Env            from '../../../../../src/util/Env.mjs';
import {buildEnv}     from '../../../../../ai/config/env.mjs';

test.describe('ai/config/env (binding registry)', () => {
    test('absent env var maps to undefined (preserves ?? fallback chain)', () => {
        const result = buildEnv({
            bindings: {FOO: Env.parseNumber, BAR: Env.parseBool},
            source  : {}
        });
        expect(result).toEqual({FOO: undefined, BAR: undefined});
    });

    test('valid env values are parsed per binding parser type', () => {
        const result = buildEnv({
            bindings: {COUNT: Env.parseNumber, ENABLED: Env.parseBool},
            source  : {COUNT: '42', ENABLED: 'true'}
        });
        expect(result).toEqual({COUNT: 42, ENABLED: true});
    });

    test('invalid env values map to undefined (parser warned, ?? still falls through)', () => {
        const warns  = [];
        const Parser = (raw, name) => Env.parseNumber(raw, name, (...args) => warns.push(args));
        const result = buildEnv({
            bindings: {COUNT: Parser},
            source  : {COUNT: 'not-a-number'}
        });
        expect(result.COUNT).toBeUndefined();
        expect(warns.length).toBe(1);
        expect(warns[0][0]).toContain('COUNT');
    });

    test('explicit ?? fallback still resolves to defaults when registry value is undefined', () => {
        const registry  = buildEnv({bindings: {LIMIT: Env.parseNumber}, source: {}});
        const fallback  = 99;
        expect(registry.LIMIT ?? fallback).toBe(99);
    });

    test('registry surfaces only declared bindings (no leakage from source env)', () => {
        const result = buildEnv({
            bindings: {ONE: Env.parseNumber},
            source  : {ONE: '1', TWO: '2', NEO_LEAK_TEST: 'leak'}
        });
        expect(Object.keys(result)).toEqual(['ONE']);
        expect(result.ONE).toBe(1);
    });

    test('mixed parser registry: bool + number coexist in same call', () => {
        const result = buildEnv({
            bindings: {
                NEO_ORCHESTRATOR_POLL_INTERVAL_MS: Env.parseNumber,
                NEO_ORCHESTRATOR_KB_SYNC_ENABLED : Env.parseBool
            },
            source: {
                NEO_ORCHESTRATOR_POLL_INTERVAL_MS: '5000',
                NEO_ORCHESTRATOR_KB_SYNC_ENABLED : 'false'
            }
        });
        expect(result).toEqual({
            NEO_ORCHESTRATOR_POLL_INTERVAL_MS: 5000,
            NEO_ORCHESTRATOR_KB_SYNC_ENABLED : false
        });
    });
});
