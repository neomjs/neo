import {test, expect} from '@playwright/test';
import path from 'path';
import {fileURLToPath} from 'url';
import {setup} from '../../../../../setup.mjs';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import fs from 'fs';

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
    test('config.template.mjs contains all dynamically consumed keys', async () => {
        const configModule = await importTemplateConfig();
        const config = configModule.default;

        const syncDir = path.resolve(__dirname, '../../../../../../../ai/services/github-workflow/sync');
        const sharedDir = path.resolve(__dirname, '../../../../../../../ai/services/github-workflow/shared');
        const filesToScan = [
            path.join(syncDir, 'IssueSyncer.mjs'),
            path.join(syncDir, 'PullRequestSyncer.mjs'),
            path.join(syncDir, 'DiscussionSyncer.mjs'),
            path.join(syncDir, 'ReleaseSyncer.mjs'),
            path.join(syncDir, 'MetadataManager.mjs'),
            path.join(sharedDir, 'contentIndex.mjs')
        ];

        const requiredKeys = new Set();
        const optionalKeys = new Set(['contentRoot']);
        const regex = /issueSyncConfig\.([a-zA-Z0-9_]+)/g;

        for (const file of filesToScan) {
            if (fs.existsSync(file)) {
                const content = await fs.promises.readFile(file, 'utf8');
                let match;
                while ((match = regex.exec(content)) !== null) {
                    requiredKeys.add(match[1]);
                }
            }
        }

        const templateKeys = Object.keys(config.issueSync);
        const missingKeys = [];
        
        for (const key of requiredKeys) {
            if (optionalKeys.has(key)) {
                continue;
            }

            if (!templateKeys.includes(key)) {
                missingKeys.push(key);
            }
        }

        expect(missingKeys, `Missing keys in config.template.mjs: ${missingKeys.join(', ')}`).toEqual([]);
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
