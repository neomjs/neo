import {test, expect} from '@playwright/test';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../../../../ai/mcp/server/github-workflow/config.mjs');
const templatePath = path.resolve(__dirname, '../../../../ai/mcp/server/github-workflow/config.template.mjs');

test.describe('GitHub Workflow MCP Server Config Completeness', () => {
    test.beforeAll(async () => {
        await import('../../../../src/neo.mjs');
        if (!fs.existsSync(configPath)) {
            fs.copyFileSync(templatePath, configPath);
        }
    });

    test('PullRequestSyncer fails if pullsDir is undefined in config', async () => {
        // Load the config template
        const configModule = await import(templatePath);
        const config = configModule.default;
        
        // Mock the scenario where pullsDir is missing
        const originalPullsDir = config.issueSync.pullsDir;
        config.issueSync.pullsDir = undefined;
        
        // Import the syncer and try to run it
        const PullRequestSyncer = (await import('../../../../ai/mcp/server/github-workflow/services/sync/PullRequestSyncer.mjs')).default;
        
        try {
            await PullRequestSyncer.syncPullRequests({});
            expect(false).toBe(true); // Should not reach here
        } catch (err) {
            expect(err.message).toMatch(/The "path" argument must be of type string/i);
        } finally {
            // Restore config
            config.issueSync.pullsDir = originalPullsDir;
        }
    });

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
