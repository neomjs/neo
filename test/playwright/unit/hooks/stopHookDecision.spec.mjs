import {test, expect} from '@playwright/test';
import {
    decideStopHookAction,
    isOperatorInLoop,
    LANE_STATE_SCHEMA_HINT,
    parseOutcomeToVerdict
}                        from '../../../../ai/scripts/lifecycle/stopHookDecision.mjs';

/**
 * Direct coverage for the shared no-hold Stop-hook decision primitives — the cross-harness
 * source-of-authority both the Claude and Codex hooks consume. The hook specs exercise these
 * indirectly; this spec pins the helper's own branches (especially the Codex-only
 * `blockInjectionSupported:false` + `blockUnsupportedReason` paths) so the shared layer cannot
 * silently drift while the hook-level tests stay green. Pure functions — no hook, no I/O.
 */
test.describe('ai/scripts/lifecycle/stopHookDecision — shared no-hold decision primitives', () => {
    test('LANE_STATE_SCHEMA_HINT: shows the fenced machine block shape consumed by parseLaneState', () => {
        expect(LANE_STATE_SCHEMA_HINT).toContain('```lane-state');
        expect(LANE_STATE_SCHEMA_HINT).toContain('"wakeDisposition":"awareness"');
        expect(LANE_STATE_SCHEMA_HINT).toContain('"laneContinuation":"next-lane"');
        expect(LANE_STATE_SCHEMA_HINT).toContain('"namedGates":[]');
        expect(LANE_STATE_SCHEMA_HINT).toContain('"awaitingOwnPrOnly":false');
        expect(LANE_STATE_SCHEMA_HINT).toContain('awaitingOwnPrOnly:true is invalid');
        expect(LANE_STATE_SCHEMA_HINT).toContain('same-turn checkedAt');
        expect(LANE_STATE_SCHEMA_HINT).toContain('field "mergedAt"');
    });

    // ── parseOutcomeToVerdict: the 3-bucket parse → verdict chain ──────────────────────────────
    test('parseOutcomeToVerdict: a parse error is a malformed-emission verdict (not valid)', () => {
        const verdict = parseOutcomeToVerdict({descriptor: null, parseError: new Error('bad json')}, () => ({valid: true}));
        expect(verdict.valid).toBe(false);
        expect(verdict.reason).toContain('malformed lane-state emission');
        expect(verdict.reason).toContain('bad json');
    });

    test('parseOutcomeToVerdict: an absent descriptor is a distinct no-emission verdict', () => {
        expect(parseOutcomeToVerdict({descriptor: null, parseError: null}, () => ({valid: true})))
            .toEqual({valid: false, reason: 'no lane-state block emitted at turn-terminal'});
    });

    test('parseOutcomeToVerdict: a valid descriptor delegates to validate → valid verdict', () => {
        expect(parseOutcomeToVerdict({descriptor: {x: 1}, parseError: null}, () => ({valid: true})))
            .toEqual({valid: true, reason: 'valid lane-state terminal'});
    });

    test('parseOutcomeToVerdict: an invalid descriptor joins the validator violations into the reason', () => {
        expect(parseOutcomeToVerdict({descriptor: {x: 1}, parseError: null}, () => ({valid: false, violations: ['a', 'b']})))
            .toEqual({valid: false, reason: 'a; b'});
    });

    test('parseOutcomeToVerdict: an invalid descriptor with no violations falls back to a generic reason', () => {
        expect(parseOutcomeToVerdict({descriptor: {x: 1}, parseError: null}, () => ({valid: false, violations: []})))
            .toEqual({valid: false, reason: 'invalid lane-state terminal'});
    });

    // ── isOperatorInLoop: external operator-vs-autonomous determination (fail-closed) ───────────
    test('isOperatorInLoop: a forced continuation (stopHookActive) is never operator-driven', () => {
        expect(isOperatorInLoop({stopHookActive: true, promptingText: 'a real human question'})).toBe(false);
    });

    test('isOperatorInLoop: an empty / unconfirmable prompt fails closed to autonomous', () => {
        expect(isOperatorInLoop({stopHookActive: false, promptingText: ''})).toBe(false);
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '   '})).toBe(false);
    });

    test('isOperatorInLoop: a [WAKE] prompt is an autonomous injection, not an operator turn', () => {
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '[WAKE] 1 event'})).toBe(false);
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '  [WAKE] leading whitespace'})).toBe(false);
    });

    test('isOperatorInLoop: a genuine operator prompt is the one operator-in-loop signal', () => {
        expect(isOperatorInLoop({stopHookActive: false, promptingText: 'please review the PR'})).toBe(true);
    });

    // ── decideStopHookAction: operatorInLoop is the only allow; block-support gates block vs would-block ──
    const verdict = {valid: false, reason: 'no lane-state block emitted at turn-terminal'};

    test('decideStopHookAction: a live operator dialogue is the only voluntary allow', () => {
        const decision = decideStopHookAction(verdict, {enforcing: true, operatorInLoop: true, blockInjectionSupported: true});
        expect(decision.action).toBe('allow');
        expect(decision.reason).toContain('live operator dialogue');
    });

    test('decideStopHookAction: enforce + block-supported (Claude) → block, carrying the verdict reason', () => {
        expect(decideStopHookAction(verdict, {enforcing: true, operatorInLoop: false, blockInjectionSupported: true}))
            .toEqual({action: 'block', reason: verdict.reason});
    });

    test('decideStopHookAction: dry-run → would-block (the audit path), even when block is supported', () => {
        expect(decideStopHookAction(verdict, {enforcing: false, operatorInLoop: false, blockInjectionSupported: true}))
            .toEqual({action: 'would-block', reason: verdict.reason});
    });

    test('decideStopHookAction: enforce + block UNsupported (Codex fail-open) → would-block with the support-suffix', () => {
        const decision = decideStopHookAction(verdict, {
            enforcing              : true,
            operatorInLoop         : false,
            blockInjectionSupported: false,
            blockUnsupportedReason : '(block/inject unproven)'
        });
        expect(decision.action).toBe('would-block');
        expect(decision.reason).toBe(`${verdict.reason} (block/inject unproven)`);
    });

    test('decideStopHookAction: enforce + block UNsupported + no suffix → would-block with the bare reason', () => {
        expect(decideStopHookAction(verdict, {enforcing: true, operatorInLoop: false, blockInjectionSupported: false}))
            .toEqual({action: 'would-block', reason: verdict.reason});
    });

    test('decideStopHookAction: defaults (no options) → would-block, never a fail-open allow', () => {
        expect(decideStopHookAction(verdict).action).toBe('would-block');
    });
});
