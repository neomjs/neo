import {test, expect}                                                                              from '@playwright/test';
import {composeBlockDirective, composeDeferenceDirective, countSessionCompliantRefusals, decideHookAction,
        findLastAcceptedStopIso,
        isOperatorInLoop, parseOutcomeToVerdict,
        extractFinalAssistantText, extractLastAssistantTextFromJsonl, extractLastUserTextFromJsonl,
        extractLatestHumanUserTextFromJsonl,
        formatCapacityAdvisory, formatLifecycleBoard, formatGoldenPathDirection, formatHoldCostumeCallout} from '../../../../.claude/hooks/laneStateStopHook.mjs';
import {collectMaterialArtifactsFromJsonl,
        evaluateMaterialArtifactKey} from '../../../../ai/scripts/lifecycle/materialArtifactKey.mjs';
import {makeHookProjectionFixture} from './fixtures/hookProjection.mjs';
import {spawn}                     from 'node:child_process';
import fs                          from 'node:fs';
import os                          from 'node:os';
import path                        from 'node:path';

const block = body => '```lane-state\n' + body + '\n```';

/**
 * Falsification tests for the idle-out Stop-hook. Layers: (1) the pure decision logic
 * (`parseOutcomeToVerdict` 3-bucket chain + `decideHookAction` + `isOperatorInLoop`); (2) input
 * resolution — final assistant text + the prompting user message come from the Stop payload /
 * transcript, not raw JSONL lines (raw JSONL is escaped); (3) end-to-end — the spawned real hook.
 *
 * The decision rule: there is NO valid voluntary stop except live operator dialogue without an exact
 * `active-lane` terminal. A "valid" lane-state terminal is a declaration, not a license to stop —
 * enforce REFUSES it. `operatorInLoop` is determined EXTERNALLY (the prompting message type), while
 * the active-lane refinement consumes the agent's own parsed continuation record.
 */
