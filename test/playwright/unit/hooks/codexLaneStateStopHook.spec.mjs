import {test, expect} from '@playwright/test';
import {spawn}        from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    CODEX_STOP_BLOCK_INJECTION_SUPPORTED,
    buildNoHoldReminder,
    classifyCodexStopPayload,
    decideCodexHookAction,
    extractFinalAssistantText,
    extractLastAssistantTextFromJsonl,
    extractLastAssistantTextFromMessages,
    extractLastUserTextFromJsonl,
    extractLastUserTextFromMessages,
    extractPromptingText,
    getCodexPromptContextPath,
    readPromptContext,
    summarizePayloadShape
} from '../../../../.codex/hooks/codex-lane-state-stop.mjs';

const block       = body => '```lane-state\n' + body + '\n```',
      fixturePath = new URL('./fixtures/codex-stop-payload.json', import.meta.url),
      fixture     = JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
      codexRecord = (role, text) => JSON.stringify({
          type   : 'response_item',
          payload: {
              type   : 'message',
              role,
              content: [{type: role === 'assistant' ? 'output_text' : 'input_text', text}]
          }
      });

function classifyWithIsolatedPromptContext(input, options = {}) {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lane-direct-'));

    try {
        return classifyCodexStopPayload(input, {...options, logDir});
    } finally {
        fs.rmSync(logDir, {recursive: true, force: true});
    }
}

test.describe('codex-lane-state-stop - contract boundary', () => {
    test('Codex block/inject is active, so enforced invalid terminals block', () => {
        expect(CODEX_STOP_BLOCK_INJECTION_SUPPORTED).toBe(true);

        const result = decideCodexHookAction(
            {valid: false, reason: 'no lane-state block emitted at turn-terminal'},
            {enforcing: true}
        );

        expect(result.action).toBe('block');
        expect(result.reason).toContain('no lane-state block emitted');
    });

    test('a valid terminal is not a Codex stop license without a live operator prompt', () => {
        const result = decideCodexHookAction({valid: true, reason: 'valid lane-state terminal'});

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('valid lane-state terminal');
        expect(result.reason).toContain('No-hold reminder');
    });

    test('the no-hold reminder names concrete non-hold exits', () => {
        const reason = buildNoHoldReminder('no lane-state block emitted at turn-terminal');

        expect(reason).toContain('No-hold reminder');
        expect(reason).toContain('pick a fresh claimable lane');
        expect(reason).toContain('Passive waiting is not a terminal');
        expect(reason).toContain('operator dialogue/planning');
        expect(reason).toContain('under 24KB');
        expect(reason).toContain('Missing prompt fails closed');
    });

    test('the no-hold reminder explains when Codex cannot confirm operator dialogue', () => {
        const reason = buildNoHoldReminder('no lane-state block emitted at turn-terminal', {
            promptSource  : 'none',
            operatorInLoop: false
        });

        expect(reason).toContain('promptSource=none');
        expect(reason).toContain('live operator dialogue could not be confirmed');
    });

    test('the no-hold reminder shows the fenced lane-state JSON schema', () => {
        const reason = buildNoHoldReminder('no lane-state block emitted at turn-terminal');

        expect(reason).toContain('```lane-state');
        expect(reason).toContain('"wakeDisposition":"awareness"');
        expect(reason).toContain('"laneContinuation":"next-lane"');
        expect(reason).toContain('"namedGates":[]');
        expect(reason).toContain('"awaitingOwnPrOnly":false');
        expect(reason).toContain('awaitingOwnPrOnly:true is invalid');
        expect(reason).toContain('same-turn checkedAt');
        expect(reason).toContain('field "mergedAt"');
    });

    test('payload shape capture is redacted to field names and value types', () => {
        expect(summarizePayloadShape({
            session_id            : 's',
            last_assistant_message: 'secret text',
            messages              : [{role: 'assistant'}],
            nested                : {secret: 'value'}
        })).toEqual({
            session_id            : 'string',
            last_assistant_message: 'string',
            messages              : 'array(1)',
            nested                : 'object'
        });
    });
});

