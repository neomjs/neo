import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFleetSettingsPanelTest'
    }
});

import {test, expect}     from '@playwright/test';
import fs                 from 'fs';
import path               from 'path';
import {fileURLToPath}    from 'url';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import AgentDefinitions   from '../../../../../apps/agentos/store/AgentDefinitions.mjs';
import FleetSettingsPanel from '../../../../../apps/agentos/view/FleetSettingsPanel.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    appPath    = path.join(repoRoot, 'apps/agentos/app.mjs'),
    panelPath  = path.join(repoRoot, 'apps/agentos/view/FleetSettingsPanel.mjs');

test.describe('AgentOS.view.FleetSettingsPanel fleet roster', () => {
    test('shared agent-definition roster (singleton) exposes only redacted public fields', () => {
        // AgentDefinitions is a singleton: Accounts writes, this view's grid reads the same instance.
        const [record] = AgentDefinitions.getRange();

        expect(record.credentialState).toBe('redacted');
        expect(record.statusText).toContain('PAT values are never loaded');
        expect(record.credential).toBeUndefined();
        expect(record.pat).toBeUndefined();
        expect(record.token).toBeUndefined()
    });

    test('fleet view is read + lifecycle only — no credential logic (that lives in Accounts)', () => {
        const source = fs.readFileSync(panelPath, 'utf8');

        expect(source).toContain('GridContainer');             // the roster grid stays
        expect(source).not.toContain('clearCredentialField');
        expect(source).not.toContain('PasswordField');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    test('the lifecycle controls are LIVE UI consumers of the fleet registry bridge (not gated)', () => {
        const source = fs.readFileSync(panelPath, 'utf8');

        // Define + START one agent from the UI is the product value — the controls are live consumers.
        expect(source).toContain("handler: 'up.onStartAgentClick'");
        expect(source).toContain("handler: 'up.onStopAgentClick'");
        expect(source).toContain("handler: 'up.onRestartAgentClick'");
        expect(source).toContain('registryBridge');
        expect(source).not.toContain('disabled: true')          // the controls are no longer gated
    });

    test('runLifecycleAction invokes the injected registry bridge with the agent id + reflects the result', async () => {
        const record = {id: 'alice', lifecycleState: 'defined', statusText: 'x'};
        const calls  = [];

        globalThis.AgentOS = {fleet: {registryBridge: {startAgent: async id => { calls.push(id); return {state: 'running'}; }}}};

        try {
            await FleetSettingsPanel.prototype.runLifecycleAction.call(
                {getTargetAgentRecord: () => record}, 'startAgent', 'starting', 'running'
            );

            expect(calls).toEqual(['alice']);
            expect(record.lifecycleState).toBe('running');
            expect(record.statusText).toContain('alice')
        } finally {
            delete globalThis.AgentOS
        }
    });

    test('runLifecycleAction fails closed (gated) when no bridge is injected — invents no lifecycle state', async () => {
        const record = {id: 'alice', lifecycleState: 'defined', statusText: 'x'};

        delete globalThis.AgentOS;
        await FleetSettingsPanel.prototype.runLifecycleAction.call(
            {getTargetAgentRecord: () => record}, 'startAgent', 'starting', 'running'
        );

        expect(record.lifecycleState).toBe('gated');
        expect(record.statusText).toContain('fail closed')
    });

    test('root app shell loads AgentOS styles for the cockpit', () => {
        const source = fs.readFileSync(appPath, 'utf8');

        expect(source).toContain("appThemeFolder: 'agentos'")
    })
});