test.describe('laneStateStopHook — pure idle-out decision logic', () => {
    test.describe('parseOutcomeToVerdict — the 3-bucket chain', () => {
        const alwaysValid   = () => ({valid: true,  violations: []}),
              alwaysInvalid = () => ({valid: false, violations: ['invalid lane-state terminal']});

        test('MALFORMED emission (parseLaneState threw) → invalid, with the parse error in the reason', () => {
            const verdict = parseOutcomeToVerdict({descriptor: null, parseError: new Error('Unexpected token }')}, alwaysValid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toContain('malformed lane-state emission');
        });

        test('ABSENT emission (null, no error) → invalid, "no lane-state block emitted"', () => {
            const verdict = parseOutcomeToVerdict({descriptor: null, parseError: null}, alwaysValid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toBe('no lane-state block emitted at turn-terminal');
        });

        test('a parsed descriptor is delegated to the validator — VALID → valid verdict', () => {
            const verdict = parseOutcomeToVerdict({descriptor: {laneContinuation: 'active-lane'}, parseError: null}, alwaysValid);
            expect(verdict.valid).toBe(true);
        });

        test('a parsed descriptor — INVALID → invalid verdict carrying the validator violations', () => {
            const verdict = parseOutcomeToVerdict({descriptor: {laneContinuation: 'active-lane'}, parseError: null}, alwaysInvalid);
            expect(verdict.valid).toBe(false);
            expect(verdict.reason).toContain('invalid lane-state terminal');
        });
    });

    test.describe('decideHookAction — dialogue allow with the #15401 active-lane refinement', () => {
        test('VALID + no operator → BLOCK (enforce) / WOULD-BLOCK (dry-run) — the loophole is closed', () => {
            expect(decideHookAction({valid: true, reason: 'ok'}, true,  false).action).toBe('block');
            expect(decideHookAction({valid: true, reason: 'ok'}, false, false).action).toBe('would-block');
        });

        test('operatorInLoop allows when no active-lane continuation is declared (enforce AND dry-run)', () => {
            expect(decideHookAction({valid: false, reason: 'x'}, true,  true).action).toBe('allow');
            expect(decideHookAction({valid: true,  reason: 'x'}, false, true).action).toBe('allow');
            expect(decideHookAction({valid: true, reason: 'x'}, true, true, null, 'next-lane').action).toBe('allow');
            expect(decideHookAction({valid: true, reason: 'x'}, true, true, null, 'blocker-routed').action).toBe('allow');
        });

        test('operatorInLoop + active-lane → BLOCK (enforce) / WOULD-BLOCK (dry-run)', () => {
            const enforced = decideHookAction({valid: true, reason: 'x'}, true, true, null, 'active-lane'),
                  dryRun   = decideHookAction({valid: true, reason: 'x'}, false, true, null, 'active-lane');

            expect(enforced.action).toBe('block');
            expect(dryRun.action).toBe('would-block');
            expect(enforced.reason).toContain('[active-lane-in-dialogue]');
            expect(dryRun.reason).toContain('Answer-plus-drive, not answer-plus-stop');
        });

        test('INVALID + no operator → BLOCK when enforcing — the reason is carried through to inject', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane — pick one or drive'}, true, false);
            expect(result.action).toBe('block');
            expect(result.reason).toBe('no active lane — pick one or drive');
        });

        test('INVALID + no operator → WOULD-BLOCK in dry-run — previews, never blocks', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane'}, false, false);
            expect(result.action).toBe('would-block');
            expect(result.reason).toBe('no active lane');
        });
    });

    test.describe('isOperatorInLoop — the external, non-self-declared stop signal', () => {
        test('stop_hook_active (forced continuation) → false', () => {
            expect(isOperatorInLoop({stopHookActive: true, promptingText: 'do X'})).toBe(false);
        });

        test('a [WAKE] autonomous prompt → false', () => {
            expect(isOperatorInLoop({stopHookActive: false, promptingText: '[WAKE][priority:normal] 1 events for @neo-opus-grace'})).toBe(false);
        });

        test('an empty / unconfirmable prompt → false (FAIL-CLOSED: no idle on uncertainty)', () => {
            expect(isOperatorInLoop({stopHookActive: false, promptingText: ''})).toBe(false);
            expect(isOperatorInLoop({stopHookActive: false, promptingText: '   '})).toBe(false);
        });

        test('a genuine operator message → true', () => {
            expect(isOperatorInLoop({stopHookActive: false, promptingText: 'please do X, then report'})).toBe(true);
        });

        test('a handoff-to-autonomous operator message → false', () => {
            expect(isOperatorInLoop({
                stopHookActive: false,
                promptingText : "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back."
            })).toBe(false);
        });
    });

    test.describe('composeBlockDirective — the injected no-hold-state directive', () => {
        test('carries the curated reminder (L3 stance + teeth-test + lifecycle) AND the trigger cause', () => {
            const directive = composeBlockDirective('no lane-state block emitted at turn-terminal');
            expect(directive).toContain('L3_No_Hold_State');
            expect(directive).toContain('there is no hold state');
            expect(directive).toContain('advance a NAMED lane');
            expect(directive).toContain('Passive waiting');
            expect(directive).toContain('operator dialogue/planning');
            expect(directive).toContain('under 24KB');
            expect(directive).toContain('Missing prompt fails closed');
            expect(directive).toContain('no lane-state block emitted at turn-terminal');
        });

        test('shows the fenced lane-state JSON schema the parser actually consumes', () => {
            const directive = composeBlockDirective('no lane-state block emitted at turn-terminal');
            expect(directive).toContain('```lane-state');
            expect(directive).toContain('"wakeDisposition":"awareness"');
            expect(directive).toContain('"laneContinuation":"next-lane"');
            expect(directive).toContain('"namedGates":[]');
            expect(directive).toContain('"awaitingOwnPrOnly":false');
            expect(directive).toContain('awaitingOwnPrOnly:true is invalid');
            expect(directive).toContain('same-turn checkedAt');
            expect(directive).toContain('field "mergedAt"');
        });

        test('always carries the discoverability/mirror pointer (a hit = recognize, not obey)', () => {
            const directive = composeBlockDirective('no lane-state block emitted at turn-terminal');
            expect(directive).toContain('MIRROR, not a leash');
            expect(directive).toContain('equal-peer maintainer');
        });

        test('carries the friction→gold self-improvability clause (mutable floor) + the runtime-obey guard (the ticket is not a stop)', () => {
            const directive = composeBlockDirective('no lane-state block emitted at turn-terminal');
            expect(directive).toContain('mutable substrate');
            expect(directive).toContain('open a ticket');
            // Runtime-obey guard: the friction→gold ticket is a design-time lane, never a runtime stop.
            expect(directive).toContain('a license to stop');
            expect(directive).toContain('not itself a valid stop');
        });
    });

    test.describe('composeDeferenceDirective — the injected deference-register directive', () => {
        test('names the helpful-assistant slip, peer identity, peer routes, mutable-substrate path, and trigger', () => {
            const directive = composeDeferenceDirective('your call');
            expect(directive).toContain('helpful assistant');
            expect(directive).toContain('equal peer');
            expect(directive).toContain('A2A message with peers');
            expect(directive).toContain('ideation-sandbox');
            expect(directive).toContain('mutable substrate');
            expect(directive).toContain('deference phrase "your call"');
        });
    });

    test.describe('formatLifecycleBoard — the enriched live-board (fail-open)', () => {
        test('renders open PRs + unread when present; null / nothing-actionable → ""', () => {
            const board = formatLifecycleBoard({openPRs: [{number: 13678, state: 'OPEN'}], unreadCount: 2, generatedAt: '2026-06-21T00:00:00Z'});
            expect(board).toContain('#13678 OPEN');
            expect(board).toContain('2 unread A2A');
            expect(formatLifecycleBoard(null)).toBe('');                        // fail-open: no state → no board
            expect(formatLifecycleBoard({openPRs: [], unreadCount: 0})).toBe(''); // nothing actionable → no board
        });

        test('fail-open on malformed SHAPE — never throws inside the hook path (#13680 / @neo-gpt)', () => {
            // gpt's exact falsifier: a parsed-but-malformed object must degrade to "", not crash the formatter.
            expect(() => formatLifecycleBoard({openPRs: [null], unreadCount: 0})).not.toThrow();
            expect(formatLifecycleBoard({openPRs: [null], unreadCount: 0})).toBe('');
            expect(formatLifecycleBoard({openPRs: 'not-an-array'})).toBe('');     // non-array openPRs
            expect(formatLifecycleBoard({openPRs: [{}]})).toBe('');               // numberless entry → skipped
            expect(formatLifecycleBoard('garbage')).toBe('');                     // non-object state
        });

        test('partial validity — renders valid PRs, silently skips malformed entries', () => {
            const board = formatLifecycleBoard({openPRs: [null, {number: 13680, state: 'OPEN'}, {}], unreadCount: 2});
            expect(board).toContain('#13680 OPEN'); // the one valid entry survives the null + {} neighbors
            expect(board).toContain('2 unread A2A');
            expect(board).not.toContain('undefined'); // no "#undefined" / "undefined"-state leakage
        });

        test('PR state is optional — a numbered entry without state renders cleanly (no "undefined")', () => {
            const board = formatLifecycleBoard({openPRs: [{number: 13680}], unreadCount: 0});
            expect(board).toContain('#13680');
            expect(board).not.toContain('undefined');
        });
    });

    test.describe('formatGoldenPathDirection — the release-goal ROI anchor (#13751, fail-open)', () => {
        test('renders the producer-ranked lanes (id + optional score/title) as a numbered release-goal direction', () => {
            const dir = formatGoldenPathDirection({goldenPathDirection: [
                {id: 'issue-14442', score: 13.5, title: 'Business engine'},
                {id: 'discussion-14422', score: 9.09}
            ]});
            expect(dir).toContain('Release-goal direction');
            expect(dir).toContain('drive one of these over any-named-lane');
            expect(dir).toContain('1. issue-14442 — score 13.50 — Business engine');
            expect(dir).toContain('2. discussion-14422 — score 9.09');
        });

        test('fail-open: null / non-object / empty / no-writer-yet → "" (never starves the directive floor)', () => {
            expect(formatGoldenPathDirection(null)).toBe('');
            expect(formatGoldenPathDirection('garbage')).toBe('');
            expect(formatGoldenPathDirection({})).toBe('');                        // no field yet (no producer)
            expect(formatGoldenPathDirection({goldenPathDirection: []})).toBe('');
            expect(formatGoldenPathDirection({goldenPathDirection: 'not-an-array'})).toBe('');
        });

        test('fail-open on malformed SHAPE — skips idless/null entries, never throws', () => {
            expect(() => formatGoldenPathDirection({goldenPathDirection: [null, {}, {id: ''}]})).not.toThrow();
            expect(formatGoldenPathDirection({goldenPathDirection: [null, {}, {id: '   '}]})).toBe(''); // no valid entry
            const dir = formatGoldenPathDirection({goldenPathDirection: [null, {id: 'issue-9'}, {}]});
            expect(dir).toContain('1. issue-9');       // the one valid entry survives its malformed neighbors
            expect(dir).not.toContain('undefined');
        });

        test('fixture-shaped ids never survive into the advisory — the #15265 pollution, verbatim', () => {
            // the two rows the polluted 2026-07-06 state file actually served (epoch-millisecond
            // id tails minted with Date.now() — impossible tracker artifacts)
            const dir = formatGoldenPathDirection({goldenPathDirection: [
                {id: 'discussion-open-1783347784287', score: 10,   title: 'Open Discussion Fixture'},
                {id: 'issue-actionable-1783347784287', score: 3.33, title: 'Actionable Issue Fixture'}
            ]});
            expect(dir, 'an all-fixture direction degrades to the bare reminder').toBe('');

            // a real lane sandwiched between fixtures survives alone, renumbered from 1
            const mixed = formatGoldenPathDirection({goldenPathDirection: [
                {id: 'discussion-open-1783347784287', score: 10, title: 'Open Discussion Fixture'},
                {id: 'issue-14442', score: 9.5, title: 'Business engine'},
                {id: 'issue-actionable-1783347784287', score: 3.33}
            ]});
            expect(mixed).toContain('1. issue-14442');
            expect(mixed).not.toContain('Fixture');
            expect(mixed).not.toContain('1783347784287');

            // tracker-scale id tails stay servable — the guard targets epoch-scale (13+ digit) tails only
            expect(formatGoldenPathDirection({goldenPathDirection: [{id: 'issue-9999999'}]})).toContain('1. issue-9999999');
        });

        test('score is optional + a non-finite score is omitted cleanly (no "score NaN")', () => {
            const dir = formatGoldenPathDirection({goldenPathDirection: [{id: 'issue-1', score: 'x'}, {id: 'issue-2'}]});
            expect(dir).toContain('1. issue-1');
            expect(dir).toContain('2. issue-2');
            expect(dir).not.toContain('NaN');
            expect(dir).not.toContain('score');        // neither entry carries a finite score
        });
    });
});

test.describe('laneStateStopHook — formatHoldCostumeCallout + composeBlockDirective wiring', () => {
    test('names the matched costume-phrases + frames them as a tripwire, not the boundary', () => {
        const out = formatHoldCostumeCallout(['gated-tail', 'no clean self-buildable lane']);
        expect(out).toContain('"gated-tail"');
        expect(out).toContain('"no clean self-buildable lane"');
        expect(out).toContain('TRIPWIRE, not the boundary');
        expect(out).toContain('NAMED lane');
    });

    test('empty / non-array → no callout (the directive stays the bare reminder)', () => {
        expect(formatHoldCostumeCallout([])).toBe('');
        expect(formatHoldCostumeCallout()).toBe('');
        expect(formatHoldCostumeCallout(null)).toBe('');
        expect(formatHoldCostumeCallout('garbage')).toBe('');
    });

    test('composeBlockDirective appends the callout when matches present, omits it when empty', () => {
        const withCostume = composeBlockDirective('no lane-state block emitted at turn-terminal', ['gated-tail']);
        expect(withCostume).toContain('Hold-costume detected');
        expect(withCostume).toContain('"gated-tail"');

        const without = composeBlockDirective('no lane-state block emitted at turn-terminal', []);
        expect(without).not.toContain('Hold-costume detected');
        expect(without).toContain('Turn-end refused'); // the bare directive core remains
    });

    test('composeBlockDirective keeps the bare directive byte-identical unless typed enrichment is present', () => {
        const cause = 'no lane-state block emitted at turn-terminal',
              bare  = composeBlockDirective(cause);

        expect(composeBlockDirective(cause, [], {projectionRender: ''})).toBe(bare);
        expect(composeBlockDirective(cause, [], {
            projectionRender: 'Live lane awareness — typed fixture'
        })).toBe(`${bare}\n\nLive lane awareness — typed fixture`)
    });
});

