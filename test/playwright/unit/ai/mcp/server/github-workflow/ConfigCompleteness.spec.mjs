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
const templateClassName = 'Neo.ai.mcp.server.github-workflow.Config';

/**
 * @summary Imports the copyable GitHub workflow config template under a unit-test-only namespace.
 *
 * The template intentionally uses the production config class name so users can copy it to
 * `config.mjs`. In a single Playwright worker, importing both files would otherwise trigger
 * Neo's `unitTestMode` namespace-collision guard.
 */
async function importTemplateConfig() {
    const originalSetupClass = Neo.setupClass;

    try {
        Neo.setupClass = cls => {
            if (cls?.config?.className === templateClassName) {
                cls.config = {
                    ...cls.config,
                    className: 'Neo.ai.mcp.server.github-workflow.ConfigTemplateCompletenessTest'
                };
            }

            return originalSetupClass.call(Neo, cls);
        };

        return await import(templatePath);
    } finally {
        Neo.setupClass = originalSetupClass;
    }
}

test.describe('GitHub Workflow MCP Server Config Completeness', () => {
    test('config.template.mjs contains all required path definitions', async () => {
        const configModule = await importTemplateConfig();
        const config = configModule.default;

        expect(config.issueSync).toBeDefined();
        expect(config.issueSync.issuesDir).toBeDefined();
        expect(config.issueSync.archiveRoot).toBeDefined();
        expect(config.issueSync.archiveRoot).toContain(path.normalize('resources/content/archive'));
        expect(config.issueSync.archiveDir).toBeDefined();
        expect(config.issueSync.discussionsDir).toBeDefined();
        expect(config.issueSync.pullsDir).toBeDefined();
        expect(config.issueSync.archiveChunkThreshold).toBe(100);
        expect(config.issueSync.archiveChunkPrefix).toBe('chunk-');
    });

    test('NEO_MCP_GITHUB_ARCHIVE_ROOT overrides config.issueSync.archiveRoot', async () => {
        const configModule = await importTemplateConfig();
        const config = configModule.default;

        const originalEnv = process.env.NEO_MCP_GITHUB_ARCHIVE_ROOT;
        process.env.NEO_MCP_GITHUB_ARCHIVE_ROOT = '/custom/archive/path';

        try {
            // Re-apply environment variables to simulate boot-time binding
            config.applyEnv();
            expect(config.issueSync.archiveRoot).toBe('/custom/archive/path');
        } finally {
            if (originalEnv !== undefined) {
                process.env.NEO_MCP_GITHUB_ARCHIVE_ROOT = originalEnv;
            } else {
                delete process.env.NEO_MCP_GITHUB_ARCHIVE_ROOT;
            }
            // Reset to defaults so other tests aren't affected
            config.data.issueSync.archiveRoot = config.defaultConfig.issueSync.archiveRoot;
        }
    });
});