test.describe('codex-lane-state-stop - input resolution', () => {
    test('checked-in representative Stop payload resolves from last_assistant_message', () => {
        const resolved = extractFinalAssistantText(fixture);

        expect(resolved.source).toBe('last_assistant_message');
        expect(resolved.text).toContain('"laneContinuation":"active-lane"');
    });

    test('message arrays use the last assistant text-bearing record', () => {
        const text = extractLastAssistantTextFromMessages([
            {role: 'assistant', content: 'earlier'},
            {role: 'user', content: 'ignore'},
            {type: 'assistant', message: {role: 'assistant', content: [{type: 'output_text', text: 'later'}]}}
        ]);

        expect(text).toBe('later');
        expect(extractFinalAssistantText({messages: [{role: 'assistant', content: 'from messages'}]})).toEqual({
            text  : 'from messages',
            source: 'messages'
        });
    });

    test('message arrays use the last user text-bearing record for operator detection', () => {
        const text = extractLastUserTextFromMessages([
            {role: 'user', content: 'earlier prompt'},
            {role: 'assistant', content: 'ignore'},
            {type: 'user', message: {role: 'user', content: [{type: 'text', text: 'latest prompt'}]}}
        ]);

        expect(text).toBe('latest prompt');
        expect(extractPromptingText({messages: [{role: 'user', content: 'from messages'}]})).toEqual({
            text  : 'from messages',
            source: 'messages'
        });
    });

    test('message arrays normalize real Codex response_item.payload records', () => {
        const records = [
            {type: 'response_item', payload: {type: 'message', role: 'user', content: [{type: 'input_text', text: 'operator prompt'}]}},
            {type: 'response_item', payload: {type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'assistant answer'}]}}
        ];

        expect(extractLastUserTextFromMessages(records)).toBe('operator prompt');
        expect(extractLastAssistantTextFromMessages(records)).toBe('assistant answer');
    });

    test('JSONL fallback tolerates malformed lines and reads Codex response_item.payload records', () => {
        const jsonl = [
            '{ not json }',
            codexRecord('user', 'question'),
            codexRecord('assistant', 'answer')
        ].join('\n');

        expect(extractLastAssistantTextFromJsonl(jsonl)).toBe('answer');
        expect(extractLastUserTextFromJsonl(jsonl)).toBe('question');
    });

    test('JSONL prompt fallback skips synthetic hook user records and returns the human prompt', () => {
        const jsonl = [
            '{ not json }',
            codexRecord('user', 'operator wants to stop for planning'),
            codexRecord('assistant', 'answer'),
            codexRecord('user', '<hook_prompt hook_run_id="stop:1">No-hold reminder</hook_prompt>'),
            codexRecord('user', '<turn_aborted>interrupted by new prompt</turn_aborted>')
        ].join('\n');

        expect(extractLastUserTextFromJsonl(jsonl)).toBe('operator wants to stop for planning');
    });

    test('prompt-context fallback is short-lived and ignores expired records', () => {
        const dir               = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-prompt-context-')),
              promptContextPath = getCodexPromptContextPath({logDir: dir}),
              createdAt         = '2026-06-28T22:00:00.000Z';

        try {
            fs.writeFileSync(promptContextPath, JSON.stringify({
                createdAt,
                promptingText: 'operator dialogue fallback',
                source       : 'codex-user-prompt-submit'
            }), 'utf8');

            expect(readPromptContext({
                now: Date.parse('2026-06-28T22:05:00.000Z'),
                promptContextPath
            })).toMatchObject({
                source: 'codex-user-prompt-submit',
                text  : 'operator dialogue fallback'
            });

            expect(readPromptContext({
                now: Date.parse('2026-06-28T22:20:01.000Z'),
                promptContextPath
            })).toBeNull();
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

test.describe('codex-lane-state-stop - lane-state classification', () => {
    test('valid representative payload without an operator prompt would-blocks', () => {
        const result = classifyWithIsolatedPromptContext(fixture);

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('valid lane-state terminal');
        expect(result.reason).toContain('No-hold reminder');
        expect(result.reason).toContain('promptSource=none');
        expect(result.source).toBe('last_assistant_message');
        expect(result.promptSource).toBe('none');
        expect(result.operatorInLoop).toBe(false);
    });

    test('direct classification can isolate itself from prompt-context store pollution', () => {
        const logDir            = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lane-polluted-')),
              promptContextPath = getCodexPromptContextPath({logDir});

        try {
            fs.writeFileSync(promptContextPath, JSON.stringify({
                createdAt    : new Date().toISOString(),
                promptingText: 'operator dialogue from another live Codex session',
                source       : 'codex-user-prompt-submit'
            }), 'utf8');

            const polluted = classifyCodexStopPayload(fixture, {logDir});
            expect(polluted.action).toBe('allow');
            expect(polluted.promptSource).toBe('prompt_context');

            const isolated = classifyWithIsolatedPromptContext(fixture);
            expect(isolated.action).toBe('would-block');
            expect(isolated.promptSource).toBe('none');
        } finally {
            fs.rmSync(logDir, {recursive: true, force: true});
        }
    });

    test('live operator prompt is the only valid voluntary allow', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user', content: 'please finish this one check and report back'},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        });

        expect(result.action).toBe('allow');
        expect(result.reason).toContain('live operator dialogue');
        expect(result.source).toBe('messages');
        expect(result.promptSource).toBe('messages');
        expect(result.operatorInLoop).toBe(true);
    });

    test('real Codex transcript_path payload records allow confirmed operator dialogue', () => {
        const dir            = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-transcript-')),
              transcriptPath = path.join(dir, 'transcript.jsonl'),
              jsonl          = [
                  codexRecord('user', 'please stop after this planning response'),
                  codexRecord('assistant', fixture.last_assistant_message),
                  codexRecord('user', '<hook_prompt hook_run_id="stop:1">No-hold reminder</hook_prompt>')
              ].join('\n');

        try {
            fs.writeFileSync(transcriptPath, jsonl, 'utf8');

            const result = classifyCodexStopPayload({transcript_path: transcriptPath}, {enforcing: true});

            expect(result.action).toBe('allow');
            expect(result.reason).toContain('live operator dialogue');
            expect(result.source).toBe('transcript_path');
            expect(result.promptSource).toBe('transcript_path');
            expect(result.operatorInLoop).toBe(true);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('handoff-to-autonomous operator prompt would-blocks instead of allowing', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user', content: "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back."},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('handoff-to-autonomous');
        expect(result.reason).toContain('windowMs=18000000');
        expect(result.source).toBe('messages');
        expect(result.promptSource).toBe('messages');
        expect(result.operatorInLoop).toBe(false);
        expect(result.autonomousHandoff).toBe(true);
        expect(result.handoffReason).toBe('nightshift-mode');
    });

    test('handoff-to-autonomous operator prompt blocks when enforcing', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user', content: "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back."},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        }, {enforcing: true});

        expect(result.action).toBe('block');
        expect(result.reason).toContain('handoff-to-autonomous');
        expect(result.operatorInLoop).toBe(false);
        expect(result.autonomousHandoff).toBe(true);
    });

    test('[WAKE] prompt is autonomous, so a valid terminal still would-blocks', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user', content: '[WAKE][priority:normal] 1 events for @neo-gpt'},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('valid lane-state terminal');
        expect(result.promptSource).toBe('messages');
        expect(result.operatorInLoop).toBe(false);
    });

    test('absent lane-state would-block with no-hold reminder', () => {
        const result = classifyWithIsolatedPromptContext({
            session_id            : 'absent',
            last_assistant_message: 'Final prose without the structured block.'
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('no lane-state block emitted');
        expect(result.reason).toContain('No-hold reminder');
        expect(result.reason).toContain('promptSource=none');
    });

    test('malformed lane-state is distinct from absent', () => {
        const result = classifyWithIsolatedPromptContext({
            session_id            : 'malformed',
            last_assistant_message: block('{laneContinuation: nope}')
        });

        expect(result.action).toBe('would-block');
        expect(result.verdict.reason).toContain('malformed lane-state emission');
    });

    test('Codex stop loop guard is not an allow, even with operator-like prompt text', () => {
        const result = classifyCodexStopPayload({
            stop_hook_active: true,
            messages        : [
                {role: 'user',      content: 'please stop here'},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('valid lane-state terminal');
        expect(result.source).toBe('messages');
        expect(result.promptSource).toBe('messages');
        expect(result.operatorInLoop).toBe(false);
    });
});

test.describe('codex-lane-state-stop - deference register', () => {
    test('deference phrase + autonomous turn → would-block before lane-state parsing (dry-run)', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user',      content: '[WAKE][priority:normal] 1 events'},
                {role: 'assistant', content: 'I can take #13902, or steer me elsewhere.'}
            ]
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('helpful assistant');           // the deference directive, not the no-hold reason
        expect(result.reason).toContain('deference phrase "or steer me elsewhere"');
    });

    test('deference phrase + autonomous turn + enforce → block with the peer-identity directive', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user',      content: '[WAKE][priority:normal] 1 events'},
                {role: 'assistant', content: 'Your move.'}
            ]
        }, {enforcing: true});

        expect(result.action).toBe('block');
        expect(result.reason).toContain('helpful assistant');
        expect(result.reason).toContain('A2A message with peers');
        expect(result.reason).toContain('deference phrase "your move"');
    });

    test('deference phrase in a live operator dialogue → operator-dialogue carve, not a deference block', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user',      content: 'please pick the exact color and report'},
                {role: 'assistant', content: `Your call.\n\n${fixture.last_assistant_message}`}
            ]
        }, {enforcing: true});

        expect(result.action).toBe('allow');                      // operator + valid terminal
        expect(result.reason).not.toContain('helpful assistant'); // deference carved by operatorInLoop
    });
});

