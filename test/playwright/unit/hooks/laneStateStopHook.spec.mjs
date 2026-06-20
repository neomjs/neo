import {test, expect}                                                                              from '@playwright/test';
import {composeBlockDirective, decideHookAction, isOperatorInLoop, parseOutcomeToVerdict,
        extractFinalAssistantText, extractLastAssistantTextFromJsonl, extractLastUserTextFromJsonl} from '../../../../.claude/hooks/laneStateStopHook.mjs';
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
    });

    test.describe('composeBlockDirective — the injected no-hold-state directive', () => {
        test('carries the curated reminder (L3 stance + teeth-test + lifecycle) AND the trigger cause', () => {
            const directive = composeBlockDirective('no lane-state block emitted at turn-terminal');
            expect(directive).toContain('L3_No_Hold_State');
            expect(directive).toContain('there is no hold state');
            expect(directive).toContain('advance a NAMED lane');
            expect(directive).toContain('Passive waiting');
            expect(directive).toContain('no lane-state block emitted at turn-terminal');
        });
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
    function runHook(finalText, {enforce = false, promptingText = null, stopHookActive = false} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-e2e-')),
                  transcriptPath = path.join(dir, 'transcript.jsonl'),
                  env            = {...process.env, NEO_AI_DAEMON_DIR: dir},
                  payload        = {stop_hook_active: stopHookActive, session_id: 'e2e'};

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

            const proc = spawn('node', ['.claude/hooks/laneStateStopHook.mjs'], {stdio: ['pipe', 'pipe', 'pipe'], env});
            let stdout = '';

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

    test('LIVE OPERATOR dialogue (genuine prompt) → ALLOW even with a bare prose terminal', async () => {
        const {stdout, log} = await runHook('Done — over to you.', {enforce: true, promptingText: 'please do X, then report'});
        expect(log).toContain('ALLOW');
        expect(stdout).toBe('');
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
});
