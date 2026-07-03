import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSAccountsTest'
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import Accounts        from '../../../../../apps/agentos/view/Accounts.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    viewPath   = path.join(repoRoot, 'apps/agentos/view/Accounts.mjs');

test.describe('AgentOS.view.Accounts credential boundary', () => {
    test('public definition projection strips submitted credential material', () => {
        const values = {
            credential    : 'ghp_should_not_escape',
            githubUsername: 'neo-gpt',
            harnessType   : 'codex',
            pat           : 'also-secret'
        };

        const publicDefinition = Accounts.prototype.createPublicAgentDefinition(values);

        expect(publicDefinition.githubUsername).toBe('neo-gpt');
        expect(publicDefinition.harnessType).toBe('codex');
        expect(JSON.stringify(publicDefinition)).not.toContain('ghp_should_not_escape');
        expect(publicDefinition.credential).toBeUndefined();
        expect(publicDefinition.pat).toBeUndefined()
    });

    test('view source fails closed without browser persistence or credential logging', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('Fleet Registry bridge unavailable');
        expect(source).toContain('clearCredentialField');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    test('identity setup writes only the redacted projection to the shared roster', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        // upsert goes through the AgentDefinitions singleton with the redacted projection,
        // never the raw form values / credential.
        expect(source).toContain('AgentDefinitions.add');
        expect(source).toContain('createPublicAgentDefinition');
        expect(source).not.toMatch(/AgentDefinitions\.add\(\s*values/)
    })
});

test.describe('AgentOS.view.Accounts NL-MCP connect entry (#13548)', () => {
    let savedAgentOS;

    test.beforeEach(() => { savedAgentOS = globalThis.AgentOS });
    test.afterEach(()  => { globalThis.AgentOS = savedAgentOS });

    test('connectExternalHarnessBridge fails closed when no Neural Link connection bridge is injected', async () => {
        globalThis.AgentOS = undefined; // dev-server / un-shelled app — no Brain-side bridge

        await expect(Accounts.prototype.connectExternalHarnessBridge({action: 'start'}))
            .rejects.toThrow('Neural Link connection bridge unavailable')
    });

    test('connectExternalHarnessBridge forwards exactly the connect request — carries no credential', async () => {
        let received;
        globalThis.AgentOS = {neuralLink: {connectionBridge: {
            manageConnection: async req => { received = req; return {message: 'External harness started'} }
        }}};

        const result = await Accounts.prototype.connectExternalHarnessBridge({action: 'start'});

        expect(received).toEqual({action: 'start'}); // exactly the NL-MCP request shape...
        expect(received.credential).toBeUndefined();  // ...with no credential crossing the boundary
        expect(result.message).toBe('External harness started')
    });

    test('onConnectExternalHarnessClick reports is-live on a successful connect', async () => {
        const calls = [];
        const stub  = {
            connectExternalHarnessBridge: async request => {
                expect(request).toEqual({action: 'start'});
                return {message: 'External harness started'}
            },
            updateBridgeStatus: (stateCls, message) => calls.push({stateCls, message})
        };

        await Accounts.prototype.onConnectExternalHarnessClick.call(stub);

        expect(calls).toHaveLength(1);
        expect(calls[0].stateCls).toBe('is-live');
        expect(calls[0].message).toContain('External harness started')
    });

    test('onConnectExternalHarnessClick fails closed to is-error when the bridge is unavailable', async () => {
        const calls = [];
        const stub  = {
            connectExternalHarnessBridge: async () => { throw new Error('Neural Link connection bridge unavailable') },
            updateBridgeStatus: (stateCls, message) => calls.push({stateCls, message})
        };

        await Accounts.prototype.onConnectExternalHarnessClick.call(stub);

        expect(calls).toHaveLength(1);
        expect(calls[0].stateCls).toBe('is-error');     // never throws out of the handler...
        expect(calls[0].message).toMatch(/fails closed/i) // ...reports the fail-closed state instead
    });

    test('the connect path stays credential-free and fails closed in source', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('connectExternalHarnessBridge');
        expect(source).toContain('neuralLink?.connectionBridge');
        expect(source).toContain('Neural Link connection bridge unavailable');
        // the connect handler/bridge invoke manage_connection with {action} only — never a credential
        expect(source).toMatch(/connectExternalHarnessBridge\(\{action: 'start'\}\)/)
    })
});