test.describe('codex-lane-state-stop - spawned hook', () => {
    /**
     * @summary Spawns the repo-local Codex Stop hook with a temp audit log directory.
     * @param {(Object|String)} payload
     * @param {Object} [options]
     * @param {Boolean} [options.enforce=false]
     * @param {Boolean} [options.capture=false]
     * @param {String} [options.promptContextText]
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(payload, {enforce = false, capture = false, promptContextText} = {}) {
        return new Promise((resolve, reject) => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lane-hook-')),
                  env = {...process.env, NEO_AI_DAEMON_DIR: dir};

            if (enforce) env.NEO_CODEX_LANE_STATE_ENFORCE = '1';
            if (capture) env.NEO_CODEX_LANE_STATE_CAPTURE = '1';
            if (promptContextText) {
                fs.writeFileSync(path.join(dir, 'codex-prompt-context.json'), JSON.stringify({
                    createdAt    : new Date().toISOString(),
                    promptingText: promptContextText,
                    source       : 'codex-user-prompt-submit'
                }), 'utf8');
            }

            const proc = spawn('node', ['.codex/hooks/codex-lane-state-stop.mjs'], {
                cwd  : path.resolve(new URL('../../../..', import.meta.url).pathname),
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';

            proc.stdout.on('data', chunk => stdout += chunk);
            proc.on('error', reject);
            proc.on('exit', () => {
                const logPath = path.join(dir, 'codex-lane-state-stop-hook.log');
                resolve({stdout, log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''});
            });

            proc.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
            proc.stdin.end();
        });
    }

    test('valid fixture logs WOULD-BLOCK and writes no stdout', async () => {
        const {stdout, log} = await runHook(fixture);

        expect(stdout).toBe('');
        expect(log).toContain('WOULD-BLOCK');
        expect(log).toContain('source=last_assistant_message');
        expect(log).toContain('promptSource=none');
        expect(log).toContain('operatorInLoop=false');
        expect(log).toContain('valid lane-state terminal');
    });

    test('live operator prompt logs ALLOW and writes no stdout, even while enforcing', async () => {
        const {stdout, log} = await runHook({
            session_id: 'operator',
            messages  : [
                {role: 'user', content: 'finish this check and hand back to me'},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        }, {enforce: true});

        expect(stdout).toBe('');
        expect(log).toContain('ALLOW');
        expect(log).toContain('source=messages');
        expect(log).toContain('promptSource=messages');
        expect(log).toContain('operatorInLoop=true');
    });

    test('missing Stop prompt falls back to UserPromptSubmit prompt context and allows operator dialogue', async () => {
        const {stdout, log} = await runHook({
            session_id            : 'prompt-context-operator',
            last_assistant_message: fixture.last_assistant_message
        }, {
            enforce          : true,
            promptContextText: 'please end here; we are in live planning dialogue'
        });

        expect(stdout).toBe('');
        expect(log).toContain('ALLOW');
        expect(log).toContain('source=last_assistant_message');
        expect(log).toContain('promptSource=prompt_context');
        expect(log).toContain('operatorInLoop=true');
    });

    test('prompt-context fallback does not allow wake or hook-generated continuations', async () => {
        const wake = await runHook({
            session_id            : 'prompt-context-wake',
            last_assistant_message: fixture.last_assistant_message
        }, {
            enforce          : true,
            promptContextText: '[WAKE][priority:normal] 1 events for @neo-gpt'
        });

        expect(JSON.parse(wake.stdout).decision).toBe('block');
        expect(wake.log).toContain('promptSource=prompt_context');
        expect(wake.log).toContain('operatorInLoop=false');

        const hook = await runHook({
            session_id            : 'prompt-context-hook',
            last_assistant_message: fixture.last_assistant_message
        }, {
            enforce          : true,
            promptContextText: '<hook_prompt hook_run_id="stop:1">No-hold reminder</hook_prompt>'
        });

        expect(JSON.parse(hook.stdout).decision).toBe('block');
        expect(hook.log).toContain('promptSource=prompt_context');
        expect(hook.log).toContain('operatorInLoop=false');
    });

    test('handoff-to-autonomous prompt logs autonomous context and blocks while enforcing', async () => {
        const {stdout, log} = await runHook({
            session_id: 'handoff',
            messages  : [
                {role: 'user', content: "nightshift mode from here on for the next 5h, you and Euclid can freely choose. I merge when I get back."},
                {role: 'assistant', content: fixture.last_assistant_message}
            ]
        }, {enforce: true});

        expect(JSON.parse(stdout).decision).toBe('block');
        expect(log).toContain('BLOCK');
        expect(log).toContain('operatorInLoop=false');
        expect(log).toContain('autonomousHandoff=true');
        expect(log).toContain('handoffReason=nightshift-mode');
        expect(log).toContain('handoffWindowMs=18000000');
    });

    test('enforced invalid terminal logs BLOCK and writes the block decision to stdout', async () => {
        const {stdout, log} = await runHook({
            session_id            : 'invalid',
            last_assistant_message: block('{"laneContinuation":"verified-no-lane"}')
        }, {enforce: true});

        expect(JSON.parse(stdout).decision).toBe('block');
        expect(log).toContain('BLOCK');
        expect(log).toContain('promptSource=none');
        expect(log).toContain('operatorInLoop=false');
        expect(log).toContain('Unknown laneContinuation');
    });

    test('malformed transcript fallback fails open instead of trapping Stop', async () => {
        const {stdout, log} = await runHook({
            session_id            : 'missing-transcript',
            last_assistant_message: fixture.last_assistant_message,
            transcript_path       : path.join(os.tmpdir(), 'does-not-exist.jsonl')
        }, {enforce: true});

        expect(stdout).toBe('');
        expect(log).toContain('HOOK-ERROR');
        expect(log).toContain('allowing stop');
    });

    test('capture mode logs only the redacted payload shape', async () => {
        const {log} = await runHook(fixture, {capture: true});

        expect(log).toContain('PAYLOAD-SHAPE');
        expect(log).toContain('"last_assistant_message":"string"');
        expect(log).not.toContain('Continuing the active Codex lane');
    });

    test('malformed hook payload fails open', async () => {
        const {stdout, log} = await runHook('{ not json }');

        expect(stdout).toBe('');
        expect(log).toContain('PAYLOAD-PARSE-ERROR');
        expect(log).toContain('allowing stop');
    });
});
