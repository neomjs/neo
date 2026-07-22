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

const ENVELOPE_PATH = path.join(os.homedir(), '.local/share/opencode/wake-envelope.json');

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

function backupEnvelope() {
    try {
        return fs.readFileSync(ENVELOPE_PATH, 'utf8')
    } catch {
        return null
    }
}

function restoreEnvelope(content) {
    if (content === null) {
        try { fs.unlinkSync(ENVELOPE_PATH) } catch { /* absent */ }
    } else {
        fs.writeFileSync(ENVELOPE_PATH, content)
    }
}

test.describe('refreshWakeEnvelope — agent-side boot self-write (#15684)', () => {
    let saved;

    test.beforeEach(() => {
        saved = backupEnvelope()
    });

    test.afterEach(() => {
        restoreEnvelope(saved)
    });

    test('binds the latest-updated session from an 11-session checkout and writes a 0600 envelope', async () => {
        const outcome = await refreshWakeEnvelope({
            apiImpl  : makeApi({}),
            directory: '/seat/checkout',
            port     : 65000
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
            apiImpl  : makeApi({calls}),
            directory: '/seat/checkout',
            port     : 65000
        });

        const probe = calls.find(call => call.method === 'POST');

        expect(probe).toBeTruthy();
        expect(probe.path).toBe('/session/ses_live/prompt_async');
        expect(probe.body.parts[0].text).toContain('wake boot self-write probe');
    });

    test('a failed probe degrades honestly: the envelope is written, the outcome is written-probe-failed', async () => {
        const outcome = await refreshWakeEnvelope({
            apiImpl  : makeApi({failProbe: true}),
            directory: '/seat/checkout',
            port     : 65000
        });

        expect(outcome.status).toBe('written-probe-failed');
        expect(JSON.parse(fs.readFileSync(ENVELOPE_PATH, 'utf8')).sessionId).toBe('ses_live');
    });

    test('an empty session list yields no-session without writing', () => {
        return refreshWakeEnvelope({
            apiImpl  : makeApi({sessions: []}),
            directory: '/seat/checkout',
            port     : 65000
        }).then(outcome => {
            expect(outcome.status).toBe('no-session');
            expect(outcome.sessionId).toBe(null);
        })
    });
});
