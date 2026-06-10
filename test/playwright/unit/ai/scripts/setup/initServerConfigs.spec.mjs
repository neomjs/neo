import {setup} from '../../../../setup.mjs';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import fsExtra        from 'fs-extra';
import path           from 'path';

test.describe.configure({mode: 'serial'});

test.describe('initServerConfigs — template drift detection (#10815)', () => {
    let initConfigs, projectSourceShape, projectShape, detectDrift, materializeServerConfigTemplate, listServersWithTemplates, hasConfigTemplate;
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
        ({
            initConfigs,
            projectSourceShape,
            projectShape,
            detectDrift,
            materializeServerConfigTemplate,
            listServersWithTemplates,
            hasConfigTemplate
        } = await import('../../../../../../ai/scripts/setup/initServerConfigs.mjs'));

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

    test('server config clone materializes Tier-1 template import to operator overlay', async () => {
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: AiConfig.auth};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'materialized-tier1-import',
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
        expect(cloned).toBe(materializeServerConfigTemplate(templateSrc));
        expect(cloned).toContain(`from '../../../config.mjs'`);
        expect(cloned).not.toContain('config.template.mjs');
    });

    test('server config drift compares against materialized Tier-1 import', async () => {
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: AiConfig.auth};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'materialized-tier1-silent',
            templateContents: templateSrc,
            configContents  : materializeServerConfigTemplate(templateSrc)
        });

        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs'],
            logger,
            serversRoot: root
        });

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('silent');
        expect(logger.entries.warn).toEqual([]);
    });

    test('existing server config with stale Tier-1 template import warns without overwriting', async () => {
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: AiConfig.auth};`,
            ``
        ].join('\n');
        const configSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export const customKey = 'operator-preserved';`,
            `export default {auth: AiConfig.auth, customKey};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'stale-tier1-import-warn',
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
        expect(action.drift.missingImports).toEqual([
            '../../../config.mjs',
            '../../../config.mjs:default'
        ]);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../../../config.mjs'))).toBe(true);

        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
    });

    test('--migrate-config materializes stale Tier-1 import without dropping operator edits', async () => {
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: AiConfig.auth};`,
            ``
        ].join('\n');
        const configSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export const customKey = 'operator-preserved';`,
            `export default {auth: AiConfig.auth, customKey};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'stale-tier1-import-migrate',
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
        expect(action.migration).toBe('materialize-import-only');
        expect(logger.entries.log.some(l => l.includes('preserving operator edits'))).toBe(true);

        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(materializeServerConfigTemplate(configSrc));
        expect(onDisk).toContain(`from '../../../config.mjs'`);
        expect(onDisk).toContain(`customKey = 'operator-preserved'`);
        expect(onDisk).not.toContain('config.template.mjs');
    });

    test('AC2: drifting config.mjs without --migrate-config emits warning, does not overwrite', async () => {
        const templateSrc = [
            `import path from 'path';`,
            `import {parsePort, parseUrl} from '../../../../src/util/Env.mjs';`,
            `import {resolveChromaHost} from '../shared/helpers/deploymentConfig.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const configSrc = [
            `import path from 'path';`,
            `import {parsePort} from '../../../../src/util/Env.mjs';`,
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
        expect(action.drift.missingImports).toContain('../shared/helpers/deploymentConfig.mjs');
        // Same-source named-specifier drift: template added `parseUrl` to the existing
        // Env.mjs import block; even though the source path is shared, the
        // specifier-level projection must catch this.
        expect(action.drift.missingImports).toContain('../../../../src/util/Env.mjs:parseUrl');
        expect(action.drift.missingImports).toContain('../shared/helpers/deploymentConfig.mjs:resolveChromaHost');

        // Multi-line warning shape: header + per-item bullet + recovery prompt
        expect(logger.entries.warn.some(l => l.includes("Stale config.mjs for 'memory-core'"))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../shared/helpers/deploymentConfig.mjs'))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../../../../src/util/Env.mjs:parseUrl'))).toBe(true);
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

    test('same-source named import drift detected: template adds specifier to existing import block', async () => {
        // Empirical regression guard against the dominant config-template evolution mode
        // (e.g., a template adding `parseUrl` to an existing Env.mjs import block).
        // Source path is unchanged, so source-path projection alone wouldn't catch it.
        const templateSrc = [
            `import path from 'path';`,
            `import {parsePort, parseUrl, parseBool, parseNumber} from '../../../../src/util/Env.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const configSrc = [
            `import path from 'path';`,
            `import {parsePort, parseBool} from '../../../../src/util/Env.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const root = buildServerSandbox({
            sandboxName     : 'same-source-drift',
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

        // The two missing specifiers should be reported; both shared-source AND
        // shared-source:specifier entries are detected by the projection.
        expect(action.drift.missingImports).toEqual(
            expect.arrayContaining([
                '../../../../src/util/Env.mjs:parseUrl',
                '../../../../src/util/Env.mjs:parseNumber'
            ])
        );

        // The whole-import source path is NOT missing (both files import from it),
        // so it should NOT appear in missingImports — the value-add of specifier-level
        // drift detection is exactly that we don't need the whole-import to be missing.
        expect(action.drift.missingImports).not.toContain('../../../../src/util/Env.mjs');
    });

    test('aliased named imports normalize to the imported (left-side) name', async () => {
        // `import {parsePort as foo, parseBool} from '...'` projects as `:parsePort` + `:parseBool`,
        // not the local alias `:foo`. Ensures shape comparison is stable across
        // operator local-aliasing variations.
        const src = `import {parsePort as foo, parseBool} from '../../../../src/util/Env.mjs';\n`;
        const filePath = path.join(workRoot, 'aliased.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                '../../../../src/util/Env.mjs',
                '../../../../src/util/Env.mjs:parsePort',
                '../../../../src/util/Env.mjs:parseBool'
            ])
        );
        expect(shape.imports).not.toContain('../../../../src/util/Env.mjs:foo');
    });

    test('default + namespace imports projected with reserved suffixes (`:default`, `:*`)', async () => {
        const src = [
            `import path from 'path';`,
            `import * as os from 'os';`,
            `import fsExtra, {readFile, writeFile} from 'fs-extra';`,
            ``
        ].join('\n');

        const filePath = path.join(workRoot, 'default-and-namespace.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                'path',
                'path:default',
                'os',
                'os:*',
                'fs-extra',
                'fs-extra:default',
                'fs-extra:readFile',
                'fs-extra:writeFile'
            ])
        );
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
            `} from '../../../../src/util/Env.mjs';`,
            ``,
            `import {fileURLToPath} from 'url';`,
            ``,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const filePath = path.join(workRoot, 'multiline.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        // Source-path entries (whole-import drift surface)
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                '../../../../src/util/Env.mjs',
                'path',
                'url'
            ])
        );
        // Named-specifier entries from the multi-line block (same-source drift surface)
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                '../../../../src/util/Env.mjs:parseBool',
                '../../../../src/util/Env.mjs:parseNumber',
                '../../../../src/util/Env.mjs:parsePort',
                '../../../../src/util/Env.mjs:parseUrl',
                'path:default',
                'url:fileURLToPath'
            ])
        );
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

    test('env-var projection: leaf() UPPER_SNAKE env literals are projected, defaults/types are not (#12378)', async () => {
        const src = [
            `import {parsePort} from '../../../../src/util/Env.mjs';`,
            `export default {auth: {`,
            `    mode: leaf('oidc', 'NEO_AUTH_MODE', 'string'),`,
            `    port: leaf(8080, 'NEO_AUTH_PORT', 'port'),`,
            `    base: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string')`,
            `}};`,
            ``
        ].join('\n');
        const filePath = path.join(workRoot, 'envvars.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.envVars).toEqual(['NEO_AUTH_GITLAB_API_BASE_URL', 'NEO_AUTH_MODE', 'NEO_AUTH_PORT']);
        // Lowercase default values + type tokens must NOT be mistaken for env vars.
        expect(shape.envVars).not.toContain('oidc');
        expect(shape.envVars).not.toContain('string');
    });

    test('leaf-default projection captures env-bound AiConfig defaults (#12767)', () => {
        const src = [
            `export default {`,
            `    modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),`,
            `    host         : leaf(path.resolve(neoRootDir, '.neo-ai-data/backups'), 'NEO_BACKUP_PATH', 'string'),`,
            `    modelName    : leaf('gemini-3.5-flash')`,
            `};`,
            ``
        ].join('\n');

        const shape = projectSourceShape(src);

        expect(shape.leafDefaults).toEqual([
            {
                key    : 'host',
                env    : 'NEO_BACKUP_PATH',
                type   : 'string',
                default: `path.resolve(neoRootDir, '.neo-ai-data/backups')`
            },
            {
                key    : 'modelProvider',
                env    : 'NEO_MODEL_PROVIDER',
                type   : 'string',
                default: `'openAiCompatible'`
            }
        ]);
    });

    test('detectDrift reports same-env leaf default changes (#12767)', () => {
        const templateShape = projectSourceShape([
            `export default {`,
            `    modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string')`,
            `};`,
            ``
        ].join('\n'));
        const configShape = projectSourceShape([
            `export default {`,
            `    modelProvider: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string')`,
            `};`,
            ``
        ].join('\n'));

        const drift = detectDrift(templateShape, configShape);

        expect(drift.hasDrift).toBe(true);
        expect(drift.missingImports).toEqual([]);
        expect(drift.missingExports).toEqual([]);
        expect(drift.missingEnvVars).toEqual([]);
        expect(drift.changedLeafDefaults).toEqual([{
            key            : 'modelProvider',
            env            : 'NEO_MODEL_PROVIDER',
            type           : 'string',
            templateDefault: `'openAiCompatible'`,
            configDefault  : `'gemini'`
        }]);
    });

    test('same-env leaf default drift warns without overwriting (#12767)', async () => {
        const templateSrc = [
            `export default {`,
            `    modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string')`,
            `};`,
            ``
        ].join('\n');
        const configSrc = [
            `export default {`,
            `    modelProvider: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string')`,
            `};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'leaf-default-drift-warn',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({argv: ['node', 'initServerConfigs.mjs'], logger, serversRoot: root});

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('warn');
        expect(action.drift.changedLeafDefaults).toEqual([{
            key            : 'modelProvider',
            env            : 'NEO_MODEL_PROVIDER',
            type           : 'string',
            templateDefault: `'openAiCompatible'`,
            configDefault  : `'gemini'`
        }]);
        expect(logger.entries.warn.some(l => l.includes("+ leaf-default: modelProvider (NEO_MODEL_PROVIDER, string): 'gemini' -> 'openAiCompatible'"))).toBe(true);
        expect(fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8')).toBe(configSrc);
    });

    test('detectDrift reports a new env-bound leaf as missingEnvVars (data-tree drift the import projection misses)', () => {
        const templateShape = {imports: ['a'], exports: [], envVars: ['NEO_AUTH_HOST', 'NEO_AUTH_MODE']};
        const configShape   = {imports: ['a'], exports: [], envVars: ['NEO_AUTH_HOST']};

        const drift = detectDrift(templateShape, configShape);
        expect(drift.hasDrift).toBe(true);
        expect(drift.missingEnvVars).toEqual(['NEO_AUTH_MODE']);
        expect(drift.missingImports).toEqual([]);
        expect(drift.missingExports).toEqual([]);
    });

    test('a template that adds an env-bound config leaf warns the existing config (env drift)', async () => {
        // Identical imports/exports — only a NEW leaf carrying NEO_AUTH_MODE is added. The
        // import/export projection alone is blind to this; env-var projection catches it.
        const templateSrc = [
            `import {parsePort} from '../../../../src/util/Env.mjs';`,
            `export default {auth: {host: leaf(null, 'NEO_AUTH_HOST', 'string'), mode: leaf('oidc', 'NEO_AUTH_MODE', 'string')}};`,
            ``
        ].join('\n');
        const configSrc = [
            `import {parsePort} from '../../../../src/util/Env.mjs';`,
            `export default {auth: {host: leaf(null, 'NEO_AUTH_HOST', 'string')}};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'env-leaf-drift-warn',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({argv: ['node', 'initServerConfigs.mjs'], logger, serversRoot: root});

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('warn');
        expect(action.drift.missingEnvVars).toEqual(['NEO_AUTH_MODE']);
        expect(logger.entries.warn.some(l => l.includes('+ env: NEO_AUTH_MODE'))).toBe(true);
        // warn mode must not overwrite the operator config
        expect(fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8')).toBe(configSrc);
    });

    test('env-leaf drift forces a full migrate (NOT the materialize-only fast path)', async () => {
        // A config that BOTH still imports the Tier-1 TEMPLATE (materialization drift) AND lacks a
        // new env leaf must take the full template refresh — the import-only fast path would leave
        // the new leaf behind.
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: {host: leaf(null, 'NEO_AUTH_HOST', 'string'), mode: leaf('oidc', 'NEO_AUTH_MODE', 'string')}};`,
            ``
        ].join('\n');
        const configSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: {host: leaf(null, 'NEO_AUTH_HOST', 'string')}};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'env-leaf-drift-migrate',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({argv: ['node', 'initServerConfigs.mjs', '--migrate-config'], logger, serversRoot: root});

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('migrate');
        expect(action.migration).toBeUndefined();   // NOT 'materialize-import-only'

        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(materializeServerConfigTemplate(templateSrc));
        expect(onDisk).toContain('NEO_AUTH_MODE');
    });

    test.describe('listServersWithTemplates / hasConfigTemplate (shared enumeration)', () => {
        function buildMultiServerRoot(sandboxName, serverSpec) {
            const root = path.join(workRoot, sandboxName);
            fs.mkdirSync(root, {recursive: true});
            for (const [name, kind] of Object.entries(serverSpec)) {
                fs.mkdirSync(path.join(root, name), {recursive: true});
                if (kind === 'template') {
                    fs.writeFileSync(path.join(root, name, 'config.template.mjs'), 'export default {};\n');
                }
            }
            return root;
        }

        test('lists only directories shipping a config.template.mjs, sorted', () => {
            const root = buildMultiServerRoot('lswt-basic', {
                'memory-core'    : 'template',
                'github-workflow': 'template',
                'file-system'    : 'no-template'
            });
            // A stray non-directory file in the servers root must be ignored.
            fs.writeFileSync(path.join(root, 'README.md'), '# not a server\n');

            expect(listServersWithTemplates(root)).toEqual(['github-workflow', 'memory-core']);
        });

        test('returns [] for a non-existent serversRoot (no throw)', () => {
            expect(listServersWithTemplates(path.join(workRoot, 'lswt-missing'))).toEqual([]);
        });

        test('hasConfigTemplate is true only when config.template.mjs is present', () => {
            const root = buildMultiServerRoot('hct', {
                'with-template': 'template',
                'no-template'  : 'no-template'
            });

            expect(hasConfigTemplate(path.join(root, 'with-template'))).toBe(true);
            expect(hasConfigTemplate(path.join(root, 'no-template'))).toBe(false);
        });
    });
});
