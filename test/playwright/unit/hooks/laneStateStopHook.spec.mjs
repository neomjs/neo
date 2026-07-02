import {test, expect}                                                                              from '@playwright/test';
import {composeBlockDirective, composeDeferenceDirective, decideHookAction, isOperatorInLoop, parseOutcomeToVerdict,
        extractFinalAssistantText, extractLastAssistantTextFromJsonl, extractLastUserTextFromJsonl,
        formatLifecycleBoard, formatGoldenPathDirection, formatHoldCostumeCallout} from '../../../../.claude/hooks/laneStateStopHook.mjs';
import {spawn} from 'node:child_process';
import fs      from 'node:fs';
import os      from 'node:os';
import path    from 'node:path';

const block = body => '```lane-state\n' + body + '\n```';

/**
 * Falsification tests for the idle-out Stop-hook. Layers: (1) the pure decision logic
 * (`parseOutcomeToVerdict` 3-bucket chain + `decideHookAction` + `isOperatorInLoop`); (2) input
 * resolution — final assistant text + the prompting user message come from the Stop payload /
 * transcript, not raw JSONL lines (raw JSONL is escaped); (3) end-to-end — the spawned real hook.
 *
 * The decision rule: there is NO valid voluntary stop except a live operator dialogue. A
 * "valid" lane-state terminal is a declaration, not a license to stop — enforce REFUSES it. The one
 * allow is `operatorInLoop`, determined EXTERNALLY (the prompting message type), never self-declared.
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

    test.describe('decideHookAction — operator-dialogue is the only allow (#13649)', () => {
        test('VALID + no operator → BLOCK (enforce) / WOULD-BLOCK (dry-run) — the loophole is closed', () => {
            expect(decideHookAction({valid: true, reason: 'ok'}, true,  false).action).toBe('block');
            expect(decideHookAction({valid: true, reason: 'ok'}, false, false).action).toBe('would-block');
        });

        test('operatorInLoop ALWAYS allows — a live human takes the next turn (enforce AND dry-run)', () => {
            expect(decideHookAction({valid: false, reason: 'x'}, true,  true).action).toBe('allow');
            expect(decideHookAction({valid: true,  reason: 'x'}, false, true).action).toBe('allow');
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

test.describe('laneStateStopHook — end-to-end (spawned hook against the real Stop payload)', () => {
    /**
     * @summary Spawns the real hook with a Stop payload + a temp audit-log dir; returns `{stdout, log}`.
     * `promptingText` (when set) writes a `transcript_path` whose last USER record carries it — the
     * operator-vs-wake classification surface. Otherwise the final text rides `last_assistant_message`
     * with no transcript → no confirmable prompt → fail-closed autonomous.
     * @param {String} finalText
     * @param {{enforce: Boolean, promptingText: (String|null), stopHookActive: Boolean}} [opts]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(finalText, {enforce = false, promptingText = null, stopHookActive = false, lifecycleState = null} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-e2e-')),
                  transcriptPath = path.join(dir, 'transcript.jsonl'),
                  env            = {...process.env, NEO_AI_DAEMON_DIR: dir},
                  payload        = {stop_hook_active: stopHookActive, session_id: 'e2e'};

            if (lifecycleState !== null) {
                fs.writeFileSync(path.join(dir, 'lifecycle-state.json'), JSON.stringify(lifecycleState), 'utf8');
            }

            if (promptingText !== null) {
                fs.writeFileSync(transcriptPath, [
                    JSON.stringify({type: 'user',      message: {role: 'user',      content: promptingText}}),
                    JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: finalText}]}})
                ].join('\n') + '\n');
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

    test('deference phrase in a live operator dialogue → ALLOW (operator-dialogue carve)', async () => {
        const {stdout, log} = await runHook(`Your call.\n\n${validTerminal}`, {enforce: true, promptingText: 'please pick the exact color and report'});
        expect(log).toContain('ALLOW');
        expect(log).not.toContain('deference phrase');
        expect(stdout).toBe('');
    });

    test('LIVE OPERATOR dialogue (genuine prompt) → ALLOW even with a bare prose terminal', async () => {
        const {stdout, log} = await runHook('Done — over to you.', {enforce: true, promptingText: 'please do X, then report'});
        expect(log).toContain('ALLOW');
        expect(stdout).toBe('');
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

    test('stop_hook_active (forced continuation) + enforce → BLOCK (keeps refusing, no auto-allow)', async () => {
        const {stdout, log} = await runHook(validTerminal, {enforce: true, promptingText: 'please do X', stopHookActive: true});
        expect(log).toContain('BLOCK');
        expect(JSON.parse(stdout).decision).toBe('block');
    });

    test('ENFORCE block injects the Golden Path release-goal direction from lifecycle-state (#13751)', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {
            enforce       : true,
            promptingText : '[WAKE] 1 event',
            lifecycleState: {goldenPathDirection: [{id: 'issue-14442', score: 13.5, title: 'Business engine'}]}
        });
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('Release-goal direction');
        expect(decision.reason).toContain('issue-14442 — score 13.50 — Business engine');
    });
});
