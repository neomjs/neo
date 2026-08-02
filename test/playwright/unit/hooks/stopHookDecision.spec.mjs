import {test, expect} from '@playwright/test';
import {
    buildDeferenceStopHookDirective,
    classifyPromptingContext,
    decideDeferenceStopHookAction,
    decideStopHookAction,
    DEFAULT_MIN_COMPLIANT_DRIVES,
    detectAutonomousHandoffPrompt,
    evaluateCleanTerminalAcceptance,
    extractAutonomousHandoffWindowMs,
    isOperatorDialogueText,
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
        expect(LANE_STATE_SCHEMA_HINT).toContain('same-turn fetch evidence');
        expect(LANE_STATE_SCHEMA_HINT).toContain('field "mergedAt"');
    });

    test('LANE_STATE_SCHEMA_HINT: states consumption honesty — namedGates is audit/coordination payload, not a stop-license', () => {
        expect(LANE_STATE_SCHEMA_HINT).toContain('Consumption honesty');
        expect(LANE_STATE_SCHEMA_HINT).toContain('not a stop-license');
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
        expect(isSyntheticPromptingText('<task-notification>\n<task-id>b123</task-id>\n</task-notification>')).toBe(true);
        expect(isOperatorInLoop({stopHookActive: false, promptingText: '<task-notification>done</task-notification>'})).toBe(false);
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

    // ── decideStopHookAction: dialogue allow + active-lane refusal + transport behavior ─────────
    const verdict = {valid: false, reason: 'no lane-state block emitted at turn-terminal'};

    test('decideStopHookAction: a live operator dialogue is the only voluntary allow', () => {
        const decision = decideStopHookAction(verdict, {enforcing: true, operatorInLoop: true, blockInjectionSupported: true});
        expect(decision.action).toBe('allow');
        expect(decision.reason).toContain('live operator dialogue');
    });

    test('decideStopHookAction: active-lane + operator dialogue refuses in enforce and dry-run', () => {
        const options = {operatorInLoop: true, laneContinuation: 'active-lane', blockInjectionSupported: true};

        expect(decideStopHookAction(verdict, {...options, enforcing: true})).toMatchObject({
            action: 'block'
        });
        expect(decideStopHookAction(verdict, {...options, enforcing: false})).toMatchObject({
            action: 'would-block'
        });

        const reason = decideStopHookAction(verdict, {...options, enforcing: true}).reason;
        expect(reason).toContain('[active-lane-in-dialogue]');
        expect(reason).toContain('Answer-plus-drive, not answer-plus-stop');
        expect(reason).toContain('`next-lane` with gates naming non-self actors');

        expect(decideStopHookAction(verdict, {
            ...options,
            enforcing    : true,
            cleanTerminal: {accept: true, reason: '[clean-terminal] impossible dialogue input'}
        }).action).toBe('block');
    });

    test('decideStopHookAction: dialogue fail-open is exact — absent, malformed, and other continuations allow', () => {
        for (const laneContinuation of [null, undefined, '', 'next-lane', 'blocker-routed', 'ACTIVE-LANE', {value: 'active-lane'}]) {
            expect(decideStopHookAction(verdict, {enforcing: true, operatorInLoop: true, laneContinuation}).action)
                .toBe('allow');
        }
    });

    test('decideStopHookAction: autonomous behavior is byte-identical when laneContinuation is threaded', () => {
        const without = decideStopHookAction(verdict, {enforcing: true, operatorInLoop: false}),
              withOne = decideStopHookAction(verdict, {
                  enforcing       : true,
                  operatorInLoop  : false,
                  laneContinuation: 'active-lane'
              });

        expect(withOne).toEqual(without);
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
 * Coverage for mid-chain operator visibility (the operator-prompt-blindness defect): inside a forced
 * continuation chain, a genuine operator message that arrived mid-chain classifies as live dialogue —
 * but ONLY under the adapter's `promptingTextHumanFiltered` attestation that harness-injected records
 * were mechanically excluded. Without the attestation (the Codex adapter's current shape) chained turns
 * keep the fail-closed autonomous semantics byte-for-byte. Fixture corpus: sessions `2251c81c`,
 * `c82afc7d`, `8cf234b7` (operator messages injected mid-chain, invisible to the previous classifier).
 */
test.describe('ai/scripts/lifecycle/stopHookDecision — #14440 mid-chain operator visibility', () => {
    test('isOperatorDialogueText: the shared dialogue gates (single authority for both paths)', () => {
        expect(isOperatorDialogueText('please stop and report')).toBe(true);
        expect(isOperatorDialogueText('')).toBe(false);
        expect(isOperatorDialogueText('   ')).toBe(false);
        expect(isOperatorDialogueText('[WAKE][priority:high] 2 events')).toBe(false);
        expect(isOperatorDialogueText('  [WAKE] leading whitespace')).toBe(false);
        expect(isOperatorDialogueText('<hook_prompt hook_run_id="stop:1">noise</hook_prompt>')).toBe(false);
        expect(isOperatorDialogueText('<turn_aborted>interrupted</turn_aborted>')).toBe(false);
        expect(isOperatorDialogueText('nightshift mode for the next 5h, freely choose')).toBe(false);
        expect(isOperatorDialogueText(null)).toBe(false);
        expect(isOperatorDialogueText(undefined)).toBe(false);
    });

    test('chained + attested + genuine operator text → live dialogue (the Defect-B AC)', () => {
        const context = classifyPromptingContext({
            stopHookActive            : true,
            promptingText             : 'full stop. we need to talk about the release notes.',
            promptingTextHumanFiltered: true
        });
        expect(context.operatorInLoop).toBe(true);
        expect(context.midChainOperator).toBe(true);
    });

    test('chained + attested + [WAKE] candidate → autonomous (a newer wake out-classifies older dialogue)', () => {
        const context = classifyPromptingContext({
            stopHookActive            : true,
            promptingText             : '[WAKE][priority:normal] 1 events for @neo-opus-vega',
            promptingTextHumanFiltered: true
        });
        expect(context.operatorInLoop).toBe(false);
        expect(context.midChainOperator).toBe(false);
    });

    test('the lane-handback phrase blocks autonomously but stays carved in live dialogue (#16325 boundary)', () => {
        // The registry entry and the operator-dialogue carve are TWO independent gates, and both were
        // shut when this phrase was first observed. Proving the registry missed it says nothing about
        // the carve; this crosses classifyPromptingContext into the decision so the reachable boundary
        // is executable rather than asserted in prose.
        const slip = "That's next unless you'd rather I take something else.";

        const autonomous = classifyPromptingContext({
            stopHookActive: false,
            promptingText : '[WAKE][priority:high] 1 events for @neo-opus-vega'
        });
        expect(autonomous.operatorInLoop).toBe(false);
        expect(decideDeferenceStopHookAction(slip, autonomous)).not.toBeNull();

        const liveDialogue = classifyPromptingContext({
            stopHookActive: false,
            promptingText : 'please check messages, choose your lanes'
        });
        expect(liveDialogue.operatorInLoop).toBe(true);
        // Deliberately pinned as the CURRENT boundary, not as desired behavior: the live-dialogue case
        // that motivated the phrase is still uncaught, and ownership of that carve is a separate lane.
        expect(decideDeferenceStopHookAction(slip, liveDialogue)).toBeNull();
    });

    test('chained + attested + synthetic / handoff / empty candidates all fail closed', () => {
        for (const promptingText of [
            '<hook_prompt hook_run_id="stop:2">reminder</hook_prompt>',
            "nightshift mode from here on for the next 5h, you can freely choose. I merge when I get back.",
            ''
        ]) {
            const context = classifyPromptingContext({stopHookActive: true, promptingText, promptingTextHumanFiltered: true});
            expect(context.operatorInLoop).toBe(false);
            expect(context.midChainOperator).toBe(false);
        }
    });

    test('chained + NOT attested + genuine text → unchanged fail-closed autonomous (Codex-shape guard)', () => {
        const context = classifyPromptingContext({
            stopHookActive: true,
            promptingText : 'a real human question'
        });
        expect(context.operatorInLoop).toBe(false);
        expect(context.midChainOperator).toBe(false);
        expect(isOperatorInLoop({stopHookActive: true, promptingText: 'a real human question'})).toBe(false);
    });

    test('NON-chained turn: attestation adds nothing — midChainOperator stays false on the plain dialogue path', () => {
        const context = classifyPromptingContext({
            stopHookActive            : false,
            promptingText             : 'please review the PR',
            promptingTextHumanFiltered: true
        });
        expect(context.operatorInLoop).toBe(true);
        expect(context.midChainOperator).toBe(false);
    });

    test('isOperatorInLoop passes the attestation through (chained operator rescue end-to-end)', () => {
        expect(isOperatorInLoop({stopHookActive: true, promptingText: 'please stop', promptingTextHumanFiltered: true})).toBe(true);
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

/**
 * The clean-terminal acceptance seam — the ONE audited autonomous stop. Full condition matrix at
 * the pure layer (the adapter e2e covers composition): validity, gate hand-off, self-identity
 * fail-closed, the drive-ratchet, and the operator-turn waiver. The no-hold principle stays the
 * default: every rejection reason names what to do instead of stopping.
 */
test.describe('stopHookDecision — evaluateCleanTerminalAcceptance (the audited autonomous stop)', () => {
    const nonSelfGate = {ref: '#15274', checkedAt: '2026-07-16T18:00:00Z', nextActor: '@neo-gpt-emmy'},
          selfGate    = {ref: 'PR #15288', checkedAt: '2026-07-16T18:00:00Z', nextActor: '@neo-fable'},
          base        = {
              verdictValid   : true,
              namedGates     : [nonSelfGate],
              selfIdentity   : '@neo-fable',
              compliantDrives: 2
          };

    test('the accepting shape: valid + ≥1 gate, all non-self + ratchet met + identity known → [clean-terminal]', () => {
        const result = evaluateCleanTerminalAcceptance(base);
        expect(result.accept).toBe(true);
        expect(result.reason).toContain('[clean-terminal]');
        expect(result.reason).toContain('non-self actors');
        expect(result.reason).toContain('2 compliant drives');

        // The real harness wiring provides the BARE handle (`NEO_AGENT_IDENTITY=neo-fable`); the
        // canonical `@`-form gate actor must still read as non-self-vs-self correctly either way.
        expect(evaluateCleanTerminalAcceptance({...base, selfIdentity: 'neo-fable'}).accept).toBe(true);
    });

    test('an invalid verdict never accepts — acceptance sits ON TOP of the validator, not beside it', () => {
        const result = evaluateCleanTerminalAcceptance({...base, verdictValid: false});
        expect(result.accept).toBe(false);
        expect(result.reason).toContain('valid lane-state terminal');
    });

    test('no named gates → no acceptance (nothing handed off is not a clean terminal)', () => {
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: []}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: 'nope'}).accept).toBe(false);
    });

    test('a gate without nextActor, or awaiting the agent itself, defeats acceptance (case-insensitive)', () => {
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [{ref: '#1', checkedAt: 'now'}]}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [nonSelfGate, selfGate]}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [{...selfGate, nextActor: '@NEO-FABLE'}]}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [{...nonSelfGate, nextActor: '   '}]}).accept).toBe(false);
        // Cross-form self-detection: a bare `NEO_AGENT_IDENTITY` self vs a canonical `@`-form gate
        // actor (and the inverse) — without `@`-prefix normalization on BOTH sides, a self-awaiting
        // gate written in the other form passed as non-self and minted an unearned acceptance.
        expect(evaluateCleanTerminalAcceptance({...base, selfIdentity: 'neo-fable', namedGates: [selfGate]}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [{...selfGate, nextActor: 'neo-fable'}]}).accept).toBe(false);
    });

    test('unknown self-identity fails CLOSED — the edge is opt-in per harness wiring', () => {
        expect(evaluateCleanTerminalAcceptance({...base, selfIdentity: ''}).accept).toBe(false);
        expect(evaluateCleanTerminalAcceptance({...base, selfIdentity: undefined}).accept).toBe(false);
    });

    test('the drive-ratchet: below DEFAULT_MIN_COMPLIANT_DRIVES refuses with the count named', () => {
        expect(DEFAULT_MIN_COMPLIANT_DRIVES).toBe(2);

        const zero = evaluateCleanTerminalAcceptance({...base, compliantDrives: 0}),
              one  = evaluateCleanTerminalAcceptance({...base, compliantDrives: 1});

        expect(zero.accept).toBe(false);
        expect(zero.reason).toContain('0/2 compliant refused drives');
        expect(one.accept).toBe(false);
        expect(one.reason).toContain('drive a lane first');
        // the threshold is tunable at the seam
        expect(evaluateCleanTerminalAcceptance({...base, compliantDrives: 1, minCompliantDrives: 1}).accept).toBe(true);
    });

    test('the operator-turn waiver: a live operator turn is turn-taking, not a dodge — ratchet waived', () => {
        const result = evaluateCleanTerminalAcceptance({...base, compliantDrives: 0, operatorTurnNext: true});
        expect(result.accept).toBe(true);
        expect(result.reason).toContain('operator turn next (ratchet waived)');
        // the waiver does NOT bypass the gate conditions:
        expect(evaluateCleanTerminalAcceptance({...base, namedGates: [selfGate], compliantDrives: 0, operatorTurnNext: true}).accept).toBe(false);
    });

    test('decideStopHookAction: an accepted clean terminal ALLOWS with its audit line — even enforcing', () => {
        const accepted = {accept: true, reason: '[clean-terminal] valid terminal accepted — audited'};

        expect(decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: true, cleanTerminal: accepted}))
            .toEqual({action: 'allow', reason: accepted.reason});
        expect(decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: false, cleanTerminal: accepted}).action)
            .toBe('allow');
    });

    test('decideStopHookAction: a rejected/absent evaluation changes nothing — block/would-block as before', () => {
        const rejected = {accept: false, reason: 'drive-ratchet not met'};

        expect(decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: true, cleanTerminal: rejected}).action).toBe('block');
        expect(decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: true, cleanTerminal: null}).action).toBe('block');
        // a malformed acceptance object (truthy accept that is not === true) stays a block: fail-closed
        expect(decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: true, cleanTerminal: {accept: 'yes'}}).action).toBe('block');
    });

    test('decideStopHookAction: operator dialogue still wins with its own reason (precedence unchanged)', () => {
        const accepted = {accept: true, reason: '[clean-terminal] x'},
              result   = decideStopHookAction({valid: true, reason: 'ok'}, {enforcing: true, operatorInLoop: true, cleanTerminal: accepted});

        expect(result.action).toBe('allow');
        expect(result.reason).toContain('live operator dialogue');
    });

    test('LANE_STATE_SCHEMA_HINT documents nextActor + the audited acceptance without minting a self-license', () => {
        expect(LANE_STATE_SCHEMA_HINT).toContain('nextActor');
        expect(LANE_STATE_SCHEMA_HINT).toContain('[clean-terminal]');
        expect(LANE_STATE_SCHEMA_HINT).toContain('never self-declarable');
        expect(LANE_STATE_SCHEMA_HINT).toContain('not a stop-license');
    });
});

