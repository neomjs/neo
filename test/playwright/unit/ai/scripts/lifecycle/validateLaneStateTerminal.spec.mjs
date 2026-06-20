import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'ValidateLaneStateTerminalTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {validateLaneStateTerminal} from '../../../../../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

test.describe('validateLaneStateTerminal — turn-terminal evidence shape', () => {
    const NOW = '2026-06-20T00:00:00.000Z';

    test('valid next-lane passes', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'next-lane'});
        expect(result.valid).toBe(true);
        expect(result.violations).toEqual([]);
    });

    test('blocker-routed passes', () => {
        expect(validateLaneStateTerminal({laneContinuation: 'blocker-routed'}).valid).toBe(true);
    });

    test('active-lane passes when it is real work (not an own-PR watch)', () => {
        expect(validateLaneStateTerminal({laneContinuation: 'active-lane', awaitingOwnPrOnly: false}).valid).toBe(true);
    });

    test('a wakeDisposition alone is not a terminal', () => {
        const result = validateLaneStateTerminal({wakeDisposition: 'awareness'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('laneContinuation is required');
    });

    test('active-lane fails when it is only an own PR awaiting merge/review/CI', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'active-lane', awaitingOwnPrOnly: true});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('background watch');
    });

    test('a named gate without a same-turn checkedAt fails (the stale-merged-gate class)', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #13568'}]   // no checkedAt
        });
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('checkedAt');
    });

    test('a named gate WITH a same-turn checkedAt passes', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #13572', checkedAt: NOW}]
        });
        expect(result.valid).toBe(true);
    });

    test('verified-no-lane fails on an own-PR/own-epic slice (no full-backlog survey)', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'verified-no-lane',
            backlogSurvey   : {checkedAt: NOW, scope: 'own-pr'}
        });
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('full-backlog');
    });

    test('verified-no-lane fails when no survey is cited at all', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'verified-no-lane'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('full-backlog survey');
    });

    test('verified-no-lane passes with a named full-backlog survey + checkedAt', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'verified-no-lane',
            backlogSurvey   : {checkedAt: NOW, scope: 'full-backlog'}
        });
        expect(result.valid).toBe(true);
    });

    test('an unknown laneContinuation (e.g. "holding") fails', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'holding'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain("Unknown laneContinuation 'holding'");
    });
});
