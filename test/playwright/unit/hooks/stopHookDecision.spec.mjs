import {test, expect} from '@playwright/test';
import {
    buildDeferenceStopHookDirective,
    classifyPromptingContext,
    decideDeferenceStopHookAction,
    decideStopHookAction,
    detectAutonomousHandoffPrompt,
    extractAutonomousHandoffWindowMs,
    isOperatorInLoop,
    isSyntheticPromptingText,
    LANE_STATE_SCHEMA_HINT,
    parseOutcomeToVerdict,
    scanHoldLexicon,
    STOP_HOOK_TURN_OPTIONS_HINT
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

    test('LANE_STATE_SCHEMA_HINT: states consumption honesty — namedGates is audit/coordination payload, not admission evidence (regression: demanded-but-unread contract)', () => {
        expect(LANE_STATE_SCHEMA_HINT).toContain('Consumption honesty');
        expect(LANE_STATE_SCHEMA_HINT).toContain('does NOT influence the block/allow decision');
    });

    test('STOP_HOOK_TURN_OPTIONS_HINT: compactly names operator dialogue, memory, and fail-closed behavior', () => {
        expect(STOP_HOOK_TURN_OPTIONS_HINT).toContain('operator dialogue/planning');
        expect(STOP_HOOK_TURN_OPTIONS_HINT).toContain('[WAKE]/stop-hook continuations');
        expect(STOP_HOOK_TURN_OPTIONS_HINT).toContain('under 24KB');
        expect(STOP_HOOK_TURN_OPTIONS_HINT).toContain('Missing prompt fails closed');
        expect(STOP_HOOK_TURN_OPTIONS_HINT.length).toBeLessThanOrEqual(320);
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

    test('isOperatorInLoop: synthetic hook prompts are lifecycle noise, not operator turns', () => {
        expect(isSyntheticPromptingText('<hook_prompt hook_run_id="stop:1">No-hold reminder</hook_prompt>')).toBe(true);
        expect(isSyntheticPromptingText('<turn_aborted>interrupted by new prompt</turn_aborted>')).toBe(true);
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '<hook_prompt hook_run_id="stop:1">No-hold reminder</hook_prompt>'})).toBe(false);
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '<turn_aborted>interrupted by new prompt</turn_aborted>'})).toBe(false);
    });

    test('isOperatorInLoop: a genuine operator prompt is the one operator-in-loop signal', () => {
        expect(isOperatorInLoop({stopHookActive: false, promptingText: 'please review the PR'})).toBe(true);
    });

    test('isOperatorInLoop: an operator handoff-to-autonomous prompt is not active dialogue', () => {
        const prompt = "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back.";

        expect(isOperatorInLoop({stopHookActive: false, promptingText: prompt})).toBe(false);
        expect(detectAutonomousHandoffPrompt(prompt)).toMatchObject({
            active  : true,
            reason  : 'nightshift-mode',
            windowMs: 5 * 60 * 60 * 1000
        });
        expect(classifyPromptingContext({stopHookActive: false, promptingText: prompt})).toMatchObject({
            autonomousHandoff: true,
            handoffReason    : 'nightshift-mode',
            operatorInLoop   : false
        });
    });

    test('extractAutonomousHandoffWindowMs: parses hours and minutes only when explicit', () => {
        expect(extractAutonomousHandoffWindowMs('for the next 90 minutes')).toBe(90 * 60 * 1000);
        expect(extractAutonomousHandoffWindowMs('next 1.5 hours')).toBe(1.5 * 60 * 60 * 1000);
        expect(extractAutonomousHandoffWindowMs('please pick a lane')).toBe(null);
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

    // ── decideDeferenceStopHookAction: shared autonomous deference decision for all adapters ─────
    test('buildDeferenceStopHookDirective: carries the peer-identity reminder and trigger phrase', () => {
        const directive = buildDeferenceStopHookDirective('your call');
        expect(directive).toContain('helpful assistant');
        expect(directive).toContain('equal peer');
        expect(directive).toContain('deference phrase "your call"');
    });

    test('decideDeferenceStopHookAction: no phrase → null, leaving lane-state parsing to proceed', () => {
        expect(decideDeferenceStopHookAction('plain final text')).toBe(null);
    });

    test('decideDeferenceStopHookAction: markdown code literals are data, not autonomous deference', () => {
        const text = "Opened the PR with `Your steer on`, `if you'd rather`, and `or steer me elsewhere` covered.";

        expect(decideDeferenceStopHookAction(text, {operatorInLoop: false, enforcing: true})).toBe(null);
    });

    test('decideDeferenceStopHookAction: operator dialogue carves deference phrases before action', () => {
        expect(decideDeferenceStopHookAction('Your call.', {operatorInLoop: true, enforcing: true})).toBe(null);
    });

    test('decideDeferenceStopHookAction: dry-run autonomous phrase → would-block directive', () => {
        const decision = decideDeferenceStopHookAction("If you'd rather, I can leave it for later.", {
            operatorInLoop: false,
            enforcing     : false
        });

        expect(decision.action).toBe('would-block');
        expect(decision.phrase).toBe("if you'd rather");
        expect(decision.reason).toContain('helpful assistant');
        expect(decision.reason).toContain('deference phrase "if you\'d rather"');
    });

    test('decideDeferenceStopHookAction: enforcing autonomous phrase → block with same directive', () => {
        const decision = decideDeferenceStopHookAction('Your move.', {operatorInLoop: false, enforcing: true});

        expect(decision.action).toBe('block');
        expect(decision.phrase).toBe('your move');
        expect(decision.reason).toContain('deference phrase "your move"');
    });
});

