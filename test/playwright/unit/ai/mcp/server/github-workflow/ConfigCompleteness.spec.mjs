import {test, expect} from '@playwright/test';
import path from 'path';
import {fileURLToPath} from 'url';
import {setup} from '../../../../../setup.mjs';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'ConfigCompletenessTest'
    }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const templatePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/config.template.mjs');

test.describe('GitHub Workflow MCP Server Config Completeness', () => {
    test('config.template.mjs contains all required path definitions', async () => {
        const configModule = await import(templatePath);
        const config = configModule.default;

        expect(config.issueSync).toBeDefined();
        expect(config.issueSync.issuesDir).toBeDefined();
        expect(config.issueSync.archiveDir).toBeDefined();
        expect(config.issueSync.discussionsDir).toBeDefined();
        expect(config.issueSync.pullsDir).toBeDefined();
    });
});
