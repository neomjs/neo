import {expect, test}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {normalizeAgentIdentity} from '../../../../.kimi-code/hooks/wakeEnvelopeHook.mjs';

const hookPath = fileURLToPath(new URL('../../../../.kimi-code/hooks/wakeEnvelopeHook.mjs', import.meta.url));

// The hook is stdin-driven with the payload on stdin and the envelope written under
// KIMI_CODE_HOME. The .env identity SOURCE is deliberately not fixture-driven: the hook reads
// the checkout's real .env (host state, not repo fixture), so the file-source path is covered
// by the shared normalizeAgentIdentity unit cases + the env-source spawn cases below.

/**
 * @summary Spawns the hook with a SessionStart payload and returns the written envelope.
 * @param {Object} options
 * @param {Object} options.env Extra env (merged over process.env).
 * @returns {Object}
 */
function runHook({env}) {
    const
        kimiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-envelope-hook-')),
        result   = spawnSync(process.execPath, [hookPath], {
            encoding: 'utf8',
            env     : {...process.env, KIMI_CODE_HOME: kimiHome, ...env},
            input   : JSON.stringify({hook_event_name: 'SessionStart', session_id: 'session_spec', cwd: '/seat/checkout'}),
            timeout : 5000
        });

    expect(result.status).toBe(0);

    return JSON.parse(fs.readFileSync(path.join(kimiHome, 'wake-envelope.json'), 'utf8'));
}

test.describe('wakeEnvelopeHook identity normalization (#15737)', () => {
    test('normalizeAgentIdentity: every provisioned shape lands on the canonical @handle', () => {
        // The four shapes a seat .env / launch env actually carries — the daemon compares the
        // envelope EXACTLY against the subscription's canonical identity, so all must agree.
        expect(normalizeAgentIdentity('neo-kimi-iris')).toBe('@neo-kimi-iris');       // bare
        expect(normalizeAgentIdentity('@neo-kimi-iris')).toBe('@neo-kimi-iris');      // canonical
        expect(normalizeAgentIdentity('"neo-kimi-iris"')).toBe('@neo-kimi-iris');     // double-quoted
        expect(normalizeAgentIdentity("'neo-kimi-iris'")).toBe('@neo-kimi-iris');     // single-quoted
        expect(normalizeAgentIdentity('"@neo-kimi-iris"')).toBe('@neo-kimi-iris');    // quoted canonical
        expect(normalizeAgentIdentity('  neo-kimi-iris  ')).toBe('@neo-kimi-iris');   // padded

        // Fail-open preserved: a missing/unprovisioned value stays a non-string null/undefined,
        // never an invented identity. An empty string stays empty (the daemon refuses it loudly).
        expect(normalizeAgentIdentity(null)).toBe(null);
        expect(normalizeAgentIdentity(undefined)).toBe(undefined);
        expect(normalizeAgentIdentity('')).toBe('');
    });

    test('SessionStart spawn: a quoted env identity is written to the envelope canonicalized', () => {
        const envelope = runHook({env: {NEO_AGENT_IDENTITY: '"neo-kimi-iris"'}});

        expect(envelope.agentIdentity).toBe('@neo-kimi-iris');
        expect(envelope.sessionId).toBe('session_spec');
        expect(Number.isInteger(envelope.pid)).toBe(true);
    });

    test('SessionStart spawn: a bare env identity is canonicalized identically', () => {
        const envelope = runHook({env: {NEO_AGENT_IDENTITY: 'neo-kimi-iris'}});

        expect(envelope.agentIdentity).toBe('@neo-kimi-iris');
    });

    test('SessionStart spawn: the envelope lands mode 0600 under KIMI_CODE_HOME', () => {
        const
            kimiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-envelope-hook-')),
            result   = spawnSync(process.execPath, [hookPath], {
                encoding: 'utf8',
                env     : {...process.env, KIMI_CODE_HOME: kimiHome, NEO_AGENT_IDENTITY: '@neo-kimi-iris'},
                input   : JSON.stringify({hook_event_name: 'SessionStart', session_id: 'session_spec', cwd: '/seat/checkout'}),
                timeout : 5000
            });

        expect(result.status).toBe(0);

        const stat = fs.statSync(path.join(kimiHome, 'wake-envelope.json'));
        expect(stat.mode & 0o777).toBe(0o600);
    });

    test('fail-open: a malformed stdin payload exits 0 and writes nothing', () => {
        const
            kimiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-envelope-hook-')),
            result   = spawnSync(process.execPath, [hookPath], {
                encoding: 'utf8',
                env     : {...process.env, KIMI_CODE_HOME: kimiHome},
                input   : 'not json',
                timeout : 5000
            });

        expect(result.status).toBe(0);
        expect(fs.existsSync(path.join(kimiHome, 'wake-envelope.json'))).toBe(false);
    });
});
