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
const cliScriptPath = path.resolve(__dirname, '../../../../../../../ai/scripts/maintenance/syncGithubWorkflow.mjs');

/**
 * @summary Imports the copyable GitHub workflow config template under a unit-test-only namespace.
 *
 * The template intentionally uses the production config class name so users can copy it as an
 * operator overlay. This helper imports it under a test-only namespace to avoid Neo's
 * `unitTestMode` namespace-collision guard.
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
    let ConfigProvider, originalEnv;

    test.beforeAll(async () => {
        ConfigProvider  = (await import('../../../../../../../ai/ConfigProvider.mjs')).default;
        originalEnv = {...process.env};
    });

    test.afterEach(() => {
        // Restore process.env to its pre-test snapshot so env-mutating tests stay isolated.
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
    });

    test('config.template.mjs contains all dynamically consumed keys', async () => {
        const configModule = await importTemplateConfig();
        const config = configModule.default;

        const syncDir = path.resolve(__dirname, '../../../../../../../ai/services/github-workflow/sync');
        const sharedDir = path.resolve(__dirname, '../../../../../../../ai/services/github-workflow/shared');
        const filesToScan = [
            path.join(syncDir, 'IssueSyncer.mjs'),
            path.join(syncDir, 'PullRequestSyncer.mjs'),
            path.join(syncDir, 'DiscussionSyncer.mjs'),
            path.join(syncDir, 'ReleaseNotesSyncer.mjs'),
            path.join(syncDir, 'MetadataManager.mjs'),
            path.join(sharedDir, 'archivePath.mjs')
        ];

        const requiredKeys = new Set();
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
            if (!templateKeys.includes(key)) {
                missingKeys.push(key);
            }
        }

        expect(missingKeys, `Missing keys in config.template.mjs: ${missingKeys.join(', ')}`).toEqual([]);
    });

    test('NEO_MCP_GITHUB_ARCHIVE_ROOT overrides config.issueSync.archiveRoot', async () => {
        // The env layer is applied AT CONSTRUCTION from each leaf's `env` var, so the
        // override must be present before the instance is built. The template singleton is
        // constructed (and env-bound) at import time, so we build a fresh raw instance from
        // the template's meta-leaf tree to exercise boot-time env binding deterministically.
        const {_data} = (await importTemplateConfig()).default;

        process.env.NEO_MCP_GITHUB_ARCHIVE_ROOT = '/custom/archive/path';

        const config = Neo.create(ConfigProvider, {data: _data});

        try {
            expect(config.getDataConfig('issueSync.archiveRoot').get()).toBe('/custom/archive/path');
        } finally {
            config.destroy();
        }
    });

    test('config.template.mjs keeps milestone archive routing opt-in by default', async () => {
        const config = (await importTemplateConfig()).default;

        expect(config.issueSync.routeByMilestone).toBe(false);
    });

    test('NEO_LOG_LEVEL overrides config.logLevel with validation', async () => {
        // Env binding + its parser-based validation run at construction, so each case uses a
        // fresh instance built from the template's meta-leaf tree (the singleton is already
        // env-bound at import). The leaf default is the SSOT for the fallback expectation.
        const {_data} = (await importTemplateConfig()).default;
        const defaultLogLevel = _data.logLevel.default;

        // Valid value: parsed + normalized to lower-case.
        process.env.NEO_LOG_LEVEL = 'DEBUG';
        const validConfig = Neo.create(ConfigProvider, {data: _data});

        try {
            expect(validConfig.getDataConfig('logLevel').get()).toBe('debug');
        } finally {
            validConfig.destroy();
        }

        // Invalid value: parser warns and returns undefined, so the leaf keeps its default.
        process.env.NEO_LOG_LEVEL = 'noisy';
        const originalWarn = console.warn;
        const warnings     = [];

        console.warn = (...args) => warnings.push(args.join(' '));

        let invalidConfig;
        try {
            invalidConfig = Neo.create(ConfigProvider, {data: _data});
        } finally {
            console.warn = originalWarn;
        }

        try {
            expect(invalidConfig.getDataConfig('logLevel').get()).toBe(defaultLogLevel);
            expect(warnings.join('\n')).toContain('Invalid NEO_LOG_LEVEL value: "noisy"');
        } finally {
            invalidConfig.destroy();
        }
    });

    test('logger filters stderr by priority and always emits errors', async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        const logger = (await import('../../../../../../../ai/mcp/server/github-workflow/logger.mjs')).default;

        const originalDebug = aiConfig.data.debug;
        const originalLogLevel = aiConfig.data.logLevel;
        const originalError = console.error;
        const calls = [];

        console.error = (...args) => calls.push(args.join(' '));

        try {
            aiConfig.data.debug = false;
            aiConfig.data.logLevel = 'warn';
            logger.debug('debug-hidden');
            logger.info('info-hidden');
            logger.log('log-hidden');
            logger.warn('warn-visible');
            logger.error('error-visible');

            expect(calls).toEqual([
                '[WARN] warn-visible',
                '[ERROR] error-visible'
            ]);

            calls.length = 0;
            aiConfig.data.logLevel = 'info';
            logger.debug('debug-hidden');
            logger.info('info-visible');
            logger.log('log-visible');
            logger.warn('warn-visible');
            logger.error('error-visible');

            expect(calls).toEqual([
                '[INFO] info-visible',
                '[LOG] log-visible',
                '[WARN] warn-visible',
                '[ERROR] error-visible'
            ]);

            calls.length = 0;
            aiConfig.data.logLevel = 'error';
            logger.warn('warn-hidden');
            logger.error('error-still-visible');

            expect(calls).toEqual(['[ERROR] error-still-visible']);

            calls.length = 0;
            aiConfig.data.logLevel = 'warn';
            aiConfig.data.debug = true;
            logger.debug('legacy-debug-visible');

            expect(calls).toEqual(['[DEBUG] legacy-debug-visible']);
        } finally {
            console.error = originalError;
            aiConfig.data.debug = originalDebug;
            aiConfig.data.logLevel = originalLogLevel;
        }
    });

    test('syncGithubWorkflow CLI selects info by default and debug for --verbose', async () => {
        const content = await fs.promises.readFile(cliScriptPath, 'utf8');

        expect(content).not.toContain('GH_Config.data.debug = true');
        expect(content).toContain("GH_Config.data.logLevel = verbose ? 'debug' : 'info'");
        expect(content).toContain("process.argv.includes('--verbose')");
    });
});
