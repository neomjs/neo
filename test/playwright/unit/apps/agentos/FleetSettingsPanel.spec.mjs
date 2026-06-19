import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFleetSettingsPanelTest'
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import AgentDefinitions from '../../../../../apps/agentos/store/AgentDefinitions.mjs';

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

    test('fleet view is read + lifecycle only — identity setup + credential logic moved to Accounts', () => {
        const source = fs.readFileSync(panelPath, 'utf8');

        // The cockpit keeper-view split: this view keeps the gated lifecycle controls + the roster grid,
        // and holds NO credential handling (that lives in AgentOS.view.Accounts).
        expect(source).toContain('disabled: true');            // lifecycle controls stay, gated
        expect(source).toContain('GridContainer');             // the roster grid stays
        expect(source).not.toContain('clearCredentialField');
        expect(source).not.toContain('PasswordField');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    test('root app shell loads AgentOS styles for the cockpit', () => {
        const source = fs.readFileSync(appPath, 'utf8');

        expect(source).toContain("appThemeFolder: 'agentos'")
    })
});