test.describe('decideStopHookAction — the material-artifact key (the autonomous-quadrant primary allow)', () => {
    const valid = {valid: true, reason: 'valid lane-state terminal'};

    test('an accepted material key allows an AUTONOMOUS turn, carrying the material reason', () => {
        const out = decideStopHookAction(valid, {
            enforcing       : true,
            operatorInLoop  : false,
            materialArtifact: {accept: true, reason: '[material-allow] 1 material artifact (pr-opened #7) + a valid terminal'}
        });

        expect(out).toEqual({action: 'allow', reason: '[material-allow] 1 material artifact (pr-opened #7) + a valid terminal'})
    });

    test('material outranks the clean-terminal fallback when both accept (the primary key wins the reason)', () => {
        const out = decideStopHookAction(valid, {
            enforcing       : true,
            operatorInLoop  : false,
            cleanTerminal   : {accept: true, reason: '[clean-terminal] fallback'},
            materialArtifact: {accept: true, reason: '[material-allow] primary'}
        });

        expect(out.reason).toBe('[material-allow] primary')
    });

    test('a REFUSED material key changes nothing: today\'s teeth stand (block under enforce), and the clean-terminal fallback still works alone', () => {
        const blocked = decideStopHookAction(valid, {
            enforcing       : true,
            operatorInLoop  : false,
            materialArtifact: {accept: false, reason: 'no material lifecycle artifact'}
        });
        expect(blocked.action).toBe('block');

        const fallback = decideStopHookAction(valid, {
            enforcing       : true,
            operatorInLoop  : false,
            cleanTerminal   : {accept: true, reason: '[clean-terminal] all gates non-self + ratchet met'},
            materialArtifact: {accept: false, reason: 'no artifact'}
        });
        expect(fallback).toEqual({action: 'allow', reason: '[clean-terminal] all gates non-self + ratchet met'})
    });

    test('the dialogue quadrant is untouched: operator dialogue allows regardless of the material key (regression pin)', () => {
        const out = decideStopHookAction(valid, {
            enforcing       : true,
            operatorInLoop  : true,
            materialArtifact: {accept: false, reason: 'no artifact'}
        });

        expect(out).toEqual({action: 'allow', reason: 'live operator dialogue — yielding for the human turn'})
    })
});
