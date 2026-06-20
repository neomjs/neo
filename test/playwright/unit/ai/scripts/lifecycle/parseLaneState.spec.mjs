import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'ParseLaneStateTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {parseLaneState}            from '../../../../../../ai/scripts/lifecycle/parseLaneState.mjs';
import {validateLaneStateTerminal} from '../../../../../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

test.describe('parseLaneState — fenced lane-state block extraction', () => {
    test('parses a well-formed block into the descriptor', () => {
        const text = 'prose\n```lane-state\n{"wakeDisposition":"actionable","laneContinuation":"next-lane","namedGates":[{"ref":"PR #99","checkedAt":"2026-06-20T03:41:00Z"}],"awaitingOwnPrOnly":false,"backlogSurvey":null}\n```\ntail';
        const d = parseLaneState(text);
        expect(d.laneContinuation).toBe('next-lane');
        expect(d.namedGates).toHaveLength(1);
        expect(d.namedGates[0].ref).toBe('PR #99');
        expect(d.awaitingOwnPrOnly).toBe(false);
    });

    test('returns null when no lane-state block is present', () => {
        expect(parseLaneState('just some prose, no block')).toBe(null);
        expect(parseLaneState('```js\nconst x = 1;\n```')).toBe(null);
    });

    test('returns null for non-string input', () => {
        expect(parseLaneState(null)).toBe(null);
        expect(parseLaneState(undefined)).toBe(null);
        expect(parseLaneState({})).toBe(null);
    });

    test('throws on a present-but-malformed block (distinct from absent)', () => {
        const text = '```lane-state\n{ not valid json, }\n```';
        expect(() => parseLaneState(text)).toThrow(/present but its body is not valid JSON/);
    });

    test('the LAST block wins when multiple are present', () => {
        const text = '```lane-state\n{"laneContinuation":"active-lane"}\n```\n...later...\n```lane-state\n{"laneContinuation":"blocker-routed"}\n```';
        expect(parseLaneState(text).laneContinuation).toBe('blocker-routed');
    });

    test('normalizes missing optional fields to safe defaults', () => {
        const d = parseLaneState('```lane-state\n{"laneContinuation":"next-lane"}\n```');
        expect(d.namedGates).toEqual([]);
        expect(d.awaitingOwnPrOnly).toBe(false);
    });

    test('round-trips into validateLaneStateTerminal — the hook seam end-to-end (#12633)', () => {
        // A valid next-lane terminal emitted as a block parses + validates clean (the wired path fires PASS).
        const ok = '```lane-state\n{"wakeDisposition":"actionable","laneContinuation":"next-lane","namedGates":[{"ref":"PR #99","checkedAt":"2026-06-20T03:41:00Z","mergeClaim":false}],"awaitingOwnPrOnly":false}\n```';
        expect(validateLaneStateTerminal(parseLaneState(ok)).valid).toBe(true);

        // A stale-gate terminal (gate named without checkedAt) parses, then the validator REJECTS it —
        // proving the parse-then-validate seam fires the gate on real emitted text.
        const stale = '```lane-state\n{"laneContinuation":"active-lane","namedGates":[{"ref":"PR #100"}],"awaitingOwnPrOnly":false}\n```';
        const verdict = validateLaneStateTerminal(parseLaneState(stale));
        expect(verdict.valid).toBe(false);
        expect(verdict.violations.join(' ')).toContain('checkedAt');
    });
});
