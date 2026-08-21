import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {IDENTITIES} from '../../../../ai/graph/identityRoots.mjs';
import {
    extractPromptingTextFromHookPayload,
    extractWakeSubmitNonce,
    getCodexPromptContextPath,
    readCodexContext,
    recordTurnStarted,
    writePromptContextFromHookPayload
} from '../../../../.codex/hooks/codex-context.mjs';
import {recordClaudeTurnPresence} from '../../../../.claude/hooks/turnPresenceHook.mjs';

const CODEX_HOOK = fileURLToPath(new URL('../../../../.codex/hooks/codex-context.mjs', import.meta.url));

/**
 * @summary Runs the Codex hook in a child that inherits no institutional authority.
 *
 * Filesystem isolation is not state isolation: the prompt path calls `recordTurnStarted`, so an
 * inherited `NEO_AGENT_IDENTITY` plus a configured plane base lets a unit run write a real
 * turn-presence interval onto a maintainer's live deployment. The child therefore gets an
 * ALLOWLIST rather than `process.env` minus the known keys — a blocklist silently readmits the
 * next authority variable anyone adds. `process.execPath` keeps the child on the runtime under
 * test rather than whichever `node` the PATH happens to resolve.
 * @param {Object} [options]
 * @param {String[]} [options.args=[]] Hook arguments.
 * @param {String|null} [options.daemonDir=null] Value for `NEO_AI_DAEMON_DIR`.
 * @param {String} [options.input=''] stdin payload.
 * @returns {String} The child's stdout.
 */
function runCodexHook({args = [], daemonDir = null, input = ''} = {}) {
    return execFileSync(process.execPath, [CODEX_HOOK, ...args], {
        encoding: 'utf8',
        env     : {
            HOME: os.tmpdir(),
            PATH: process.env.PATH,
            ...(daemonDir ? {NEO_AI_DAEMON_DIR: daemonDir} : {})
        },
        input
    })
}

/**
 * @summary Runs `body` against a fresh daemon directory and removes it afterwards.
 * @param {Function} body Receives the directory path.
 * @returns {void}
 */
function withDaemonDir(body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hook-'));

    try {
        body(dir)
    } finally {
        fs.rmSync(dir, {force: true, recursive: true})
    }
}

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

    test('#17442: SessionStart emits the core preflight, and only that', () => {
        const out = runCodexHook({args: ['--session-start'], input: '{}'});

        // The sentence must name the negative transition, not merely remind about the call — an
        // agent that reads "check your mailbox" and gets an error still needs to know that is
        // degradation rather than an empty inbox.
        expect(out).toContain("list_messages({status:'unread'})");
        expect(out).toMatch(/not an empty inbox/);
        expect(out).toMatch(/self-repair/);

        // The guard card belongs to `UserPromptSubmit`, which injects it on the very next prompt.
        // Emitting it here too bought one duplicate per lifecycle reset, and reading it FIRST made
        // this sentence contingent on that file existing — so its absence is the assertion.
        expect(out).not.toContain('# Codex Desktop Guard Card');
        expect(out.trim().split('\n')).toHaveLength(1);
    });

    test('#17442: SessionStart mints NO turn-presence interval and writes NO prompt provenance', () => {
        // The load-bearing arm. SessionStart fires on startup/resume/compact — none of which is an
        // operator turn. Minting presence there fabricates liveness for a seat that has not acted.
        withDaemonDir(dir => {
            const ctxPath  = getCodexPromptContextPath({env: {NEO_AI_DAEMON_DIR: dir}}),
                  sentinel = '__17442_untouched__';

            fs.mkdirSync(path.dirname(ctxPath), {recursive: true});
            fs.writeFileSync(ctxPath, sentinel, 'utf8');

            runCodexHook({args: ['--session-start'], daemonDir: dir, input: JSON.stringify({prompt: 'ignored'})});

            expect(fs.readFileSync(ctxPath, 'utf8')).toBe(sentinel);
        });
    });

    test('#17442 CONTROL: without the flag the hook still takes the prompt path', () => {
        // Without this pair, both arms above pass on a hook that has stopped working entirely. This
        // is the arm that would REACH a live transport on an inherited environment, so it is also
        // the one that proves `runCodexHook`'s allowlist is doing work.
        withDaemonDir(dir => {
            const ctxPath = getCodexPromptContextPath({env: {NEO_AI_DAEMON_DIR: dir}});

            fs.mkdirSync(path.dirname(ctxPath), {recursive: true});
            fs.writeFileSync(ctxPath, '__stale__', 'utf8');

            runCodexHook({daemonDir: dir, input: JSON.stringify({prompt: 'a real operator prompt'})});

            expect(fs.readFileSync(ctxPath, 'utf8')).not.toBe('__stale__');
        });
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