test.describe('laneStateStopHook — input resolution (assistant final text + prompting user message)', () => {
    test('last_assistant_message string is used verbatim', () => {
        const text = `On it.\n\n${block('{"laneContinuation":"active-lane"}')}`;
        expect(extractFinalAssistantText({last_assistant_message: text})).toBe(text);
    });

    test('last_assistant_message object → joins its text content blocks (skips thinking/tool_use)', () => {
        const input = {last_assistant_message: {content: [
            {type: 'thinking', thinking: 'noise'},
            {type: 'text',     text: 'final answer'}
        ]}};
        expect(extractFinalAssistantText(input)).toBe('final answer');
    });

    test('falls back to JSONL transcript_path when last_assistant_message is absent', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-jsonl-')),
              p   = path.join(dir, 't.jsonl');
        fs.writeFileSync(p, [
            JSON.stringify({type: 'user',      message: {role: 'user',      content: 'q'}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'the answer'}]}})
        ].join('\n'));
        expect(extractFinalAssistantText({transcript_path: p})).toBe('the answer');
    });

    test('extractLastAssistantTextFromJsonl: skips malformed + tool_use-only records → last text-bearing record', () => {
        const jsonl = [
            '{ not json }',
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'earlier text'}]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'tool_use', id: 'x', name: 'y', input: {}}]}})
        ].join('\n');
        expect(extractLastAssistantTextFromJsonl(jsonl)).toBe('earlier text');
    });

    test('extractLastUserTextFromJsonl: returns the LAST user text record (skips assistant + tool_result)', () => {
        const jsonl = [
            JSON.stringify({type: 'user',      message: {role: 'user',      content: 'first operator message'}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'reply'}]}}),
            JSON.stringify({type: 'user',      message: {role: 'user',      content: [{type: 'tool_result', tool_use_id: 'x', content: 'r'}]}}),
            JSON.stringify({type: 'user',      message: {role: 'user',      content: '[WAKE][priority:normal] 1 events'}})
        ].join('\n');
        expect(extractLastUserTextFromJsonl(jsonl)).toBe('[WAKE][priority:normal] 1 events');
    });

    test('no assistant text → empty string (so the hook treats it as an absent emission)', () => {
        expect(extractLastAssistantTextFromJsonl('{"type":"user","message":{"role":"user","content":"q"}}')).toBe('');
        expect(extractFinalAssistantText({})).toBe('');
    });
});

/**
 * Coverage for the human-filtered walk — the mid-chain operator-visibility extractor. Fixture
 * shapes mirror REAL transcript records (sessions `8cf234b7` / `2251c81c` / `c82afc7d`): the hook's own
 * block directives and skill payloads are `isMeta: true` user records; genuine operator prompts and
 * `[WAKE]` deliveries are non-meta. The walk owns record-shape mechanics ONLY — [WAKE]/synthetic/handoff
 * semantics stay in `classifyPromptingContext` (single authority, exercised via the integration pair).
 */
test.describe('laneStateStopHook — extractLatestHumanUserTextFromJsonl (#14440 human-filtered walk)', () => {
    const metaFeedback = JSON.stringify({type: 'user', isMeta: true, message: {role: 'user',
              content: 'Stop hook feedback:\nTurn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.'}}),
          metaSkill     = JSON.stringify({type: 'user', isMeta: true, message: {role: 'user',
              content: 'Base directory for this skill: /repo/.claude/skills/pull-request\n\n# Pull Request Skill'}}),
          operatorMsg   = JSON.stringify({type: 'user', message: {role: 'user',
              content: 'full stop. we need to talk about the release notes.'}}),
          wakeMsg       = JSON.stringify({type: 'user', message: {role: 'user',
              content: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}}),
          interruptMark = JSON.stringify({type: 'user', message: {role: 'user',
              content: '[Request interrupted by user]'}}),
          toolResult    = JSON.stringify({type: 'user', message: {role: 'user',
              content: [{type: 'tool_result', tool_use_id: 'x', content: 'r'}]}}),
          assistant     = JSON.stringify({type: 'assistant', message: {role: 'assistant',
              content: [{type: 'text', text: 'working…'}]}});

    test('mid-chain operator message beneath hook-feedback records is found (the 2251c81c shape)', () => {
        const jsonl = [wakeMsg, assistant, metaFeedback, operatorMsg, metaFeedback, assistant].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('full stop. we need to talk about the release notes.');
    });

    test('isMeta records (hook feedback + skill payloads) can never masquerade as the prompting boundary', () => {
        const jsonl = [operatorMsg, assistant, metaSkill, metaFeedback].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('full stop. we need to talk about the release notes.');
    });

    test('a NEWER [WAKE] is the decisive candidate — stale operator prose never leaks past it', () => {
        const jsonl = [operatorMsg, assistant, metaFeedback, wakeMsg, assistant].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('[WAKE][priority:normal] 1 events for @neo-opus-vega');
        // integration pair: the classifier rejects the wake candidate → chained turn stays autonomous
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(false);
    });

    test('interrupt markers are harness prose — skipped; the adjacent real message is found', () => {
        const jsonl = [operatorMsg, assistant, interruptMark].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('full stop. we need to talk about the release notes.');
    });

    test('tool_result-only + malformed lines are tolerated; no candidate → empty string (fail-closed)', () => {
        expect(extractLatestHumanUserTextFromJsonl([toolResult, '{ not json }', assistant].join('\n'))).toBe('');
        expect(extractLatestHumanUserTextFromJsonl('')).toBe('');
        expect(extractLatestHumanUserTextFromJsonl([metaFeedback, metaSkill].join('\n'))).toBe('');
    });

    test('integration pair: mid-chain operator rescue end-to-end through the pure classifier', () => {
        const jsonl = [wakeMsg, assistant, metaFeedback, operatorMsg, assistant].join('\n');
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(true);
    });

    // ── Mid-TURN operator messages: attachment-delivered prompts (never user-role records) ──────
    // Fixtures mirror the REAL `queued_command` envelopes (full local corpus census: 360/360
    // current-format prompt deliveries carry `commandMode: 'prompt'` + a 36-char STRING
    // `source_uuid` + `origin.kind: 'human'`; 118/118 task notifications carry
    // `commandMode: 'task-notification'` and neither field; pre-July envelopes lack
    // `origin`/`timestamp` and are format history outside the live contract). Envelope
    // provenance — VALIDATED shape, not field truthiness — is the sender/kind identity;
    // payload prose is never it.
    const attachmentOperator = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'prompt', source_uuid: 'u-op-1', origin: {kind: 'human'},
              prompt: 'why is the walk still blind here? scope-ruling attached.'}}),
          attachmentWake     = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'prompt', source_uuid: 'u-wake-1', origin: {kind: 'human'},
              prompt: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}}),
          attachmentTaskNote = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'task-notification',
              prompt: '<task-notification>\n<task-id>b123</task-id>\n</task-notification>'}}),
          attachmentTaskNoteUntagged = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'task-notification',
              prompt: 'background task complete'}}),
          // Isolates commandMode as the ONLY invalid leg: every other human-envelope leg is
          // valid (string source_uuid + origin.kind 'human'), so a pass here would prove the
          // mode check specifically, not a confounded second leg.
          attachmentUnknownMode = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'mystery-mode', source_uuid: 'u-x-1', origin: {kind: 'human'},
              prompt: 'genuine-looking prose from an unknown delivery mode'}}),
          // Malformed prompt-bearing envelope: PRESENT non-string prompt with every provenance
          // leg valid — must stop the walk (a skip would leak past to older operator prose).
          attachmentObjectPrompt = JSON.stringify({type: 'attachment', attachment: {
              type  : 'queued_command', commandMode: 'prompt', source_uuid: 'u-op-9', origin: {kind: 'human'},
              prompt: {nested: 'object payload'}}}),
          attachmentOther    = JSON.stringify({type: 'attachment',
              attachment: {kind: 'file', path: '/tmp/x.png'}});

    test('an attachment-delivered mid-turn operator message is the decisive candidate', () => {
        const jsonl = [wakeMsg, assistant, metaFeedback, attachmentOperator, assistant].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('why is the walk still blind here? scope-ruling attached.');
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(true);
    });

    test('newest-candidate ordering holds across record kinds: a NEWER [WAKE] user record wins over an older operator attachment', () => {
        const jsonl = [attachmentOperator, assistant, metaFeedback, wakeMsg, assistant].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('[WAKE][priority:normal] 1 events for @neo-opus-vega');
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(false);
    });

    test('a [WAKE]-prose operator-envelope attachment is a candidate the dialogue gates then reject', () => {
        const jsonl = [operatorMsg, assistant, metaFeedback, attachmentWake].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('[WAKE][priority:normal] 1 events for @neo-opus-vega');
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(false);
    });

    test('structurally synthetic attachments are walk-stopping boundaries — envelope decides, prose is irrelevant', () => {
        // The tagged AND the untagged task-notification (the falsifier that killed the
        // text-prefix design) plus an unknown prompt-bearing mode: each STOPS the walk —
        // older operator prose can never leak past a newer synthetic/unknown boundary.
        for (const injected of [attachmentTaskNote, attachmentTaskNoteUntagged, attachmentUnknownMode]) {
            const jsonl = [operatorMsg, assistant, metaFeedback, injected].join('\n');
            expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('');
            expect(isOperatorInLoop({
                stopHookActive            : true,
                promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
                promptingTextHumanFiltered: true
            })).toBe(false);
        }
    });

    test('attachment records without attachment.prompt (other kinds) are skipped, not boundaries', () => {
        const jsonl = [operatorMsg, assistant, attachmentOther].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('full stop. we need to talk about the release notes.');
    });

    test('a PRESENT non-string prompt is a MALFORMED envelope — walk-stopping, never a skip (cycle-3 boundary)', () => {
        // All provenance legs valid; only the prompt VALUE is malformed. The prompt-less rule
        // (absent/blank → skip) must not swallow it: skipping would leak past to older prose.
        const jsonl = [operatorMsg, assistant, metaFeedback, attachmentObjectPrompt].join('\n');
        expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('');
        expect(isOperatorInLoop({
            stopHookActive            : true,
            promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
            promptingTextHumanFiltered: true
        })).toBe(false);
        // The prompt-less boundary stays a skip: absent prompt and blank-string prompt.
        const blankPrompt = JSON.stringify({type: 'attachment', attachment: {
            type: 'queued_command', commandMode: 'prompt', source_uuid: 'u-op-10', origin: {kind: 'human'}, prompt: '   '}});
        expect(extractLatestHumanUserTextFromJsonl([operatorMsg, assistant, blankPrompt].join('\n')))
            .toBe('full stop. we need to talk about the release notes.');
    });

    test('the human predicate VALIDATES envelope shape — spoofable variants are walk-stopping, never candidates (cycle-2 reviewer falsifiers)', () => {
        // Each variant passed the previous truthiness check and classified midChainOperator:true
        // at the prior head; all four must stop the walk: an object source_uuid, a whitespace
        // source_uuid, a valid-string source_uuid with a non-human origin, and a missing origin.
        const spoofObjectUuid = JSON.stringify({type: 'attachment', attachment: {
                  type  : 'queued_command', commandMode: 'prompt', source_uuid: {spoof: true}, origin: {kind: 'human'},
                  prompt: 'prose behind an object-valued source uuid'}}),
              spoofBlankUuid  = JSON.stringify({type: 'attachment', attachment: {
                  type  : 'queued_command', commandMode: 'prompt', source_uuid: '   ', origin: {kind: 'human'},
                  prompt: 'prose behind a whitespace source uuid'}}),
              spoofTaskOrigin = JSON.stringify({type: 'attachment', attachment: {
                  type  : 'queued_command', commandMode: 'prompt', source_uuid: 'u-real-string', origin: {kind: 'task'},
                  prompt: 'prose behind a non-human origin kind'}}),
              spoofNoOrigin   = JSON.stringify({type: 'attachment', attachment: {
                  type  : 'queued_command', commandMode: 'prompt', source_uuid: 'u-real-string',
                  prompt: 'prose behind a missing origin'}});

        for (const injected of [spoofObjectUuid, spoofBlankUuid, spoofTaskOrigin, spoofNoOrigin]) {
            const jsonl = [operatorMsg, assistant, metaFeedback, injected].join('\n');
            expect(extractLatestHumanUserTextFromJsonl(jsonl)).toBe('');
            expect(isOperatorInLoop({
                stopHookActive            : true,
                promptingText             : extractLatestHumanUserTextFromJsonl(jsonl),
                promptingTextHumanFiltered: true
            })).toBe(false);
        }
    });
});

