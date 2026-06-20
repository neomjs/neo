import {test, expect}                                                                             from '@playwright/test';
import {decideHookAction, parseOutcomeToVerdict, extractFinalAssistantText,
        extractLastAssistantTextFromJsonl}                                                       from '../../../../.claude/hooks/laneStateStopHook.mjs';
import {spawn} from 'node:child_process';
import fs      from 'node:fs';
import os      from 'node:os';
import path    from 'node:path';

const block = body => '```lane-state\n' + body + '\n```';

/**
 * Falsification tests for the idle-out Stop-hook. Three layers: (1) the pure decision logic
 * (`parseOutcomeToVerdict` 3-bucket chain + `decideHookAction`); (2) input resolution — the agent's
 * final message comes from the Stop payload's `last_assistant_message`, NOT the raw JSONL transcript
 * (the runtime boundary a cross-family review caught — raw JSONL is escaped, so the fence parser must run
 * on extracted text); (3) end-to-end — the spawned real hook against the real Stop payload shape.
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

    test.describe('decideHookAction — enforce / dry-run', () => {
        test('a VALID terminal always ALLOWS — dry-run AND enforcing (never traps a legit handoff)', () => {
            expect(decideHookAction({valid: true, reason: 'ok'}, false).action).toBe('allow');
            expect(decideHookAction({valid: true, reason: 'ok'}, true).action).toBe('allow');
        });

        test('an INVALID terminal WOULD-BLOCK in dry-run — logs the would-be block, never blocks', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane'}, false);
            expect(result.action).toBe('would-block');
            expect(result.reason).toBe('no active lane');
        });

        test('an INVALID terminal BLOCKS when enforcing — the reason is carried through to inject', () => {
            const result = decideHookAction({valid: false, reason: 'no active lane — pick one or cite a survey'}, true);
            expect(result.action).toBe('block');
            expect(result.reason).toBe('no active lane — pick one or cite a survey');
        });
    });
});

test.describe('laneStateStopHook — input resolution (last_assistant_message primary + JSONL fallback)', () => {
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

    test('no assistant text → empty string (so the hook treats it as an absent emission)', () => {
        expect(extractLastAssistantTextFromJsonl('{"type":"user","message":{"role":"user","content":"q"}}')).toBe('');
        expect(extractFinalAssistantText({})).toBe('');
    });
});

test.describe('laneStateStopHook — end-to-end (spawned hook against the real Stop payload)', () => {
    /**
     * @summary Spawns the real hook with a Stop payload + a temp audit-log dir; returns `{stdout, log}`.
     * Default passes the text as `last_assistant_message` (the real Stop shape); `viaJsonl` instead
     * writes a JSONL `transcript_path` whose last assistant record carries the text (the fallback path).
     * @param {String} finalText
     * @param {{enforce: Boolean, viaJsonl: Boolean}} [opts]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(finalText, {enforce = false, viaJsonl = false} = {}) {
        return new Promise((resolve, reject) => {
            const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hook-e2e-')),
                  transcriptPath = path.join(dir, 'transcript.jsonl'),
                  env            = {...process.env, NEO_AI_DAEMON_DIR: dir},
                  payload        = {stop_hook_active: false, session_id: 'e2e'};

            if (viaJsonl) {
                fs.writeFileSync(transcriptPath, [
                    JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'thinking', thinking: 'noise'}]}}),
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

    test('a VALID emission (active-lane) via last_assistant_message → WOULD-ALLOW, no block on stdout', async () => {
        const {stdout, log} = await runHook(`On it.\n\n${block('{"laneContinuation":"active-lane"}')}`);
        expect(log).toContain('WOULD-ALLOW');
        expect(stdout).toBe('');
    });

    test('an INVALID emission (verified-no-lane — a retired continuation) → WOULD-BLOCK as unknown', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'));
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('Unknown laneContinuation');
        expect(stdout).toBe('');
    });

    test('an ABSENT emission (no lane-state block) → WOULD-BLOCK', async () => {
        const {log} = await runHook('Just some prose, no lane-state block here.');
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('no lane-state block emitted');
    });

    test('a MALFORMED emission (block present, broken JSON) → WOULD-BLOCK, distinct from absent', async () => {
        const {log} = await runHook(block('{laneContinuation: not valid json}'));
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('malformed');
    });

    test('ENFORCING + invalid emission → blocks: {"decision":"block"} injected on stdout', async () => {
        const {stdout, log} = await runHook(block('{"laneContinuation":"verified-no-lane"}'), {enforce: true});
        expect(log).toContain('BLOCK');
        const decision = JSON.parse(stdout);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('Unknown laneContinuation');
    });

    test('JSONL fallback: a valid block in the last assistant transcript record → WOULD-ALLOW', async () => {
        const {stdout, log} = await runHook(`Done.\n\n${block('{"laneContinuation":"active-lane"}')}`, {viaJsonl: true});
        expect(log).toContain('WOULD-ALLOW');
        expect(stdout).toBe('');
    });
});
