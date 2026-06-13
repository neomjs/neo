import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFleetSettingsPanelTest'
    }
});

import {test, expect}    from '@playwright/test';
import fs                from 'fs';
import path              from 'path';
import {fileURLToPath}   from 'url';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import AgentDefinitions  from '../../../../../apps/agentos/store/AgentDefinitions.mjs';
import FleetSettingsPanel from '../../../../../apps/agentos/view/FleetSettingsPanel.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    appPath    = path.join(repoRoot, 'apps/agentos/app.mjs'),
    panelPath  = path.join(repoRoot, 'apps/agentos/view/FleetSettingsPanel.mjs');

test.describe('AgentOS.view.FleetSettingsPanel credential boundary', () => {
    test('agent definition store exposes only redacted public fields', () => {
        const store = Neo.create(AgentDefinitions, {
            id: 'agentos-fleet-settings-agent-definitions-test'
        });

        try {
            const [record] = store.getRange();

            expect(record.credentialState).toBe('redacted');
            expect(record.statusText).toContain('PAT values are never loaded');
            expect(record.credential).toBeUndefined();
            expect(record.pat).toBeUndefined();
            expect(record.token).toBeUndefined()
        } finally {
            store.destroy()
        }
    });

    test('public definition projection strips submitted credential material', () => {
        const values = {
            credential    : 'ghp_should_not_escape',
            githubUsername: 'neo-gpt',
            harnessType   : 'codex',
            pat           : 'also-secret'
        };

        const publicDefinition = FleetSettingsPanel.prototype.createPublicAgentDefinition(values);

        expect(publicDefinition.githubUsername).toBe('neo-gpt');
        expect(publicDefinition.harnessType).toBe('codex');
        expect(JSON.stringify(publicDefinition)).not.toContain('ghp_should_not_escape');
        expect(publicDefinition.credential).toBeUndefined();
        expect(publicDefinition.pat).toBeUndefined()
    });

    test('pane source fails closed without browser persistence or credential logging', () => {
        const source = fs.readFileSync(panelPath, 'utf8');

        expect(source).toContain('Fleet Registry bridge unavailable');
        expect(source).toContain('clearCredentialField');
        expect(source).toContain('disabled: true');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    test('root app shell loads AgentOS styles for the settings pane', () => {
        const source = fs.readFileSync(appPath, 'utf8');

        expect(source).toContain("appThemeFolder: 'agentos'")
    })
});
