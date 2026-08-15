import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {IDENTITIES} from '../../../../ai/graph/identityRoots.mjs';
import {
    extractPromptingTextFromHookPayload,
    extractWakeSubmitNonce,
    getCodexPromptContextPath,
    readCodexContext,
    readNowContext,
    recordTurnStarted,
    writePromptContextFromHookPayload
} from '../../../../.codex/hooks/codex-context.mjs';
import {recordClaudeTurnPresence} from '../../../../.claude/hooks/turnPresenceHook.mjs';

test.describe('codex-context hook - wake submit nonce', () => {
    test('keeps the injected Codex guard card compact and resident-neutral', () => {
        const context        = readCodexContext(),
              identityTokens = new Set(IDENTITIES.flatMap(({id, name, properties}) => [
                  id,
                  name,
                  properties?.githubLogin
              ]).filter(Boolean));

        expect(Buffer.byteLength(context, 'utf8')).toBeLessThanOrEqual(1536);
        expect(context).toContain('NEO_AGENT_IDENTITY');
        expect(context).toContain('gh api user --jq .login');
        expect(context).toContain('.codex/HARNESS_RESTART.md');
        expect(context).toContain('.codex/rules/');

        identityTokens.forEach(token => expect(context).not.toContain(token));

        expect(context).not.toMatch(/(?:^|[\s`])@?neo-[a-z0-9][a-z0-9-]*/i);
        expect(context).not.toMatch(/\b(?:Claude|Gemini|GPT)[ -]?\d/i);
        expect(context).not.toMatch(/\/Users\//);
        expect(context).not.toMatch(/A2A peers|Expected Codex identity|GitHub username/i);
    });

    test('readNowContext: returns the canonical NOW block, fail-open when absent (#17147)', () => {
        const realNow = fs.readFileSync(path.join(process.cwd(), 'NOW.md'), 'utf8').trim();

        expect(readNowContext()).toBe(realNow);
        expect(realNow).toContain('Epoch');
        expect(readNowContext({nowUrl: new URL('file:///nonexistent/spec/NOW.md')})).toBe('');
    });

    test('extracts a wake-submit nonce from nested hook payload text', () => {
        const nonce = '123e4567-e89b-12d3-a456-426614174000';

        expect(extractWakeSubmitNonce({
            transcript: [
                {role: 'user', content: `[WAKE]\n<!-- NEO_WAKE_SUBMIT_NONCE:${nonce} -->`}
            ]
        })).toBe(nonce);
    });

    test('carries wakeSubmitNonce to the served store, because the delivery proof matches on it', async () => {
        const dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-context-hook-')),
              nonce = '123e4567-e89b-12d3-a456-426614174001',
              calls = [];

        try {
            await recordTurnStarted({
                env: {
                    NEO_AGENT_IDENTITY: '@test-codex',
                    NEO_AI_DAEMON_DIR : dir
                },
                hookPayload: {
                    prompt: `[WAKE]\n<!-- NEO_WAKE_SUBMIT_NONCE:${nonce} -->`
                },
                plane : {baseUrl: 'http://plane.test/mc/mcp', credential: 'test-bearer'},
                record: async args => { calls.push(args); return {agentIdentity: args.identity, status: 'recorded'} }
            });

            // Asserted at the transport boundary rather than against a local SQLite file. The previous
            // shape wrote to a temp database and read the row back — which is the very thing the hook
            // used to do wrong, so it could go green while no beacon ever reached the deployment.
            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({
                baseUrl        : 'http://plane.test/mc/mcp',
                identity       : '@test-codex',
                source         : 'codex-user-prompt-submit',
                action         : 'start',
                wakeSubmitNonce: nonce
            });
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('extracts operator prompt text from Codex payload-shaped hook records', () => {
        expect(extractPromptingTextFromHookPayload({
            payload: {
                type   : 'message',
                role   : 'user',
                content: [{type: 'input_text', text: 'operator planning prompt'}]
            }
        })).toBe('operator planning prompt');

        expect(extractPromptingTextFromHookPayload({
            messages: [
                {role: 'assistant', content: 'ignore'},
                {role: 'user', content: [{type: 'text', text: 'latest user prompt'}]}
            ]
        })).toBe('latest user prompt');
    });

    test('writes bounded prompt context for the Stop hook fallback', () => {
        const dir               = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-context-prompt-')),
              promptContextPath = getCodexPromptContextPath({env: {NEO_AI_DAEMON_DIR: dir}});

        try {
            const result = writePromptContextFromHookPayload({
                env        : {NEO_AI_DAEMON_DIR: dir},
                hookPayload: {prompt: 'operator dialogue fallback'},
                now        : new Date('2026-06-28T22:00:00.000Z')
            });

            expect(result).toMatchObject({
                path      : promptContextPath,
                source    : 'codex-user-prompt-submit',
                status    : 'written',
                textLength: 'operator dialogue fallback'.length
            });

            expect(JSON.parse(fs.readFileSync(promptContextPath, 'utf8'))).toEqual({
                createdAt    : '2026-06-28T22:00:00.000Z',
                promptingText: 'operator dialogue fallback',
                source       : 'codex-user-prompt-submit'
            });
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('clears stale prompt context when UserPromptSubmit exposes no prompt text', () => {
        const dir               = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-context-prompt-')),
              promptContextPath = getCodexPromptContextPath({env: {NEO_AI_DAEMON_DIR: dir}});

        try {
            writePromptContextFromHookPayload({
                env        : {NEO_AI_DAEMON_DIR: dir},
                hookPayload: {prompt: 'operator dialogue fallback'},
                now        : new Date('2026-06-28T22:00:00.000Z')
            });

            const result = writePromptContextFromHookPayload({
                env        : {NEO_AI_DAEMON_DIR: dir},
                hookPayload: {hook_event_name: 'UserPromptSubmit'},
                now        : new Date('2026-06-28T22:01:00.000Z')
            });

            expect(result).toMatchObject({
                reason: 'no-prompting-text',
                status: 'cleared'
            });
            expect(JSON.parse(fs.readFileSync(promptContextPath, 'utf8'))).toMatchObject({
                promptingText: '',
                reason       : 'no-prompting-text',
                source       : 'codex-user-prompt-submit'
            });
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

test.describe('turn-presence hook writer', () => {
    const PLANE = Object.freeze({baseUrl: 'http://plane.test/mc/mcp', credential: 'test-bearer'});

    test('Claude UserPromptSubmit starts and PostToolUse refreshes the SAME turn, without inventing an id', async () => {
        const calls = [];

        const record = async args => { calls.push(args); return {agentIdentity: args.identity, status: 'recorded'} };

        await recordClaudeTurnPresence({
            env        : {NEO_AGENT_IDENTITY: '@test-claude'},
            hookPayload: {hook_event_name: 'UserPromptSubmit'},
            plane      : PLANE,
            record
        });

        await recordClaudeTurnPresence({
            env        : {NEO_AGENT_IDENTITY: '@test-claude'},
            hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Bash'},
            plane      : PLANE,
            record
        });

        expect(calls.map(({action, source, note}) => ({action, source, note}))).toEqual([
            {action: 'start',    source: 'claude-user-prompt-submit', note: 'claude UserPromptSubmit'},
            {action: 'progress', source: 'claude-post-tool-use',      note: 'claude PostToolUse Bash'}
        ]);

        calls.forEach(call => {
            expect(call.identity).toBe('@test-claude');
            expect(call.baseUrl).toBe(PLANE.baseUrl);
            // Neither call may carry a locally-minted turnId. The hook holds none and the server owns
            // interval identity; sending one would fork a second turn on every tool call. The freshness
            // bounds this test used to assert are the server's to stamp, not the hook's to compute.
            expect(call.turnId).toBeUndefined();
        });
    });

    test('an unconfigured plane skips by NAME and never reaches the transport', async () => {
        const calls = [];

        const result = await recordClaudeTurnPresence({
            env        : {NEO_AGENT_IDENTITY: '@test-claude'},
            hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Bash'},
            plane      : {baseUrl: ''},
            record     : async args => { calls.push(args); return {status: 'recorded'} }
        });

        // The replaced behaviour wrote to whatever path it computed and reported success. A skip that
        // says why is the whole point: a beacon in a store nobody reads makes an unmeasured state look
        // measured.
        expect(result.status).toBe('skipped');
        expect(result.reason).toContain('no Memory Core plane is configured');
        expect(calls).toHaveLength(0);
    });
});