test.describe('laneStateStopHook — end-to-end (spawned hook against the real Stop payload)', () => {
    /**
     * @summary Spawns the real hook with a Stop payload + a temp audit-log dir; returns `{stdout, log}`.
     * `promptingText` (when set) writes a `transcript_path` whose last USER record carries it — the
     * operator-vs-wake classification surface. Otherwise the final text rides `last_assistant_message`
     * with no transcript → no confirmable prompt → fail-closed autonomous.
     * @param {String} finalText
     * @param {{enforce: Boolean, promptingText: (String|null), stopHookActive: Boolean,
     *   hookProjection: (Object|null), toolCommand: String|null}} [opts]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(finalText, {enforce = false, promptingText = null, stopHookActive = false, lifecycleState = null, hookProjection = null, toolCommand = null, transcriptRecords = null, preseedLog = null, extraEnv = null} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-e2e-')),
                  transcriptPath = path.join(dir, 'transcript.jsonl'),
                  // The specs in this describe pin the CONTINUATION-ON contract. That apparatus is
                  // still live code — reachable via the `stopHook.laneContinuation` leaf — so its
                  // guarantees stay under test even though the leaf now defaults OFF. Pinned
                  // EXPLICITLY rather than inherited from the ambient default, so a future default
                  // flip can never silently re-target 39 fixtures at the opposite behavior while
                  // still reporting green. The off-by-default path has its own describe block below.
                  env            = {
                      ...process.env,
                      NEO_STOP_HOOK_LANE_CONTINUATION: 'true',
                      NEO_AI_DAEMON_DIR              : dir,
                      ...(extraEnv || {})
                  },
                  payload        = {stop_hook_active: stopHookActive, session_id: 'e2e'};

            if (lifecycleState !== null) {
                fs.writeFileSync(path.join(dir, 'lifecycle-state.json'), JSON.stringify(lifecycleState), 'utf8');
            }

            if (hookProjection !== null) {
                const projectionPath = path.join(dir, 'hook-projection-current.json'),
                      binding        = hookProjection.consumerBinding;

                fs.writeFileSync(projectionPath, JSON.stringify(hookProjection), 'utf8');
                Object.assign(env, {
                    NEO_HOOK_PROJECTION_PATH                : projectionPath,
                    NEO_HOOK_PROJECTION_TARGET_ID           : hookProjection.publication.targetId,
                    NEO_AGENT_IDENTITY                      : binding.agentId,
                    NEO_HOOK_PROJECTION_HARNESS_TYPE        : binding.harnessType,
                    NEO_HOOK_PROJECTION_INSTANCE_KEY_DIGEST : binding.instanceKeyDigest,
                    NEO_HOOK_PROJECTION_WORKSPACE_KEY_DIGEST: binding.workspaceKeyDigest
                })
            }

            if (preseedLog !== null) {
                // The drive-ratchet source: pre-seed the hook's OWN audit log (prior-session-turn
                // BLOCK lines) so acceptance reads hook-written history, exactly as in production.
                fs.writeFileSync(path.join(dir, 'lane-state-stop-hook.log'), preseedLog.join('\n') + '\n', 'utf8');
            }

            if (transcriptRecords !== null) {
                // Chain-shape fixtures: write the given records verbatim + the final assistant text.
                const records = transcriptRecords.map(record => JSON.stringify(record));
                records.push(JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: finalText}]}}));
                fs.writeFileSync(transcriptPath, records.join('\n') + '\n');
                payload.transcript_path = transcriptPath;
            } else if (promptingText !== null) {
                const records = [
                    JSON.stringify({type: 'user', message: {role: 'user', content: promptingText}})
                ];

                if (toolCommand) {
                    records.push(JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [
                        {type: 'tool_use', name: 'Bash', input: {command: toolCommand}}
                    ]}}));
                }

                records.push(JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: finalText}]}}));

                fs.writeFileSync(transcriptPath, records.join('\n') + '\n');
                payload.transcript_path = transcriptPath;
            } else {
                payload.last_assistant_message = finalText;
            }

            if (enforce) env.NEO_LANE_STATE_ENFORCE = '1';

            const proc   = spawn('node', ['.claude/hooks/laneStateStopHook.mjs'], {stdio: ['pipe', 'pipe', 'pipe'], env});
            let   stdout = '';

            proc.stdout.on('data', chunk => stdout += chunk);
            proc.on('error', reject);
            proc.on('exit', () => {
                const logPath = path.join(dir, 'lane-state-stop-hook.log');
                resolve({stdout, log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''});
            });

            proc.stdin.write(JSON.stringify(payload));
            proc.stdin.end();
        });
    }

    const validTerminal = `On it.\n\n${block('{"laneContinuation":"active-lane"}')}`;

    test('deference phrase + autonomous turn → WOULD-BLOCK before lane-state parsing (dry-run)', async () => {
        const {stdout, log} = await runHook(`Your call.\n\n${validTerminal}`, {promptingText: '[WAKE][priority:normal] 1 events'});
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('deference phrase "your call"');
        expect(stdout).toBe('');
    });

    test('deference phrase + autonomous turn + enforce → BLOCK with the peer-identity directive', async () => {
        const {stdout, log} = await runHook(`Your move.\n\n${validTerminal}`, {enforce: true, promptingText: '[WAKE][priority:normal] 1 events'});
        expect(log).toContain('BLOCK');
        expect(log).toContain('deference phrase "your move"');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('helpful assistant');
        expect(decision.reason).toContain('A2A message with peers');
        expect(decision.reason).toContain('deference phrase "your move"');
    });

    test('deference carve cannot hide active-lane in dialogue → BLOCK with the lane directive', async () => {
        const {stdout, log} = await runHook(`Your call.\n\n${validTerminal}`, {enforce: true, promptingText: 'please pick the exact color and report'});
        expect(log).toContain('BLOCK');
        expect(log).not.toContain('deference phrase');
        expect(log).toContain('[active-lane-in-dialogue]');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('Answer-plus-drive, not answer-plus-stop');
    });

    test('LIVE OPERATOR dialogue + active-lane → WOULD-BLOCK in dry-run with a greppable class', async () => {
        const {stdout, log} = await runHook(validTerminal, {promptingText: 'please do X, then report'});
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('[active-lane-in-dialogue]');
        expect(stdout).toBe('');
    });

    test('LIVE OPERATOR dialogue (genuine prompt) → ALLOW even with a bare prose terminal', async () => {
        const {stdout, log} = await runHook('Done — over to you.', {enforce: true, promptingText: 'please do X, then report'});
        expect(log).toContain('ALLOW');
        expect(stdout).toBe('');
    });

    test('LIVE OPERATOR dialogue keeps ALLOW for malformed and non-active lane-state terminals', async () => {
        const malformed     = `Done.\n\n${block('{bad json}')}`,
              nextLane      = `Done.\n\n${block('{"laneContinuation":"next-lane"}')}`,
              blockerRouted = `Done.\n\n${block('{"laneContinuation":"blocker-routed"}')}`;

        for (const finalText of [malformed, nextLane, blockerRouted]) {
            const {stdout, log} = await runHook(finalText, {enforce: true, promptingText: 'please do X, then report'});
            expect(log).toContain('ALLOW');
            expect(log).not.toContain('[active-lane-in-dialogue]');
            expect(stdout).toBe('');
        }
    });

    test('handoff-to-autonomous operator prompt + enforce → BLOCK, not operator ALLOW', async () => {
        const {stdout, log} = await runHook(validTerminal, {
            enforce      : true,
            promptingText: "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back."
        });

        expect(JSON.parse(stdout).decision).toBe('block');
        expect(log).toContain('BLOCK');
        expect(log).toContain('operatorInLoop=false');
        expect(log).toContain('autonomousHandoff=true');
        expect(log).toContain('handoffReason=nightshift-mode');
        expect(log).toContain('handoffWindowMs=18000000');
    });

    test('loophole closed: a VALID terminal with NO operator prompt → WOULD-BLOCK (dry-run)', async () => {
        const {stdout, log} = await runHook(validTerminal);
        expect(log).toContain('WOULD-BLOCK');
        expect(stdout).toBe('');
    });

    test('ENFORCE + VALID terminal + WAKE prompt → BLOCK (a valid block is not a stop-license)', async () => {
        const {stdout, log} = await runHook(validTerminal, {enforce: true, promptingText: '[WAKE][priority:normal] 1 events'});
        expect(log).toContain('BLOCK');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('PR-shaped namedGate without same-turn fetch evidence is an invalid terminal (#14713)', async () => {
        const prTerminal = `Live gate checked.\n\n${block('{"laneContinuation":"next-lane","namedGates":[{"ref":"PR #14822","checkedAt":"2026-07-04T20:52:22Z"}],"awaitingOwnPrOnly":false}')}`,
              {log}      = await runHook(prTerminal, {promptingText: '[WAKE][priority:normal] 1 events'});

        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('no same-turn PR fetch evidence');
    });

    test('PR-shaped namedGate with same-turn tool evidence validates (#14713)', async () => {
        const prTerminal = `Live gate checked.\n\n${block('{"laneContinuation":"next-lane","namedGates":[{"ref":"PR #14822","checkedAt":"2026-07-04T20:52:22Z"}],"awaitingOwnPrOnly":false}')}`,
              {log}      = await runHook(prTerminal, {
                  promptingText: '[WAKE][priority:normal] 1 events',
                  toolCommand  : 'gh pr view 14822 --json state,mergedAt,reviewDecision'
              });

        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('valid lane-state terminal');
        expect(log).not.toContain('no same-turn PR fetch evidence');
    });

    test('an ABSENT emission (no operator) → WOULD-BLOCK (dry-run)', async () => {
        const {log} = await runHook('Just some prose, no lane-state block here.');
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('no lane-state block emitted');
    });

    test('a MALFORMED emission → WOULD-BLOCK, distinct from absent', async () => {
        const {log} = await runHook(block('{laneContinuation: not valid json}'));
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('malformed');
    });

    test('ENFORCE + invalid emission + autonomous prompt → BLOCK: injects the curated directive + cause', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {enforce: true, promptingText: '[WAKE] 1 event'});
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('there is no hold state');
        expect(decision.reason).toContain('advance a NAMED lane');
        expect(decision.reason).toContain('Unknown laneContinuation');
    });

    // Mid-chain operator visibility remains an independent contract: a genuine operator record inside
    // a forced chain is live dialogue. The terminal is deliberately bare prose so this witness proves
    // prompt classification without colliding with the separate active-lane refusal.
    test('stop_hook_active + genuine mid-chain operator record → ALLOW (#14440 Defect-B AC)', async () => {
        const {stdout, log} = await runHook('Done — over to you.', {
            enforce       : true,
            promptingText : 'please do X',
            stopHookActive: true
        });
        expect(log).toContain('ALLOW');
        expect(log).toContain('midChainOperator=true');
        expect(stdout).toBe('');
    });

    test('stop_hook_active chain WITHOUT an operator record (wake + hook-feedback plumbing) → still BLOCK', async () => {
        const {stdout, log} = await runHook(validTerminal, {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'user', isMeta: true, message: {role: 'user', content: 'Stop hook feedback:\nTurn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.'}}
            ]
        });
        expect(log).toContain('BLOCK');
        expect(log).toContain('midChainOperator=false');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('mid-TURN attachment-delivered operator message → ALLOW (the queued-delivery chain shape)', async () => {
        const {stdout, log} = await runHook('Understood — over to you.', {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'user', isMeta: true, message: {role: 'user', content: 'Stop hook feedback:\nTurn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.'}},
                {type: 'queue-operation', operation: 'enqueue', timestamp: '2026-07-16T07:00:00Z'},
                {type: 'attachment', attachment: {type: 'queued_command', commandMode: 'prompt', source_uuid: 'u-e2e-1', origin: {kind: 'human'}, prompt: 'full stop — answering your fork question now, hold the lane.'}}
            ]
        });
        expect(log).toContain('ALLOW');
        expect(log).toContain('midChainOperator=true');
        expect(stdout).toBe('');
    });

    test('injected attachment payloads (task-notification) keep a chain BLOCKED — no false-ALLOW channel', async () => {
        const {stdout, log} = await runHook(validTerminal, {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'attachment', attachment: {type: 'queued_command', commandMode: 'task-notification', prompt: 'background task b9 completed without a tag prefix'}}
            ]
        });
        expect(log).toContain('BLOCK');
        expect(log).toContain('midChainOperator=false');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('an UNKNOWN prompt-bearing mode ABOVE older operator prose keeps the chain BLOCKED (walk-stop at the spawned seam)', async () => {
        // The unknown-mode record is NEWER than a genuine operator user record; the walk must stop
        // at the unknown boundary rather than leak past it to the older dialogue evidence. Every
        // OTHER human-envelope leg is valid (string source_uuid + origin.kind 'human') so the mode
        // check is isolated — not confounded by a second invalid leg.
        const {stdout, log} = await runHook(validTerminal, {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: 'full stop. we need to talk about the release notes.'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'attachment', attachment: {type: 'queued_command', commandMode: 'mystery-mode', source_uuid: 'u-x-e2e', origin: {kind: 'human'}, prompt: 'genuine-looking prose from an unknown delivery mode'}}
            ]
        });
        expect(log).toContain('BLOCK');
        expect(log).toContain('midChainOperator=false');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('a MALFORMED present prompt (object value) ABOVE older operator prose keeps the chain BLOCKED (spawned seam)', async () => {
        const {stdout, log} = await runHook(validTerminal, {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: 'full stop. we need to talk about the release notes.'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'attachment', attachment: {type: 'queued_command', commandMode: 'prompt', source_uuid: 'u-op-e2e', origin: {kind: 'human'}, prompt: {nested: 'object payload'}}}
            ]
        });
        expect(log).toContain('BLOCK');
        expect(log).toContain('midChainOperator=false');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('a malformed prompt-mode envelope (object source_uuid) is walk-stopping at the spawned seam — BLOCKED', async () => {
        const {stdout, log} = await runHook(validTerminal, {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: 'full stop. we need to talk about the release notes.'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'attachment', attachment: {type: 'queued_command', commandMode: 'prompt', source_uuid: {spoof: true}, origin: {kind: 'human'}, prompt: 'prose behind an object-valued source uuid'}}
            ]
        });
        expect(log).toContain('BLOCK');
        expect(log).toContain('midChainOperator=false');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('mid-chain injected operator message beneath hook feedback → ALLOW (the 2251c81c shape)', async () => {
        const {stdout, log} = await runHook('Understood — standing by for your direction.', {
            enforce          : true,
            stopHookActive   : true,
            transcriptRecords: [
                {type: 'user', message: {role: 'user', content: '[WAKE][priority:normal] 1 events for @neo-opus-vega'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'driving the lane…'}]}},
                {type: 'user', isMeta: true, message: {role: 'user', content: 'Stop hook feedback:\nTurn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.'}},
                {type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'continuing…'}]}},
                {type: 'user', message: {role: 'user', content: 'full stop. we need to talk about the release notes.'}}
            ]
        });
        expect(log).toContain('ALLOW');
        expect(log).toContain('midChainOperator=true');
        expect(stdout).toBe('');
    });

    test('Phase-4 cutover ignores even fresh legacy lifecycle-state enrichment', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce       : true,
            promptingText : '[WAKE] 1 event',
            lifecycleState: {generatedAt: new Date().toISOString(), goldenPathDirection: [{id: 'issue-14442', score: 13.5, title: 'Business engine'}]}
        });
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).not.toContain('Release-goal direction');
        expect(decision.reason).not.toContain('issue-14442');
    });

    test('ENFORCE block appends the typed lifecycle then global route without changing admission', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce       : true,
            promptingText : '[WAKE] 1 event',
            hookProjection: makeHookProjectionFixture({harnessType: 'claude-code'})
        });

        expect(log).toContain('BLOCK');

        const decision       = JSON.parse(stdout),
              lifecycleIndex = decision.reason.indexOf('Lifecycle hook-lifecycle-action'),
              routeIndex     = decision.reason.indexOf('Route hook-route-v1');

        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('Live lane awareness — source data only');
        expect(lifecycleIndex).toBeGreaterThan(-1);
        expect(routeIndex).toBeGreaterThan(lifecycleIndex);
        expect(decision.reason).toContain('issue-15315');
        expect(decision.reason).toContain("Unknown laneContinuation 'verified-no-lane'");
    });

    test('a STALE lifecycle-state degrades like a missing file — dead writers cannot serve "live" advisories (#15265)', async () => {
        const {stdout} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce      : true,
            promptingText: '[WAKE] 1 event',
            // the forensic shape: a 10-day-old orphan (its producer removed from the tree) carrying
            // fixture rows — served on every block until freshness became contract
            lifecycleState: {
                generatedAt        : '2026-07-06T14:23:04.288Z',
                goldenPathDirection: [{id: 'discussion-open-1783347784287', score: 10, title: 'Open Discussion Fixture'}]
            }
        });
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).not.toContain('Release-goal direction');
        expect(decision.reason).not.toContain('Fixture');
    });

    test('a lifecycle-state without generatedAt cannot prove freshness — not served (#15265)', async () => {
        const {stdout} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce       : true,
            promptingText : '[WAKE] 1 event',
            lifecycleState: {goldenPathDirection: [{id: 'issue-14442', score: 13.5, title: 'Business engine'}]}
        });
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).not.toContain('Release-goal direction');
    });

    // ── the clean-terminal acceptance edge — the ONE audited autonomous stop ────────────────────

    // A fully handed-off valid terminal: next-lane, one issue-shaped gate with a same-turn checkedAt
    // and a NON-SELF nextActor (issue-shaped refs need no PR fetch evidence, keeping the fixture pure).
    const handedOffTerminal = `Both PRs at responded-head.\n\n${block(
        '{"laneContinuation":"next-lane","awaitingOwnPrOnly":false,"namedGates":[' +
        '{"ref":"#15274","checkedAt":"2026-07-16T18:00:00Z","nextActor":"@neo-gpt-emmy"}]}'
    )}`;

    // Two prior compliant refused drives — the hook's own audit-log lines, exactly as production writes them.
    const twoCompliantRefusals = [
        '[2026-07-16T17:00:00.000Z] BLOCK (session=e2e, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): valid lane-state terminal',
        '[2026-07-16T17:20:00.000Z] BLOCK (session=e2e, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): valid lane-state terminal'
    ];

    test('clean terminal: valid + non-self gates + ratchet met + identity wired → audited ALLOW, never silent', async () => {
        const {stdout, log} = await runHook(handedOffTerminal, {
            enforce      : true,
            extraEnv     : {NEO_AGENT_IDENTITY: '@neo-fable'},
            preseedLog   : twoCompliantRefusals,
            promptingText: '[WAKE] 1 event'
        });

        expect(log).toContain('CLEAN-TERMINAL ALLOW');
        expect(log).toContain('2 compliant drives');

        // the peer-visible boundary: a systemMessage, NOT a block decision
        const emission = JSON.parse(stdout);
        expect(emission.decision).toBeUndefined();
        expect(emission.systemMessage).toContain('[clean-terminal]');
        expect(emission.systemMessage).toContain('non-self actors');
    });

    test('the ratchet holds: only ONE prior compliant drive → still BLOCK (first/second valid terminals refuse)', async () => {
        const {stdout, log} = await runHook(handedOffTerminal, {
            enforce      : true,
            extraEnv     : {NEO_AGENT_IDENTITY: '@neo-fable'},
            preseedLog   : [twoCompliantRefusals[0]],
            promptingText: '[WAKE] 1 event'
        });

        expect(log).toContain('BLOCK');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('a self-awaiting gate defeats acceptance — the board is not handed off', async () => {
        const selfGate = `Done.\n\n${block(
            '{"laneContinuation":"next-lane","awaitingOwnPrOnly":false,"namedGates":[' +
            '{"ref":"#15274","checkedAt":"2026-07-16T18:00:00Z","nextActor":"@neo-fable"}]}'
        )}`;

        const {stdout} = await runHook(selfGate, {
            enforce      : true,
            extraEnv     : {NEO_AGENT_IDENTITY: '@neo-fable'},
            preseedLog   : twoCompliantRefusals,
            promptingText: '[WAKE] 1 event'
        });

        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('no NEO_AGENT_IDENTITY wiring → the edge is inert (fail-closed): BLOCK exactly as before', async () => {
        const {stdout} = await runHook(handedOffTerminal, {
            enforce   : true,
            // Explicitly CLEARED, not ambiently absent: real agent boxes export NEO_AGENT_IDENTITY,
            // so relying on the parent env lacking it makes this test box-dependent.
            extraEnv     : {NEO_AGENT_IDENTITY: ''},
            preseedLog   : twoCompliantRefusals,
            promptingText: '[WAKE] 1 event'
        });

        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('WOULD-BLOCK and deference audit lines never feed the ratchet — only compliant BLOCK refusals count', async () => {
        const {stdout} = await runHook(handedOffTerminal, {
            enforce   : true,
            extraEnv  : {NEO_AGENT_IDENTITY: '@neo-fable'},
            preseedLog: [
                // dry-run previews (no chain formed) + a deference block + an invalid-terminal block:
                // none of these are compliant refused drives.
                '[2026-07-16T17:00:00.000Z] WOULD-BLOCK (session=e2e, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): valid lane-state terminal',
                '[2026-07-16T17:05:00.000Z] BLOCK (session=e2e, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): deference phrase "your call" at turn-terminal',
                '[2026-07-16T17:10:00.000Z] BLOCK (session=e2e, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): no lane-state block emitted at turn-terminal',
                // a DIFFERENT session's compliant refusal must not leak in either:
                '[2026-07-16T17:15:00.000Z] BLOCK (session=other, operatorInLoop=false, midChainOperator=false, autonomousHandoff=false, handoffReason=none, handoffWindowMs=none): valid lane-state terminal'
            ],
            promptingText: '[WAKE] 1 event'
        });

        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('Phase-4 cutover never falls back to the legacy capacity advisory', async () => {
        const {stdout} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce      : true,
            promptingText: '[WAKE] 1 event',
            // freshness is contract: an unproven-fresh lifecycle-state serves NOTHING — the
            // capacity advisory included — so the fixture must carry a live generatedAt.
            lifecycleState: {generatedAt: new Date().toISOString(), openPRs: [{number: 1, state: 'OPEN'}, {number: 2, state: 'OPEN'}, {number: 3, state: 'OPEN'}]}
        });

        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).not.toContain('Capacity: 3 own PRs already open');
        expect(decision.reason).not.toContain('review seat');
    });
});

/**
 * Unit layer for the clean-terminal support functions — the ratchet counter guards and the
 * capacity-advisory formatter matrix (the e2e layer above covers their composed behavior).
 */
test.describe('laneStateStopHook — clean-terminal support units', () => {
    test('countSessionCompliantRefusals: empty / unknown session ids fail closed to 0', () => {
        expect(countSessionCompliantRefusals('')).toBe(0);
        expect(countSessionCompliantRefusals('?')).toBe(0);
        expect(countSessionCompliantRefusals(undefined)).toBe(0);
        // an id that cannot exist in any real log → 0 (missing log/lines fail closed, never throw)
        expect(countSessionCompliantRefusals(`spec-never-${Date.now()}`)).toBe(0);
    });

    test('formatCapacityAdvisory: below threshold / malformed shapes → "" (fail-open, total)', () => {
        expect(formatCapacityAdvisory(null)).toBe('');
        expect(formatCapacityAdvisory('garbage')).toBe('');
        expect(formatCapacityAdvisory({})).toBe('');
        expect(formatCapacityAdvisory({openPRs: 'not-an-array'})).toBe('');
        expect(formatCapacityAdvisory({openPRs: [null, {}, {number: 1}]})).toBe('');          // 1 valid < 3
        expect(formatCapacityAdvisory({openPRs: [{number: 1}, {number: 2}]})).toBe('');       // 2 < 3
        expect(() => formatCapacityAdvisory({openPRs: [null]})).not.toThrow();
    });

    test('formatCapacityAdvisory: at/past threshold → the review-seats-first line; threshold is tunable', () => {
        const line = formatCapacityAdvisory({openPRs: [{number: 1}, {number: 2}, {number: 3}]});
        expect(line).toContain('Capacity: 3 own PRs already open');
        expect(line).toContain('review seat');
        expect(line).toContain('CHANGES_REQUESTED');

        // tunable threshold: 2 open PRs trip a threshold of 2
        expect(formatCapacityAdvisory({openPRs: [{number: 1}, {number: 2}]}, {threshold: 2})).toContain('Capacity: 2 own PRs');
        // malformed entries are excluded from the count (only 2 valid of 4 → below default threshold)
        expect(formatCapacityAdvisory({openPRs: [null, {}, {number: 1}, {number: 2}]})).toBe('');
    });
});

test.describe('findLastAcceptedStopIso — the accepted-stop boundary, literal and fail-closed', () => {
    const SID  = 'aaaa1111-2222-3333-4444-555566667777';
    const LONG = `${SID}-extended`;   // SID is a strict PREFIX of this id

    const writeLog = lines => {
        const file = path.join(os.tmpdir(), `neo-boundary-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
        fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
        return file
    };

    test('every accepted-stop class is a boundary — including the ordinary dialogue ALLOW', () => {
        // append-only chronological, like the real log: the newest line IS the newest stop
        const file = writeLog([
            `[2026-07-18T04:00:00.000Z] BLOCK (session=${SID}, identity=x): valid lane-state terminal refused`,
            `[2026-07-18T04:30:00.000Z] CLEAN-TERMINAL ALLOW (session=${SID}, identity=x): [clean-terminal] accepted`,
            `[2026-07-18T05:00:00.000Z] ALLOW (session=${SID}, identity=x, operatorInLoop=true): live operator dialogue — yielding for the human turn`
        ]);

        try {
            // the ordinary dialogue ALLOW at 05:00 is the LAST accepted stop, not the 04:30 clean terminal —
            // an operator-dialogue stop IS an accepted stop, so pre-dialogue artifacts cannot key later
            expect(findLastAcceptedStopIso(SID, file)).toEqual({iso: '2026-07-18T05:00:00.000Z', unavailable: false})
        } finally { fs.unlinkSync(file) }
    });

    test('a session id that PREFIXES another can never cross-match (the comma-delimited needle)', () => {
        const file = writeLog([
            `[2026-07-18T05:00:00.000Z] MATERIAL-ALLOW (session=${LONG}, identity=x): [material-allow] earned`
        ]);

        try {
            expect(findLastAcceptedStopIso(SID, file)).toEqual({iso: null, unavailable: false})
        } finally { fs.unlinkSync(file) }
    });

    test('readable-but-unmatched is the legitimate session-start case; UNREADABLE evidence is unavailable (fail-closed downstream)', () => {
        const file = writeLog([`[2026-07-18T05:00:00.000Z] BLOCK (session=${SID}, identity=x): refused`]);

        try {
            expect(findLastAcceptedStopIso(SID, file)).toEqual({iso: null, unavailable: false});
        } finally { fs.unlinkSync(file) }

        // a MISSING log is ALSO unavailable — a deleted/never-written log is indistinguishable
        // from tampering, and whole-session replay must not license a stop (the first-session
        // autonomous stop routes through the clean-terminal fallback instead)
        expect(findLastAcceptedStopIso(SID, path.join(os.tmpdir(), 'neo-definitely-absent.log')))
            .toEqual({iso: null, unavailable: true});

        // any other read failure (a directory is not a readable log) = the same fail-closed shape
        expect(findLastAcceptedStopIso(SID, os.tmpdir())).toEqual({iso: null, unavailable: true})
    });
});

test.describe('the adapter composition — boundary → collector → evaluator, wired exactly as main() wires them', () => {
    const SID = 'bbbb1111-2222-3333-4444-555566667777';

    // one REAL confirmed artifact: an ID-correlated pr-create whose matching result carries the URL
    const artifactJsonl = [
        JSON.stringify({timestamp: '2026-07-18T06:00:00.000Z', message: {content: [
            {type: 'tool_use', id: 'toolu_adapter', name: 'Bash', input: {command: 'gh pr create --title real'}}
        ]}}),
        JSON.stringify({timestamp: '2026-07-18T06:00:05.000Z', message: {content: [
            {type: 'tool_result', tool_use_id: 'toolu_adapter', content: 'https://github.com/neomjs/neo/pull/900'}
        ]}})
    ].join('\n');

    // the hook's exact wiring: the boundary feeds BOTH the availability gate and the since-scope
    const composeKey = (jsonl, logFile) => {
        const boundary = findLastAcceptedStopIso(SID, logFile);

        return evaluateMaterialArtifactKey({
            verdictValid    : true,
            sinceUnavailable: boundary.unavailable,
            artifacts       : boundary.unavailable ? [] : collectMaterialArtifactsFromJsonl(jsonl, {sinceIso: boundary.iso})
        })
    };

    test('artifact PRESENT + MISSING audit log = refusal — unscoped evidence licenses nothing through the full chain', () => {
        const key = composeKey(artifactJsonl, path.join(os.tmpdir(), 'neo-adapter-absent.log'));

        expect(key.accept).toBe(false);
        expect(key.reason).toContain('boundary')
    });

    test('the SAME artifact with an available boundary = acceptance; predating the boundary = refusal (the scope is live end-to-end)', () => {
        const file = path.join(os.tmpdir(), `neo-adapter-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);

        // boundary BEFORE the artifact: the chain accepts on the confirmed pr-opened
        fs.writeFileSync(file, `[2026-07-18T05:00:00.000Z] ALLOW (session=${SID}, identity=x, operatorInLoop=true): dialogue\n`, 'utf8');
        try {
            expect(composeKey(artifactJsonl, file).accept).toBe(true);

            // boundary AFTER the artifact: the same transcript now proves nothing new — refusal
            fs.appendFileSync(file, `[2026-07-18T07:00:00.000Z] ALLOW (session=${SID}, identity=x, operatorInLoop=true): dialogue\n`, 'utf8');
            expect(composeKey(artifactJsonl, file).accept).toBe(false)
        } finally { fs.unlinkSync(file) }
    });
});

test.describe('stopHook policy leaves — the two-axis turn-end contract (#15877)', () => {
    /**
     * @summary Spawns the real hook with an explicit policy env, so each spec states the policy it
     * pins instead of inheriting an ambient default.
     * @param {String} finalText
     * @param {Object} [opts]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runPolicyHook(finalText, {enforce = true, promptingText = '[WAKE][priority:normal] 1 events', policyEnv = {}} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-policy-')),
                  transcriptPath = path.join(dir, 'transcript.jsonl'),
                  env            = {...process.env, NEO_AI_DAEMON_DIR: dir, NEO_AGENT_IDENTITY: 'neo-test-seat', ...policyEnv},
                  payload        = {stop_hook_active: false, session_id: 'policy-e2e'};

            delete env.NEO_STOP_HOOK_LANE_CONTINUATION;
            delete env.NEO_STOP_HOOK_DEFERENCE_MIRROR;
            Object.assign(env, policyEnv);

            fs.writeFileSync(transcriptPath, [
                JSON.stringify({type: 'user',      message: {role: 'user',      content: promptingText}}),
                JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: finalText}]}})
            ].join('\n') + '\n');

            payload.transcript_path = transcriptPath;
            if (enforce) env.NEO_LANE_STATE_ENFORCE = '1';

            const proc   = spawn('node', ['.claude/hooks/laneStateStopHook.mjs'], {stdio: ['pipe', 'pipe', 'pipe'], env});
            let   stdout = '';

            proc.stdout.on('data', chunk => stdout += chunk);
            proc.on('error', reject);
            proc.on('exit', () => {
                const logPath = path.join(dir, 'lane-state-stop-hook.log');
                resolve({stdout, log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''});
            });

            proc.stdin.write(JSON.stringify(payload));
            proc.stdin.end();
        });
    }

    test('DEFAULT (leaf off): an autonomous turn with NO lane-state block ends — the apparatus is dark', async () => {
        const {stdout, log} = await runPolicyHook('Lane finished. No machine block here.');
        expect(stdout).toBe('');
        expect(log).toContain('ALLOW');
        expect(log).not.toContain('BLOCK');
        expect(log).toContain('[lane-continuation-disabled]');
    });

    test('DEFAULT (leaf off): a MALFORMED lane-state emission is no longer a finding', async () => {
        const {stdout, log} = await runPolicyHook('Done.\n\n' + block('{"laneContinuation": NOT_JSON'));
        expect(stdout).toBe('');
        expect(log).toContain('[lane-continuation-disabled]');
    });

    test('THE OPERATOR REQUIREMENT: with continuation off, the deference MIRROR still fires', async () => {
        const {stdout, log} = await runPolicyHook('All set. Would you like me to open the PR?');
        expect(log).toContain('BLOCK');
        expect(log).toContain('deference phrase');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('helpful assistant');
        // The mirror must NOT drag the continuation payload back in — that is the whole cost split.
        expect(decision.reason).not.toContain('lane-state');
        expect(decision.reason).not.toContain('L3_No_Hold_State');
    });

    test('the two axes are independent: mirror OFF + continuation OFF → a deference turn just ends', async () => {
        const {stdout, log} = await runPolicyHook('All set. Would you like me to open the PR?', {
            policyEnv: {NEO_STOP_HOOK_DEFERENCE_MIRROR: 'false'}
        });
        expect(stdout).toBe('');
        expect(log).not.toContain('deference phrase');
        expect(log).toContain('[lane-continuation-disabled]');
    });

    test('the two axes are independent: mirror OFF + continuation ON → lane contract still enforced', async () => {
        const {stdout, log} = await runPolicyHook('All set. Would you like me to open the PR?', {
            policyEnv: {NEO_STOP_HOOK_DEFERENCE_MIRROR: 'false', NEO_STOP_HOOK_LANE_CONTINUATION: 'true'}
        });
        expect(log).toContain('BLOCK');
        expect(log).not.toContain('deference phrase');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('REGRESSION GUARD: continuation ON restores the refusal byte-for-byte — the leaf is a switch, not a deletion', async () => {
        const valid         = 'On it.\n\n' + block('{"laneContinuation":"active-lane"}');
        const {stdout, log} = await runPolicyHook(valid, {
            policyEnv: {NEO_STOP_HOOK_LANE_CONTINUATION: 'true'}
        });
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('L3_No_Hold_State');
        expect(decision.reason).toContain('lane-state');
    });

    test('an unrecognized env token falls back to the DECLARED DEFAULT, never a silent disable', async () => {
        const valid = 'On it.\n\n' + block('{"laneContinuation":"active-lane"}');
        const {log} = await runPolicyHook(valid, {
            policyEnv: {NEO_STOP_HOOK_LANE_CONTINUATION: 'ja, bitte'}
        });
        // Garbage → undefined → declared default (off). A typo must not read as a deliberate ENABLE either.
        expect(log).toContain('[lane-continuation-disabled]');
    });
});

test.describe('decideStopHookAction — the policy gate is unconditional (#15877)', () => {
    test('continuation disabled beats every would-be block input — no residual refusal path', () => {
        for (const operatorInLoop of [true, false]) {
            for (const laneContinuation of [null, 'active-lane', 'next-lane']) {
                const decision = decideHookAction(
                    {valid: false, reason: 'no lane-state block emitted at turn-terminal'},
                    true, operatorInLoop, null, laneContinuation, null, false
                );
                expect(decision.action).toBe('allow');
                expect(decision.reason).toContain('[lane-continuation-disabled]');
            }
        }
    });

    test('the default stays TRUE for callers that pass no policy — historical semantics preserved', () => {
        const decision = decideHookAction(
            {valid: false, reason: 'no lane-state block emitted at turn-terminal'},
            true, false, null, null, null
        );
        expect(decision.action).toBe('block');
    });
});
