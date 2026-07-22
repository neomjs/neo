import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'RefreshWakeEnvelopeTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import fs                    from 'node:fs';
import os                    from 'node:os';
import path                  from 'node:path';
import {refreshWakeEnvelope} from '../../../../../../ai/scripts/maintenance/refreshWakeEnvelope.mjs';

// The spec NEVER touches the live seat envelope — every write targets an injected temp root.
const TEMP_ROOT     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-env-'));
const ENVELOPE_PATH = path.join(TEMP_ROOT, 'wake-envelope.json');

const SESSIONS = [
    {id: 'ses_old_1', time: {updated: 1000}},
    {id: 'ses_live',  time: {updated: 3000}},
    {id: 'ses_old_2', time: {updated: 2000}},
    ...Array.from({length: 8}, (_, i) => ({id: `ses_old_${i + 3}`, time: {updated: 500 + i}}))
];

function makeApi({sessions = SESSIONS, failProbe = false, calls = []} = {}) {
    return async ({method, path: apiPath, body}) => {
        calls.push({method, path: apiPath, body});

        if (apiPath.startsWith('/session?directory=')) return sessions;
        if (failProbe) throw new Error('probe refused');
        return null
    }
}

test.describe('refreshWakeEnvelope — agent-side boot self-write (#15684)', () => {
    test.afterAll(() => {
        fs.rmSync(TEMP_ROOT, {force: true, recursive: true})
    });

    test('binds the latest-updated session from an 11-session checkout and writes a 0600 envelope', async () => {
        const outcome = await refreshWakeEnvelope({
            apiImpl     : makeApi({}),
            directory   : '/seat/checkout',
            port        : 65000,
            envelopePath: ENVELOPE_PATH
        });

        expect(outcome.status).toBe('written-probed');
        expect(outcome.sessionId).toBe('ses_live');
        expect(outcome.port).toBe(65000);

        const envelope = JSON.parse(fs.readFileSync(ENVELOPE_PATH, 'utf8'));

        expect(envelope.sessionId).toBe('ses_live');
        expect(envelope.port).toBe(65000);
        expect(envelope.directory).toBe('/seat/checkout');
        expect(envelope.hostname).toBe('127.0.0.1');
        expect(fs.statSync(ENVELOPE_PATH).mode & 0o777).toBe(0o600);
    });

    test('the probe prompt targets the bound session id', async () => {
        const calls = [];

        await refreshWakeEnvelope({
            apiImpl     : makeApi({calls}),
            directory   : '/seat/checkout',
            port        : 65000,
            envelopePath: ENVELOPE_PATH
        });

        const probe = calls.find(call => call.method === 'POST');

        expect(probe).toBeTruthy();
        expect(probe.path).toBe('/session/ses_live/prompt_async');
        expect(probe.body.parts[0].text).toContain('wake boot self-write probe');
    });

    test('a failed probe degrades honestly: the envelope is written, the outcome is written-probe-failed', async () => {
        const outcome = await refreshWakeEnvelope({
            apiImpl     : makeApi({failProbe: true}),
            directory   : '/seat/checkout',
            port        : 65000,
            envelopePath: ENVELOPE_PATH
        });

        expect(outcome.status).toBe('written-probe-failed');
        expect(JSON.parse(fs.readFileSync(ENVELOPE_PATH, 'utf8')).sessionId).toBe('ses_live');
    });

    test('falsifier B: a parent-id-bearing child session is never selected even when newer', async () => {
        const calls   = [];
        const outcome = await refreshWakeEnvelope({
            apiImpl  : makeApi({calls, sessions: [
                {id: 'ses_writer', time: {updated: 1000}},
                {id: 'ses_child', parentID: 'ses_writer', time: {updated: 2000}}
            ]}),
            directory   : '/seat/checkout',
            port        : 65000,
            envelopePath: ENVELOPE_PATH
        });

        expect(outcome.sessionId).toBe('ses_writer');

        const probe = calls.find(call => call.method === 'POST');
        expect(probe.path).toBe('/session/ses_writer/prompt_async');
        expect(JSON.parse(fs.readFileSync(ENVELOPE_PATH, 'utf8')).sessionId).toBe('ses_writer');
    });

    test('an empty session list yields no-session without writing', () => {
        return refreshWakeEnvelope({
            apiImpl     : makeApi({sessions: []}),
            directory   : '/seat/checkout',
            port        : 65000,
            envelopePath: ENVELOPE_PATH
        }).then(outcome => {
            expect(outcome.status).toBe('no-session');
            expect(outcome.sessionId).toBe(null);
        })
    });
});