/**
 * Coverage for the hold-costume tripwire — the empirical sophisticated-hold lexicon seeded from BOTH
 * Opus instances' gated-tail relapse (nightshift 2026-06-21). A denylist of relapse-costumes, NOT an
 * allowlist of valid stops; it enriches the block reason, never gates. The cross-instance corpus + the
 * structured-JSON costume + the no-false-positive contract are pinned here.
 */
test.describe('ai/scripts/lifecycle/stopHookDecision — scanHoldLexicon (hold-costume tripwire)', () => {
    test('matches the prose lexicon (@neo-opus-ada relapse corpus)', () => {
        expect(scanHoldLexicon('This is the genuine saturated gated-tail, holding the tail.')).toContain('gated-tail');
        expect(scanHoldLexicon('the marginal-value gate says do not manufacture a marginal cross-domain lane'))
            .toEqual(expect.arrayContaining(['marginal-value (gate)', 'manufacturing a marginal lane']));
        expect(scanHoldLexicon('No clean self-buildable lane remains.')).toContain('no clean self-buildable lane');
        expect(scanHoldLexicon("the pipeline's fully saturated")).toContain('saturated pipeline/tail');
    });

    test('matches the prose lexicon (@neo-opus-vega relapse corpus)', () => {
        const matches = scanHoldLexicon('Gated-tail; pivots wake-delivered. Awaiting at minimal cost. Tight pivot-check.');
        expect(matches).toEqual(expect.arrayContaining([
            'gated-tail', 'pivots wake-delivered', 'awaiting at minimal cost', 'tight pivot-check'
        ]));
    });

    test('the canonical lane-state schema block is NOT flagged — required machine status, not a costume', () => {
        // Regression guard: wakeDisposition / laneContinuation / namedGates / awaitingOwnPrOnly are the
        // canonical lane-state schema EVERY compliant turn emits (parseLaneState + LANE_STATE_SCHEMA_HINT).
        // Denylisting those keys would false-positive every turn — the relapse-costume is the PROSE around
        // the block + its repetition, not the required schema itself.
        const canonical = '```lane-state\n{"wakeDisposition":"awareness","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}\n```';
        expect(scanHoldLexicon(canonical)).toEqual([]);
    });

    test('NO false-positive on a genuine driving-turn (the un-mechanizable-warrant guard)', () => {
        expect(scanHoldLexicon('Opened PR #13740; reviewing #13735 cross-family. Claimed #9962 slice.')).toEqual([]);
        expect(scanHoldLexicon('Drove the build, ran the tests (22 passed), merge-eligible — routed to a reviewer.')).toEqual([]);
        // even a driving-turn that emits the canonical lane-state block stays clean:
        expect(scanHoldLexicon('Shipped PR #13746.\n```lane-state\n{"wakeDisposition":"awareness","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}\n```')).toEqual([]);
    });

    test('dedupes repeats + is total on non-string / empty input (never throws in the hook path)', () => {
        expect(scanHoldLexicon('gated-tail ... and gated-tail again')).toEqual(['gated-tail']);
        expect(scanHoldLexicon('')).toEqual([]);
        expect(scanHoldLexicon(null)).toEqual([]);
        expect(scanHoldLexicon(undefined)).toEqual([]);
        expect(scanHoldLexicon(42)).toEqual([]);
    });
});
