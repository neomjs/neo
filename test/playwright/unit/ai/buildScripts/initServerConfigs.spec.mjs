import {setup} from '../../../setup.mjs';

const appName = 'InitServerConfigsDriftTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import fsExtra        from 'fs-extra';
import path           from 'path';

test.describe.configure({mode: 'serial'});

test.describe('initServerConfigs — template drift detection (#10815)', () => {
    let initConfigs, projectShape, detectDrift;
    let workRoot;

    function recordingLogger() {
        const log  = [];
        const warn = [];
        const error = [];
        return {
            log:   (...args) => log.push(args.join(' ')),
            warn:  (...args) => warn.push(args.join(' ')),
            error: (...args) => error.push(args.join(' ')),
            entries: {log, warn, error}
        }
    }

    function buildServerSandbox({sandboxName, templateContents, configContents}) {
        const root = path.join(workRoot, sandboxName);
        fs.mkdirSync(root, {recursive: true});

        const serverDir = path.join(root, 'memory-core');
        fs.mkdirSync(serverDir, {recursive: true});

        if (templateContents !== undefined) {
            fs.writeFileSync(path.join(serverDir, 'config.template.mjs'), templateContents);
        }
        if (configContents !== undefined) {
            fs.writeFileSync(path.join(serverDir, 'config.mjs'), configContents);
        }

        return root;
    }

    test.beforeAll(async () => {
        ({initConfigs, projectShape, detectDrift} = await import('../../../../../buildScripts/ai/initServerConfigs.mjs'));

        workRoot = path.resolve(process.cwd(), 'tmp', `init-server-configs-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});
    });

    test.afterAll(() => {
        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test('AC1: missing config.mjs is cloned from template', async () => {
        const templateSrc = `import path from 'path';\nexport default {x: 1};\n`;
        const root = buildServerSandbox({
            sandboxName     : 'ac1-clone',
            templateContents: templateSrc,
            configContents  : undefined
        });

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('clone');

        const cloned = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(cloned).toBe(templateSrc);
        expect(logger.entries.log.some(l => l.includes("Cloning from template"))).toBe(true);
    });

    test('AC2: drifting config.mjs without --migrate-config emits warning, does not overwrite', async () => {
        const templateSrc = [
            `import path from 'path';`,
            `import {parsePort, parseUrl} from '../shared/helpers/EnvConfig.mjs';`,
            `import {resolveChromaHost} from '../shared/helpers/DeploymentConfig.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const configSrc = [
            `import path from 'path';`,
            `import {parsePort} from '../shared/helpers/EnvConfig.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const root = buildServerSandbox({
            sandboxName     : 'ac2-warn',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('warn');
        expect(action.drift.hasDrift).toBe(true);
        expect(action.drift.missingImports).toContain('../shared/helpers/DeploymentConfig.mjs');

        // Multi-line warning shape: header + per-item bullet + recovery prompt
        expect(logger.entries.warn.some(l => l.includes("Stale config.mjs for 'memory-core'"))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../shared/helpers/DeploymentConfig.mjs'))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('npm run prepare -- --migrate-config'))).toBe(true);

        // Did NOT overwrite
        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
    });

    test('AC3: drifting config.mjs with --migrate-config flag overwrites from template', async () => {
        const templateSrc = `import path from 'path';\nimport {resolveChromaHost} from './deploy.mjs';\nexport default {x: 1};\n`;
        const configSrc   = `import path from 'path';\nexport default {x: 1};\n`;

        const root = buildServerSandbox({
            sandboxName     : 'ac3-migrate',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs', '--migrate-config'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('migrate');
        expect(action.drift.hasDrift).toBe(true);

        // Was overwritten
        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(templateSrc);
        expect(logger.entries.log.some(l => l.includes('Migrating stale config'))).toBe(true);
    });

    test('AC4: current config.mjs (no drift) is silent — no log/warn output', async () => {
        const src = `import path from 'path';\nimport {resolveChromaHost} from './deploy.mjs';\nexport default {x: 1};\n`;

        const root = buildServerSandbox({
            sandboxName     : 'ac4-silent',
            templateContents: src,
            configContents  : src
        });

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('silent');
        // Only the top-level "Checking MCP Server configurations..." should be logged
        expect(logger.entries.log).toEqual(['[Neo AI] Checking MCP Server configurations...']);
        expect(logger.entries.warn).toEqual([]);
    });

    test('skip-no-template: server directory without config.template.mjs is skipped silently', async () => {
        const root = path.join(workRoot, 'no-template');
        fs.mkdirSync(path.join(root, 'memory-core'), {recursive: true});
        // Intentionally do NOT write a template

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('skip-no-template');
    });

    test('multi-line imports are correctly parsed (regex must span newlines)', async () => {
        const src = [
            `import path from 'path';`,
            ``,
            `import {`,
            `    parseBool,`,
            `    parseNumber,`,
            `    parsePort,`,
            `    parseUrl`,
            `} from '../shared/helpers/EnvConfig.mjs';`,
            ``,
            `import {fileURLToPath} from 'url';`,
            ``,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const filePath = path.join(workRoot, 'multiline.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.imports).toEqual([
            '../shared/helpers/EnvConfig.mjs',
            'path',
            'url'
        ]);
    });

    test('detectDrift returns one-way diff (template advanced, config behind)', () => {
        const templateShape = {
            imports: ['a', 'b', 'c'],
            exports: ['foo', 'bar']
        };
        const configShape = {
            imports: ['a'],
            exports: ['foo']
        };

        const drift = detectDrift(templateShape, configShape);
        expect(drift.hasDrift).toBe(true);
        expect(drift.missingImports.sort()).toEqual(['b', 'c']);
        expect(drift.missingExports).toEqual(['bar']);
    });

    test('detectDrift symmetric case: config has items NOT in template are NOT reported (one-way detector)', () => {
        // Operator-removed paths (in config, not in template) are intentionally ignored
        const templateShape = {imports: ['a'], exports: []};
        const configShape   = {imports: ['a', 'extra-operator-add'], exports: []};

        const drift = detectDrift(templateShape, configShape);
        expect(drift.hasDrift).toBe(false);
        expect(drift.missingImports).toEqual([]);
    });

    test('named exports projection: exports {a, b} blocks are extracted and trimmed', async () => {
        const src = `export {first, second, third} from './re-export.mjs';\nexport {only} from './another.mjs';\n`;
        const filePath = path.join(workRoot, 'exports.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.exports.sort()).toEqual(['first', 'only', 'second', 'third']);
    });
});
