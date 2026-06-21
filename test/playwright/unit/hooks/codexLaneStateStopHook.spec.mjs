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
    summarizePayloadShape
} from '../../../../.codex/hooks/codex-lane-state-stop.mjs';

const block = body => '```lane-state\n' + body + '\n```',
      fixturePath = new URL('./fixtures/codex-stop-payload.json', import.meta.url),
      fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

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

    test('JSONL fallback tolerates malformed lines and skips user records', () => {
        const jsonl = [
            '{ not json }',
            JSON.stringify({type: 'user', message: {role: 'user', content: 'question'}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'answer'}]}})
        ].join('\n');

        expect(extractLastAssistantTextFromJsonl(jsonl)).toBe('answer');
    });

    test('JSONL prompt fallback tolerates malformed lines and skips assistant records', () => {
        const jsonl = [
            '{ not json }',
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: 'answer'}}),
            JSON.stringify({type: 'user', message: {role: 'user', content: [{type: 'text', text: '[WAKE][priority:normal] 1 events'}]}})
        ].join('\n');

        expect(extractLastUserTextFromJsonl(jsonl)).toBe('[WAKE][priority:normal] 1 events');
    });
});

test.describe('codex-lane-state-stop - lane-state classification', () => {
    test('valid representative payload without an operator prompt would-blocks', () => {
        const result = classifyCodexStopPayload(fixture);

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('valid lane-state terminal');
        expect(result.reason).toContain('No-hold reminder');
        expect(result.source).toBe('last_assistant_message');
        expect(result.promptSource).toBe('none');
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
    });

    test('absent lane-state would-block with no-hold reminder', () => {
        const result = classifyCodexStopPayload({
            session_id            : 'absent',
            last_assistant_message: 'Final prose without the structured block.'
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('no lane-state block emitted');
        expect(result.reason).toContain('No-hold reminder');
    });

    test('malformed lane-state is distinct from absent', () => {
        const result = classifyCodexStopPayload({
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
    });
});

test.describe('codex-lane-state-stop - deference register', () => {
    test('deference phrase + autonomous turn → would-block before lane-state parsing (dry-run)', () => {
        const result = classifyCodexStopPayload({
            messages: [
                {role: 'user',      content: '[WAKE][priority:normal] 1 events'},
                {role: 'assistant', content: 'Your call.'}
            ]
        });

        expect(result.action).toBe('would-block');
        expect(result.reason).toContain('helpful assistant');           // the deference directive, not the no-hold reason
        expect(result.reason).toContain('deference phrase "your call"');
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
     * @returns {Promise<{stdout: String, log: String}>}
     */
    function runHook(payload, {enforce = false, capture = false} = {}) {
        return new Promise((resolve, reject) => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lane-hook-')),
                  env = {...process.env, NEO_AI_DAEMON_DIR: dir};

            if (enforce) env.NEO_CODEX_LANE_STATE_ENFORCE = '1';
            if (capture) env.NEO_CODEX_LANE_STATE_CAPTURE = '1';

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
    });

    test('enforced invalid terminal logs BLOCK and writes the block decision to stdout', async () => {
        const {stdout, log} = await runHook({
            session_id            : 'invalid',
            last_assistant_message: block('{"laneContinuation":"verified-no-lane"}')
        }, {enforce: true});

        expect(JSON.parse(stdout).decision).toBe('block');
        expect(log).toContain('BLOCK');
        expect(log).toContain('Unknown laneContinuation');
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
