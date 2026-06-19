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
