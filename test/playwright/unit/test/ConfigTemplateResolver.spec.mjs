import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import process         from 'node:process';
import {pathToFileURL} from 'node:url';

import {
    activateConfigTemplateResolver,
    resolveConfigTemplateUrl
} from '../../configTemplateResolver.mjs';

/**
 * @summary Proves the Playwright config-template resolver keeps the entire test module graph on
 * tracked templates, preserves exact module identity, excludes non-template/outside-root configs,
 * and routes writable state away from developer and runtime storage.
 */
test.describe('test/playwright/configTemplateResolver (#11976)', () => {
    const rootDir      = path.resolve(import.meta.dirname, '../../../..'),
          resolverPath = path.join(rootDir, 'test/playwright/configTemplateResolver.mjs'),
          overlayPath  = path.join(rootDir, 'ai/mcp/server/memory-core/config.mjs'),
          templatePath = path.join(rootDir, 'ai/mcp/server/memory-core/config.template.mjs'),
          storageRoots = [];

    function childEnv() {
        const env         = {...process.env},
              storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-config-template-resolver-'));

        storageRoots.push(storageRoot);

        env.UNIT_TEST_MODE     = 'true';
        env.NEO_MEMORY_LOG_PATH = path.join(storageRoot, 'memory-core-logs');
        env.NEO_KB_LOG_PATH     = path.join(storageRoot, 'knowledge-base-logs');
        env.NEO_NL_LOG_PATH     = path.join(storageRoot, 'neural-link-logs');
        env.NEO_TELEMETRY_DB_PATH_TEST = path.join(storageRoot, 'telemetry.sqlite');

        env.NODE_OPTIONS = `--import=${pathToFileURL(resolverPath).href}`;

        return env;
    }

    test.afterAll(() => {
        storageRoots.forEach(storageRoot => fs.rmSync(storageRoot, {recursive: true, force: true}));
    });

    const identityProbe = [
        `import Neo from './src/Neo.mjs';`,
        `import './src/core/_export.mjs';`,
        `Neo.config.unitTestMode = true;`,
        `const overlay = (await import('./ai/mcp/server/memory-core/config.mjs')).default;`,
        `const template = (await import('./ai/mcp/server/memory-core/config.template.mjs')).default;`,
        `const kb = (await import('./ai/mcp/server/knowledge-base/config.template.mjs')).default;`,
        `const nl = (await import('./ai/mcp/server/neural-link/config.template.mjs')).default;`,
        `console.log(JSON.stringify({same: overlay === template, className: overlay.className, telemetrySame: kb.memoryCoreDbPath === nl.memoryCoreDbPath, telemetryPath: kb.memoryCoreDbPath, graph: overlay.storagePaths.graph, graphProd: overlay.storagePaths.graphProd, useTestDatabase: overlay.storagePaths.useTestDatabase, memoryWalDir: overlay.memoryWal.dir, handoffFilePath: overlay.handoffFilePath, chromaUseTestDatabase: overlay.engines.chroma.useTestDatabase, chromaDataDir: overlay.engines.chroma.dataDir}));`
    ].join('\n');

    test('maps only repo-owned overlays with tracked sibling templates', () => {
        expect(resolveConfigTemplateUrl(pathToFileURL(overlayPath).href)).toBe(pathToFileURL(templatePath).href);
        expect(resolveConfigTemplateUrl(pathToFileURL(templatePath).href)).toBeNull();
        expect(resolveConfigTemplateUrl(
            pathToFileURL(path.join(rootDir, 'ai/mcp/client/config.mjs')).href
        )).toBeNull();
        expect(resolveConfigTemplateUrl(pathToFileURL(path.join(os.tmpdir(), 'config.mjs')).href)).toBeNull();

        const syntheticRoot     = path.join(os.tmpdir(), 'neo-resolver-clean-checkout'),
              syntheticOverlay  = path.join(syntheticRoot, 'ai/example/config.mjs'),
              syntheticTemplate = path.join(syntheticRoot, 'ai/example/config.template.mjs');

        expect(resolveConfigTemplateUrl(pathToFileURL(syntheticOverlay).href, {
            rootDir   : syntheticRoot,
            existsSync: candidate => candidate === syntheticTemplate
        })).toBe(pathToFileURL(syntheticTemplate).href);
    });

    test('preloads descendants and routes template-derived writable paths to temporary storage', () => {
        const {preloadOption, storageRoot} = activateConfigTemplateResolver();

        expect(process.env.NODE_OPTIONS.split(/\s+/)).toContain(preloadOption);
        expect(path.relative(os.tmpdir(), storageRoot).startsWith('..')).toBe(false);
        expect(process.env.NEO_MEMORY_LOG_PATH.startsWith(storageRoot)).toBe(true);
        expect(process.env.NEO_KB_LOG_PATH.startsWith(storageRoot)).toBe(true);
        expect(process.env.NEO_KB_EMBEDDING_RESUME_STATE_DIR).toBe(path.join(storageRoot, 'kb-sync'));
        expect(process.env.NEO_NL_LOG_PATH.startsWith(storageRoot)).toBe(true);
        expect(process.env.NEO_TELEMETRY_DB_PATH_TEST.startsWith(storageRoot)).toBe(true);
        expect(process.env.NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH).toBe(
            path.join(storageRoot, 'deployment-state', 'snapshot.json')
        );
        expect(process.env.NEO_RECOVERY_ACTUATOR_HEAL_ATTEMPTS_PATH.startsWith(storageRoot)).toBe(true);
        expect(process.env.NEO_RECOVERY_ACTUATOR_RUN_STATE_DIR.startsWith(storageRoot)).toBe(true);
    });

    test('routes writable plane members to distinct worker-local paths', () => {
        const
            boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-worker-snapshot-paths-')),
            probe        = `console.log(JSON.stringify({
                kbResume: process.env.NEO_KB_EMBEDDING_RESUME_STATE_DIR,
                snapshot: process.env.NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH
            }))`;

        storageRoots.push(boundaryRoot);

        const workerPaths = [0, 1].map(workerIndex => {
            const env = {
                ...process.env,
                NEO_TEST_CONFIG_TEMPLATES: 'true',
                NEO_TEST_STORAGE_ROOT    : boundaryRoot,
                NODE_OPTIONS             : `--import=${pathToFileURL(resolverPath).href}`,
                TEST_WORKER_INDEX        : String(workerIndex),
                UNIT_TEST_MODE           : 'true'
            };

            delete env.NEO_TEST_CONFIG_TEMPLATE_SCOPE;

            const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
                cwd     : rootDir,
                encoding: 'utf8',
                env
            });

            expect(result.status, result.stderr).toBe(0);

            return JSON.parse(result.stdout.trim())
        });

        expect(workerPaths).toEqual([
            {
                kbResume: path.join(boundaryRoot, 'worker-0', 'kb-sync'),
                snapshot: path.join(boundaryRoot, 'worker-0', 'deployment-state', 'snapshot.json')
            },
            {
                kbResume: path.join(boundaryRoot, 'worker-1', 'kb-sync'),
                snapshot: path.join(boundaryRoot, 'worker-1', 'deployment-state', 'snapshot.json')
            }
        ])
    });

    test('preserves an explicit same-worker child writable-path fixture', () => {
        const logPath = path.join(os.tmpdir(), `neo-explicit-child-log-${process.pid}`),
              env     = childEnv();

        env.NEO_MEMORY_LOG_PATH = logPath;

        const result = spawnSync(process.execPath, ['--input-type=module', '-e',
            `console.log(process.env.NEO_MEMORY_LOG_PATH)`
        ], {
            cwd     : rootDir,
            encoding: 'utf8',
            env
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe(logPath);
    });

    test('overlay and template specifiers resolve to one template module', () => {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', identityProbe], {
            cwd     : rootDir,
            encoding: 'utf8',
            env     : childEnv()
        });

        expect(result.status, result.stderr).toBe(0);
        const payload = JSON.parse(result.stdout.trim());

        expect(payload).toMatchObject({
            same         : true,
            className    : 'Neo.ai.mcp.server.memory-core.Config',
            telemetrySame: true
        });
        expect(payload.telemetryPath.startsWith(os.tmpdir())).toBe(true);
    });

    test('non-unit Playwright descendants still resolve shared telemetry to disposable storage', () => {
        const env = childEnv();

        delete env.UNIT_TEST_MODE;

        const result = spawnSync(process.execPath, ['--input-type=module', '-e', identityProbe], {
            cwd     : rootDir,
            encoding: 'utf8',
            env
        });

        expect(result.status, result.stderr).toBe(0);

        const payload = JSON.parse(result.stdout.trim());

        expect(payload.telemetrySame).toBe(true);
        expect(payload.telemetryPath).toBe(env.NEO_TELEMETRY_DB_PATH_TEST);
        expect(payload.telemetryPath.startsWith(os.tmpdir())).toBe(true);
        expect(payload.telemetryPath.startsWith(os.homedir())).toBe(false);
        expect(payload.useTestDatabase).toBe(true);
        expect(payload.graph).toBe(':memory:');
        expect(payload.graph).not.toBe(payload.graphProd);
        expect(payload.memoryWalDir.startsWith(os.tmpdir())).toBe(true);
        expect(payload.handoffFilePath.startsWith(os.tmpdir())).toBe(true);
        expect(payload.chromaUseTestDatabase).toBe(true);
        expect(payload.chromaDataDir.startsWith(os.tmpdir())).toBe(true);
    });
});
