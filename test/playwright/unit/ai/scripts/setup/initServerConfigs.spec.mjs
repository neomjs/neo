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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import fsExtra         from 'fs-extra';
import path            from 'path';

test.describe.configure({mode: 'serial'});

test.describe('initServerConfigs — template drift detection (#10815)', () => {
    let initConfigs, projectSourceShape, projectShape, projectConfigDefaultsShape, detectDrift,
        detectServerOverlayDrift, materializeServerConfigTemplate, listServersWithTemplates,
        hasConfigTemplate, collectStaleOverlayFindings, formatStaleOverlayDriftItems,
        createConfigInitializationOutcome;
    let workRoot;

    function recordingLogger() {
        const log   = [];
        const warn  = [];
        const error = [];
        return {
            log    : (...args) => log.push(args.join(' ')),
            warn   : (...args) => warn.push(args.join(' ')),
            error  : (...args) => error.push(args.join(' ')),
            entries: {log, warn, error}
        }
    }

    function buildServerSandbox({sandboxName, templateContents, baseContents, configContents}) {
        const root = path.join(workRoot, sandboxName);
        fs.mkdirSync(root, {recursive: true});

        const serverDir = path.join(root, 'memory-core');
        fs.mkdirSync(serverDir, {recursive: true});

        if (templateContents !== undefined) {
            fs.writeFileSync(path.join(serverDir, 'config.template.mjs'), templateContents);
        }
        if (baseContents !== undefined) {
            fs.writeFileSync(path.join(serverDir, 'configBase.mjs'), baseContents);
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
            projectConfigDefaultsShape,
            detectDrift,
            detectServerOverlayDrift,
            materializeServerConfigTemplate,
            listServersWithTemplates,
            hasConfigTemplate,
            collectStaleOverlayFindings,
            formatStaleOverlayDriftItems,
            createConfigInitializationOutcome
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
        const root        = buildServerSandbox({
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
            `import {parsePort, parseUrl} from '../../../Env.mjs';`,
            `import {resolveChromaHost} from '../shared/helpers/deploymentConfig.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const configSrc = [
            `import path from 'path';`,
            `import {parsePort} from '../../../Env.mjs';`,
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
        expect(action.drift.missingImports).toContain('../../../Env.mjs:parseUrl');
        expect(action.drift.missingImports).toContain('../shared/helpers/deploymentConfig.mjs:resolveChromaHost');

        // Multi-line warning shape: header + per-item bullet + recovery prompt
        expect(logger.entries.warn.some(l => l.includes("Stale config.mjs for 'memory-core'"))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../shared/helpers/deploymentConfig.mjs'))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('+ import: ../../../Env.mjs:parseUrl'))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('Preview the declaration-level conversion'))).toBe(true);
        expect(logger.entries.warn.some(l => l.includes('--migrate-config') && l.includes('fail-closed'))).toBe(true);

        // Did NOT overwrite
        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
    });

    test('AC3: broad drift under --migrate-config writes nothing and returns operator-conversion-required', async () => {
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
        expect(action.action).toBe('migration-required');
        expect(action.migration).toBe('operator-conversion-required');
        expect(action.drift.hasDrift).toBe(true);
        expect(action.command).toContain('--config-root');
        expect(action.writeCommand).toContain('--write');
        expect(result.migrationRequired).toEqual([action]);

        // The operator overlay is the data at risk: unattended setup must not replace one byte.
        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
        expect(logger.entries.warn.some(l => l.includes('Refusing unattended rewrite'))).toBe(true);
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
            `import {parsePort, parseUrl, parseBool, parseNumber} from '../../../Env.mjs';`,
            `export default {x: 1};`,
            ``
        ].join('\n');

        const configSrc = [
            `import path from 'path';`,
            `import {parsePort, parseBool} from '../../../Env.mjs';`,
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
                '../../../Env.mjs:parseUrl',
                '../../../Env.mjs:parseNumber'
            ])
        );

        // The whole-import source path is NOT missing (both files import from it),
        // so it should NOT appear in missingImports — the value-add of specifier-level
        // drift detection is exactly that we don't need the whole-import to be missing.
        expect(action.drift.missingImports).not.toContain('../../../Env.mjs');
    });

    test('aliased named imports normalize to the imported (left-side) name', async () => {
        // `import {parsePort as foo, parseBool} from '...'` projects as `:parsePort` + `:parseBool`,
        // not the local alias `:foo`. Ensures shape comparison is stable across
        // operator local-aliasing variations.
        const src      = `import {parsePort as foo, parseBool} from '../../../Env.mjs';\n`;
        const filePath = path.join(workRoot, 'aliased.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                '../../../Env.mjs',
                '../../../Env.mjs:parsePort',
                '../../../Env.mjs:parseBool'
            ])
        );
        expect(shape.imports).not.toContain('../../../Env.mjs:foo');
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
            `} from '../../../Env.mjs';`,
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
                '../../../Env.mjs',
                'path',
                'url'
            ])
        );
        // Named-specifier entries from the multi-line block (same-source drift surface)
        expect(shape.imports).toEqual(
            expect.arrayContaining([
                '../../../Env.mjs:parseBool',
                '../../../Env.mjs:parseNumber',
                '../../../Env.mjs:parsePort',
                '../../../Env.mjs:parseUrl',
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
        const src      = `export {first, second, third} from './re-export.mjs';\nexport {only} from './another.mjs';\n`;
        const filePath = path.join(workRoot, 'exports.mjs');
        fs.writeFileSync(filePath, src);

        const shape = await projectShape(filePath);
        expect(shape.exports.sort()).toEqual(['first', 'only', 'second', 'third']);
    });

    test('env-var projection: leaf() UPPER_SNAKE env literals are projected, defaults/types are not (#12378)', async () => {
        const src = [
            `import {parsePort} from '../../../Env.mjs';`,
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

    test('requiredness projection captures fourth-argument leaf contracts (#13432)', () => {
        const src = [
            `export default {auth: {`,
            `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {`,
            `        requiredFor: [{entrypoints: '*', modes: ['gitlab-pat'], consumerClaims: ['readiness']}]`,
            `    }),`,
            `    mode: leaf('oidc', 'NEO_AUTH_MODE', 'string')`,
            `}};`,
            ``
        ].join('\n');

        const shape = projectSourceShape(src);

        expect(shape.requiredLeaves).toEqual([
            `gitlabApiBaseUrl (NEO_AUTH_GITLAB_API_BASE_URL, string): { requiredFor: [{entrypoints: '*', modes: ['gitlab-pat'], consumerClaims: ['readiness']}] }`
        ]);
    });

    test('bare side-effect imports are tracked so a missing participation import is drift (#14499)', () => {
        // A server config participates in the Tier-1 hierarchy by loading the realm root via a bare
        // side-effect import (`import '../../../config.mjs';`). The detector MUST see it — else a template
        // that ADDS participation is invisible drift and the overlay boots non-participating — getParent()
        // has no root, so `auth.*` is unresolvable.
        const templateShape = projectSourceShape(`import '../../../config.mjs';\nimport os from 'os';\nexport default {};\n`);
        const configShape   = projectSourceShape(`import os from 'os';\nexport default {};\n`);

        expect(templateShape.imports).toContain('../../../config.mjs');
        expect(detectDrift(templateShape, configShape).missingImports).toContain('../../../config.mjs');
    });

    test('a bare side-effect import does NOT swallow the following import default (#15387)', () => {
        // Regression: the extractor's line-spanning body bridged the bare `import '../../../config.mjs';`
        // (no `from`) into the NEXT import's `from`, dropping that import's `:default`. Real server
        // config.mjs begins with the bare Tier-1 import immediately above `import os from 'os'`, so
        // `os:default` was falsely reported missing → assertConfigFresh crashed every harness at boot.
        const shape = projectSourceShape(`import '../../../config.mjs';\nimport os from 'os';\nimport path from 'path';\nexport default {};\n`);

        expect(shape.imports).toContain('../../../config.mjs'); // the bare participation import is still tracked
        expect(shape.imports).toContain('os:default');          // ...without eating the next import's default binding
        expect(shape.imports).toContain('path:default');
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

    test('formatStaleOverlayDriftItems names exact missing and conflicting leaves (#14675)', () => {
        expect(formatStaleOverlayDriftItems({
            missingImports       : ['../shared/newImport.mjs:newHelper'],
            missingExports       : ['exportedHelper'],
            missingEnvVars       : ['NEO_AUTH_MODE'],
            missingRequiredLeaves: ['gitlabApiBaseUrl (NEO_AUTH_GITLAB_API_BASE_URL, string): {requiredFor: []}'],
            changedLeafDefaults  : [{
                key            : 'modelProvider',
                env            : 'NEO_MODEL_PROVIDER',
                type           : 'string',
                configDefault  : `'gemini'`,
                templateDefault: `'openAiCompatible'`
            }]
        })).toEqual([
            'import: ../shared/newImport.mjs:newHelper',
            'export: exportedHelper',
            'env: NEO_AUTH_MODE',
            'required-leaf: gitlabApiBaseUrl (NEO_AUTH_GITLAB_API_BASE_URL, string): {requiredFor: []}',
            "leaf-default: modelProvider (NEO_MODEL_PROVIDER, string): 'gemini' -> 'openAiCompatible'"
        ])
    });

    test('collectStaleOverlayFindings returns read-only advisory findings for Tier-1 and server overlays (#14675)', () => {
        const root        = path.join(workRoot, 'collect-stale-overlay');
        const aiRoot      = path.join(root, 'ai');
        const serversRoot = path.join(root, 'server');
        const serverRoot  = path.join(serversRoot, 'memory-core');

        fs.mkdirSync(aiRoot, {recursive: true});
        fs.mkdirSync(serverRoot, {recursive: true});

        const tier1Template = [
            `export default {auth: {`,
            `    mode: leaf('oidc', 'NEO_AUTH_MODE', 'string'),`,
            `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {requiredFor: [{modes: ['gitlab-pat']}]})`,
            `}};`,
            ``
        ].join('\n');
        const tier1Config = [
            `export default {auth: {`,
            `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string')`,
            `}};`,
            ``
        ].join('\n');
        const serverTemplate = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {model: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string')};`,
            ``
        ].join('\n');
        const serverConfig = [
            `import AiConfig from '../../../config.mjs';`,
            `export default {model: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string')};`,
            ``
        ].join('\n');

        fs.writeFileSync(path.join(aiRoot, 'config.template.mjs'), tier1Template);
        fs.writeFileSync(path.join(aiRoot, 'config.mjs'), tier1Config);
        fs.writeFileSync(path.join(serverRoot, 'config.template.mjs'), serverTemplate);
        fs.writeFileSync(path.join(serverRoot, 'config.mjs'), serverConfig);

        const findings = collectStaleOverlayFindings({aiRoot, serversRoot});

        expect(findings.map(finding => finding.label)).toEqual([
            'Tier-1 ai/config.mjs',
            'memory-core/config.mjs'
        ]);
        expect(findings[0].items).toEqual(expect.arrayContaining([
            'env: NEO_AUTH_MODE',
            expect.stringContaining('required-leaf: gitlabApiBaseUrl')
        ]));
        expect(findings[1].items).toEqual([
            "leaf-default: model (NEO_MODEL_PROVIDER, string): 'gemini' -> 'openAiCompatible'"
        ]);
        expect(fs.readFileSync(path.join(aiRoot, 'config.mjs'), 'utf-8')).toBe(tier1Config);
        expect(fs.readFileSync(path.join(serverRoot, 'config.mjs'), 'utf-8')).toBe(serverConfig);
    });

    test('collectStaleOverlayFindings limits subclass overlays to residual conflicts (#14675)', () => {
        const root   = path.join(workRoot, 'collect-subclass-overlay');
        const aiRoot = path.join(root, 'ai');

        fs.mkdirSync(aiRoot, {recursive: true});

        // The overlay must carry the CANONICAL `extends ConfigBase` shape — the production
        // discriminator (`isSubclassOverlaySource`) deliberately matches only that class name, so a
        // non-canonical fixture name routes to full-snapshot diffing and fabricates env drift.
        const templateSrc = [
            `export class ConfigBase {`,
            `    static config = {data: {`,
            `        modelProvider: leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string'),`,
            `        timeout      : leaf(1000, 'NEO_TIMEOUT', 'number')`,
            `    }}`,
            `}`,
            `export default ConfigBase;`,
            ``
        ].join('\n');
        const subclassOverlaySrc = [
            `import {ConfigBase} from './config.template.mjs';`,
            `class AiConfig extends ConfigBase {`,
            `    static config = {data: {`,
            `        modelProvider: leaf('gemini', 'NEO_MODEL_PROVIDER', 'string')`,
            `    }}`,
            `}`,
            `export default AiConfig;`,
            ``
        ].join('\n');

        fs.writeFileSync(path.join(aiRoot, 'config.template.mjs'), templateSrc);
        fs.writeFileSync(path.join(aiRoot, 'config.mjs'), subclassOverlaySrc);

        const findings = collectStaleOverlayFindings({
            aiRoot,
            serversRoot: path.join(root, 'missing-servers')
        });

        expect(findings).toHaveLength(1);
        expect(findings[0].label).toBe('Tier-1 ai/config.mjs');
        expect(findings[0].items).toEqual([
            "leaf-default: modelProvider (NEO_MODEL_PROVIDER, string): 'gemini' -> 'openAiCompatible'"
        ]);
        expect(findings[0].items.some(item => item.includes('NEO_TIMEOUT'))).toBe(false);
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

    test('detectDrift reports missing requiredness metadata for an existing env leaf (#13432)', () => {
        const templateShape = projectSourceShape([
            `export default {auth: {`,
            `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {requiredFor: [{modes: ['gitlab-pat']}]})`,
            `}};`,
            ``
        ].join('\n'));
        const configShape = projectSourceShape([
            `export default {auth: {`,
            `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string')`,
            `}};`,
            ``
        ].join('\n'));

        const drift = detectDrift(templateShape, configShape);

        expect(drift.hasDrift).toBe(true);
        expect(drift.missingImports).toEqual([]);
        expect(drift.missingExports).toEqual([]);
        expect(drift.missingEnvVars).toEqual([]);
        expect(drift.changedLeafDefaults).toEqual([]);
        expect(drift.missingRequiredLeaves).toEqual([
            `gitlabApiBaseUrl (NEO_AUTH_GITLAB_API_BASE_URL, string): {requiredFor: [{modes: ['gitlab-pat']}]}`
        ]);
    });

    test('a template that adds an env-bound config leaf warns the existing config (env drift)', async () => {
        // Identical imports/exports — only a NEW leaf carrying NEO_AUTH_MODE is added. The
        // import/export projection alone is blind to this; env-var projection catches it.
        const templateSrc = [
            `import {parsePort} from '../../../Env.mjs';`,
            `export default {auth: {host: leaf(null, 'NEO_AUTH_HOST', 'string'), mode: leaf('oidc', 'NEO_AUTH_MODE', 'string')}};`,
            ``
        ].join('\n');
        const configSrc = [
            `import {parsePort} from '../../../Env.mjs';`,
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

    test('env-leaf drift returns migration-required and preserves the snapshot (NOT the import-only fast path)', async () => {
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
        expect(action.action).toBe('migration-required');
        expect(action.migration).toBe('operator-conversion-required');

        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
        expect(onDisk).not.toContain('NEO_AUTH_MODE');
    });

    test('requiredness metadata drift returns migration-required and preserves the snapshot', async () => {
        const templateSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: {gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {requiredFor: [{modes: ['gitlab-pat']}]})}};`,
            ``
        ].join('\n');
        const configSrc = [
            `import AiConfig from '../../../config.template.mjs';`,
            `export default {auth: {gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string')}};`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'requiredness-drift-migrate',
            templateContents: templateSrc,
            configContents  : configSrc
        });

        const logger = recordingLogger();
        const result = await initConfigs({argv: ['node', 'initServerConfigs.mjs', '--migrate-config'], logger, serversRoot: root});

        const action = result.processed.find(p => p.serverName === 'memory-core');
        expect(action.action).toBe('migration-required');
        expect(action.migration).toBe('operator-conversion-required');

        const onDisk = fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8');
        expect(onDisk).toBe(configSrc);
        expect(onDisk).not.toContain('requiredFor');
    });

    test('every discovered production server ships an adjacent base plus a Tier-1-first thin template', () => {
        const realServersRoot = path.resolve(process.cwd(), 'ai', 'mcp', 'server');
        const discovered      = listServersWithTemplates(realServersRoot);

        expect(discovered).toEqual([
            'github-workflow',
            'gitlab-workflow',
            'knowledge-base',
            'memory-core',
            'neural-link'
        ]);

        for (const serverName of discovered) {
            const serverRoot  = path.join(realServersRoot, serverName);
            const templateSrc = fs.readFileSync(path.join(serverRoot, 'config.template.mjs'), 'utf-8');
            const baseSrc     = fs.readFileSync(path.join(serverRoot, 'configBase.mjs'), 'utf-8');
            const imports     = templateSrc.match(/^import .*$/gm) || [];

            expect(imports[0]).toContain("../../../config.template.mjs");
            expect(templateSrc).toContain('extends ConfigBase');
            expect(templateSrc).not.toContain('leaf(');
            expect(baseSrc).toContain('class ConfigBase extends ConfigProvider');
            expect(baseSrc).not.toContain('createConfigProxy(Neo.setupClass(ConfigBase))');
        }
    });

    test('Memory Core defaults own the exact three regression leaves; a thin subclass inherits them without drift', async () => {
        const
            serverRoot            = path.resolve(process.cwd(), 'ai', 'mcp', 'server', 'memory-core'),
            templateSrc           = fs.readFileSync(path.join(serverRoot, 'config.template.mjs'), 'utf-8'),
            defaultsShape         = await projectConfigDefaultsShape(serverRoot, {materialize: materializeServerConfigTemplate}),
            activeSrc             = materializeServerConfigTemplate(templateSrc),
            {drift, overlayShape} = detectServerOverlayDrift(activeSrc, defaultsShape, templateSrc);

        expect(defaultsShape.envVars).toEqual(expect.arrayContaining([
            'NEO_LANE_LANDSCAPE_CENSUS_PAGE_LIMIT',
            'NEO_LANE_LANDSCAPE_CENSUS_MAX_PAGES',
            'NEO_LANE_LANDSCAPE_RELATION_EDGE_LIMIT'
        ]));
        expect(projectSourceShape(templateSrc).envVars).toEqual([]);
        expect(overlayShape).toBe('subclass');
        expect(drift.hasDrift).toBe(false);
    });

    test('server snapshot overlays receive full base drift while subclass overlays inherit the base', () => {
        const baseSrc = [
            `class ConfigBase extends ConfigProvider {`,
            `    static config = {data: {`,
            `        existing: leaf(true, 'NEO_EXISTING', 'boolean'),`,
            `        added   : leaf(5, 'NEO_ADDED', 'number')`,
            `    }}`,
            `}`,
            `export default Neo.setupClass(ConfigBase);`,
            ``
        ].join('\n');
        const templateSrc = [
            `import '../../../config.template.mjs';`,
            `import ConfigBase from './configBase.mjs';`,
            `import {createConfigProxy} from '../../../ConfigProvider.mjs';`,
            `class Config extends ConfigBase {`,
            `    static config = {className: 'Neo.ai.mcp.server.memory-core.Config', singleton: true}`,
            `}`,
            `export default createConfigProxy(Neo.setupClass(Config));`,
            ``
        ].join('\n');
        const snapshotSrc = [
            `import '../../../config.mjs';`,
            `class Config extends ConfigProvider {`,
            `    static config = {data: {existing: leaf(true, 'NEO_EXISTING', 'boolean')}}`,
            `}`,
            `export default Neo.setupClass(Config);`,
            ``
        ].join('\n');
        const defaultsShape = projectSourceShape(baseSrc);
        const snapshot      = detectServerOverlayDrift(snapshotSrc, defaultsShape, templateSrc);
        const subclass      = detectServerOverlayDrift(materializeServerConfigTemplate(templateSrc), defaultsShape, templateSrc);

        expect(snapshot.overlayShape).toBe('snapshot');
        expect(snapshot.drift.missingEnvVars).toEqual(['NEO_ADDED']);
        expect(snapshot.drift.hasDrift).toBe(true);
        expect(subclass.overlayShape).toBe('subclass');
        expect(subclass.drift.hasDrift).toBe(false);
    });

    test('a non-zero per-server delta subclass is current and --migrate-config never routes it back to conversion', async () => {
        const baseSrc = [
            `class ConfigBase extends ConfigProvider {`,
            `    static config = {data: {`,
            `        existing: leaf(true, 'NEO_EXISTING', 'boolean'),`,
            `        added   : leaf(5, 'NEO_ADDED', 'number')`,
            `    }}`,
            `}`,
            `export default Neo.setupClass(ConfigBase);`,
            ``
        ].join('\n');
        const templateSrc = [
            `import '../../../config.template.mjs';`,
            `import ConfigBase from './configBase.mjs';`,
            `import {createConfigProxy} from '../../../ConfigProvider.mjs';`,
            `class Config extends ConfigBase {`,
            `    static config = {className: 'Neo.ai.mcp.server.memory-core.Config', singleton: true}`,
            `}`,
            `export default createConfigProxy(Neo.setupClass(Config));`,
            ``
        ].join('\n');
        const deltaSrc = [
            `import '../../../config.mjs';`,
            `import ConfigBase from './configBase.mjs';`,
            `import {createConfigProxy, leaf} from '../../../ConfigProvider.mjs';`,
            `class Config extends ConfigBase {`,
            `    static config = {`,
            `        className: 'Neo.ai.mcp.server.memory-core.Config',`,
            `        singleton: true,`,
            `        data: {existing: leaf(false, 'NEO_EXISTING', 'boolean')}`,
            `    }`,
            `}`,
            `export default createConfigProxy(Neo.setupClass(Config));`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'current-nonzero-delta',
            templateContents: templateSrc,
            baseContents    : baseSrc,
            configContents  : deltaSrc
        });
        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs', '--migrate-config'],
            logger,
            serversRoot: root
        });

        expect(result.processed).toEqual([
            {serverName: 'memory-core', action: 'silent', overlayShape: 'subclass'}
        ]);
        expect(result.migrationRequired).toEqual([]);
        expect(fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8')).toBe(deltaSrc);
        expect(logger.entries.warn).toEqual([]);
    });

    test('a drift-free legacy snapshot still becomes migration-required on the explicit transition path', async () => {
        const baseSrc = [
            `class ConfigBase extends ConfigProvider {`,
            `    static config = {data: {existing: leaf(true, 'NEO_EXISTING', 'boolean')}}`,
            `}`,
            `export default Neo.setupClass(ConfigBase);`,
            ``
        ].join('\n');
        const templateSrc = [
            `import '../../../config.template.mjs';`,
            `import ConfigBase from './configBase.mjs';`,
            `import {createConfigProxy} from '../../../ConfigProvider.mjs';`,
            `class Config extends ConfigBase {`,
            `    static config = {className: 'Neo.ai.mcp.server.memory-core.Config', singleton: true}`,
            `}`,
            `export default createConfigProxy(Neo.setupClass(Config));`,
            ``
        ].join('\n');
        const snapshotSrc = [
            `import '../../../config.mjs';`,
            `import ConfigProvider, {createConfigProxy, leaf} from '../../../ConfigProvider.mjs';`,
            `class Config extends ConfigProvider {`,
            `    static config = {`,
            `        className: 'Neo.ai.mcp.server.memory-core.Config',`,
            `        singleton: true,`,
            `        data: {existing: leaf(true, 'NEO_EXISTING', 'boolean')}`,
            `    }`,
            `}`,
            `export default createConfigProxy(Neo.setupClass(Config));`,
            ``
        ].join('\n');
        const root = buildServerSandbox({
            sandboxName     : 'drift-free-legacy-transition',
            templateContents: templateSrc,
            baseContents    : baseSrc,
            configContents  : snapshotSrc
        });
        const logger = recordingLogger();
        const result = await initConfigs({
            argv       : ['node', 'initServerConfigs.mjs', '--migrate-config'],
            logger,
            serversRoot: root
        });

        expect(result.processed[0]).toMatchObject({
            serverName  : 'memory-core',
            action      : 'migration-required',
            migration   : 'operator-conversion-required',
            overlayShape: 'snapshot'
        });
        expect(result.migrationRequired).toHaveLength(1);
        expect(fs.readFileSync(path.join(root, 'memory-core', 'config.mjs'), 'utf-8')).toBe(snapshotSrc);
    });

    test('child-process outcome exposes the stable typed code and affected server list', () => {
        expect(createConfigInitializationOutcome([])).toEqual({status: 'completed'});
        expect(createConfigInitializationOutcome([
            {serverName: 'memory-core'},
            {serverName: 'knowledge-base'}
        ])).toEqual({
            status    : 'migration-required',
            reasonCode: 'per-server-overlay-migration-required',
            servers   : ['memory-core', 'knowledge-base']
        });
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

test.describe('assertConfigFresh — boot freshness guard (#13560)', () => {
    let assertConfigFresh;
    let guardRoot;

    const recordingLogger = () => {
        const warn = [];
        return {warn: (...args) => warn.push(args.join(' ')), entries: {warn}};
    };

    // A Tier-1 sandbox: an aiRoot dir holding a config.template.mjs + config.mjs pair.
    const buildTier1 = ({name, templateContents, configContents}) => {
        const root = path.join(guardRoot, name);
        fs.mkdirSync(root, {recursive: true});
        if (templateContents !== undefined) fs.writeFileSync(path.join(root, 'config.template.mjs'), templateContents);
        if (configContents   !== undefined) fs.writeFileSync(path.join(root, 'config.mjs'), configContents);
        return root;
    };

    const callGuard = async opts => {
        let error = null;
        try { await assertConfigFresh({useConfigTemplates: false, ...opts}); } catch (e) { error = e; }
        return error;
    };

    test.beforeAll(async () => {
        ({assertConfigFresh} = await import('../../../../../../ai/scripts/setup/initServerConfigs.mjs'));
        guardRoot = path.resolve(process.cwd(), 'tmp', `assert-config-fresh-${process.pid}-${Date.now()}`);
        fs.mkdirSync(guardRoot, {recursive: true});
    });

    test.afterAll(() => {
        if (guardRoot && fs.existsSync(guardRoot)) fs.rmSync(guardRoot, {recursive: true, force: true});
    });

    // The template adds an env-bound leaf; a stale overlay missing it is the crash-causing class.
    const TEMPLATE_WITH_LEAF          = `export default {section: {enabled: leaf(true, 'NEO_SECTION_ENABLED', 'bool')}};\n`;
    const TEMPLATE_WITH_REQUIRED_LEAF = [
        `export default {auth: {`,
        `    gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string', {requiredFor: [{modes: ['gitlab-pat']}]})`,
        `}};`,
        ``
    ].join('\n');

    test('fails fast (throws) when the overlay is missing a leaf the template added', async () => {
        const root  = buildTier1({name: 'stale', templateContents: TEMPLATE_WITH_LEAF, configContents: 'export default {};\n'});
        const error = await callGuard({aiRoot: root, logger: recordingLogger()});

        expect(error).not.toBeNull();
        expect(error.message).toMatch(/Stale config overlay/);
        expect(error.message).toContain('NEO_SECTION_ENABLED'); // names the missing leaf
        expect(error.message).toContain('--migrate-config');     // names the fix
    });

    test('passes (no throw) when the overlay matches the template shape', async () => {
        const root  = buildTier1({name: 'fresh', templateContents: TEMPLATE_WITH_LEAF, configContents: TEMPLATE_WITH_LEAF});
        const error = await callGuard({aiRoot: root, logger: recordingLogger()});

        expect(error).toBeNull();
    });

    test('ignores a stale operator overlay when the committed template graph is active', async () => {
        const root  = buildTier1({name: 'template-only', templateContents: TEMPLATE_WITH_LEAF, configContents: 'export default {};\n'});
        const error = await callGuard({aiRoot: root, logger: recordingLogger(), useConfigTemplates: true});

        expect(error).toBeNull();
    });

    test('keeps required-env findings fatal when the committed template graph is active', async () => {
        const root = buildTier1({
            name            : 'template-only-required-env',
            templateContents: TEMPLATE_WITH_LEAF,
            configContents  : 'export default {};\n'
        });
        const error = await callGuard({
            aiRoot            : root,
            logger            : recordingLogger(),
            useConfigTemplates: true,
            requiredFindings  : [{
                consumerClaim: 'readiness',
                entrypoint   : 'memory-core-mcp',
                env          : 'NEO_REQUIRED_TEST_VALUE',
                leafPath     : 'test.requiredValue',
                mode         : 'test',
                valueState   : 'absent'
            }]
        });

        expect(error).not.toBeNull();
        expect(error.message).toContain('Required deployment configuration is missing or invalid');
    });

    test('benign drift (changed default only) warns but does NOT throw', async () => {
        const root = buildTier1({
            name            : 'benign',
            templateContents: `export default {model: leaf('a', 'NEO_MODEL', 'string')};\n`,
            configContents  : `export default {model: leaf('b', 'NEO_MODEL', 'string')};\n`
        });
        const logger = recordingLogger();
        const error  = await callGuard({aiRoot: root, logger});

        expect(error).toBeNull();
        expect(logger.entries.warn.some(w => w.includes('benign config drift'))).toBe(true);
    });

    test('fails fast when a stale overlay lacks requiredness metadata the template added', async () => {
        const root = buildTier1({
            name            : 'missing-requiredness',
            templateContents: TEMPLATE_WITH_REQUIRED_LEAF,
            configContents  : `export default {auth: {gitlabApiBaseUrl: leaf('https://gitlab.com', 'NEO_AUTH_GITLAB_API_BASE_URL', 'string')}};\n`
        });
        const error = await callGuard({aiRoot: root, logger: recordingLogger()});

        expect(error).not.toBeNull();
        expect(error.message).toMatch(/Stale config overlay/);
        expect(error.message).toContain('NEO_AUTH_GITLAB_API_BASE_URL');
        expect(error.message).toContain('requiredFor');
        expect(error.message).toContain('--migrate-config');
    });

    test('required-env findings are fatal for readiness-certifying guards (#13432)', async () => {
        const root = buildTier1({
            name            : 'required-env-finding',
            templateContents: TEMPLATE_WITH_LEAF,
            configContents  : TEMPLATE_WITH_LEAF
        });

        // The ENTRYPOINT computes findings by reading its config at its use site (config.validateRequiredEnv);
        // the guard is a non-entrypoint that never reads the SSOT — it throws on the injected value.
        const error = await callGuard({
            aiRoot          : root,
            logger          : recordingLogger(),
            requiredFindings: [{
                consumerClaim: 'readiness',
                entrypoint   : 'memory-core-mcp',
                env          : 'NEO_AUTH_GITLAB_API_BASE_URL',
                leafPath     : 'auth.gitlabApiBaseUrl',
                mode         : 'gitlab-pat',
                reason       : 'PAT validation cannot certify readiness without a GitLab API base URL.',
                valueState   : 'absent',
                disposition  : 'fail-closed'
            }]
        });

        expect(error).not.toBeNull();
        expect(error.message).toContain('Required deployment configuration is missing or invalid');
        expect(error.message).toContain('NEO_AUTH_GITLAB_API_BASE_URL (auth.gitlabApiBaseUrl): absent');
        expect(error.message).toContain('memory-core-mcp/gitlab-pat/readiness');
    });

});

test.describe('initClaudeSettings — Claude Stop-hook auto-wire (#13641)', () => {
    let initClaudeSettings, mergeClaudeHooks;
    let claudeRoot;

    const recordingLogger = () => {
        const log = [], warn = [];
        return {log: (...a) => log.push(a.join(' ')), warn: (...a) => warn.push(a.join(' ')), entries: {log, warn}};
    };

    // The tracked template the materializer reads — the Stop hook with the operator-directed
    // enforce=1 default (the forcing-function rollout; NOT dry-run) plus PreToolUse guards.
    const TEMPLATE = {
        permissions: {allow: ['mcp__neo-mjs-memory-core__healthcheck']},
        hooks      : {
            PreToolUse: [{matcher: 'Bash', hooks: [{
                type   : 'command',
                command: '/usr/bin/env node "$(git rev-parse --show-toplevel)/.claude/hooks/rgReplaceGuardHook.mjs"',
                timeout: 2
            }]}],
            Stop: [{hooks: [{
                type   : 'command',
                command: 'NEO_LANE_STATE_ENFORCE=1 /usr/bin/env node "$(git rev-parse --show-toplevel)/.claude/hooks/laneStateStopHook.mjs"',
                timeout: 10
            }]}]
        }
    };

    const buildClaudeDir = (name, {template, settings} = {}) => {
        const dir = path.join(claudeRoot, name);
        fs.mkdirSync(dir, {recursive: true});
        if (template !== undefined) fs.writeFileSync(path.join(dir, 'settings.template.json'), JSON.stringify(template, null, 2));
        if (settings !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
        return dir;
    };

    test.beforeAll(async () => {
        ({initClaudeSettings, mergeClaudeHooks} = await import('../../../../../../ai/scripts/setup/initServerConfigs.mjs'));
        claudeRoot = path.resolve(process.cwd(), 'tmp', `init-claude-settings-${process.pid}-${Date.now()}`);
        fs.mkdirSync(claudeRoot, {recursive: true});
    });

    test.afterAll(() => {
        if (claudeRoot && fs.existsSync(claudeRoot)) fs.rmSync(claudeRoot, {recursive: true, force: true});
    });

    test('mergeClaudeHooks: ensures template hooks, preserves other keys + local-only events', () => {
        const active              = {permissions: {allow: ['local-perm']}, hooks: {PostToolUse: [{hooks: []}]}};
        const {settings, changed} = mergeClaudeHooks(active, TEMPLATE);

        expect(changed).toBe(true);
        expect(settings.permissions.allow).toEqual(['local-perm']);             // operator-local key preserved
        expect(settings.hooks.PostToolUse).toEqual([{hooks: []}]);              // local-only event preserved
        expect(settings.hooks.PreToolUse).toEqual(TEMPLATE.hooks.PreToolUse);   // PreToolUse wired from template
        expect(settings.hooks.Stop).toEqual(TEMPLATE.hooks.Stop);               // Stop wired from template
    });

    test('mergeClaudeHooks: idempotent — already-wired hooks report changed=false', () => {
        const {changed} = mergeClaudeHooks({hooks: TEMPLATE.hooks}, TEMPLATE);
        expect(changed).toBe(false);
    });

    test('mergeClaudeHooks: a template without hooks is a no-op', () => {
        const active              = {permissions: {allow: ['x']}};
        const {settings, changed} = mergeClaudeHooks(active, {permissions: {}});
        expect(changed).toBe(false);
        expect(settings).toBe(active);
    });

    test('initClaudeSettings: missing settings.json → clone (full template, enforce=1 command wired)', async () => {
        const dir = buildClaudeDir('clone', {template: TEMPLATE});
        const r   = await initClaudeSettings({claudeDir: dir, logger: recordingLogger()});
        expect(r.action).toBe('clone');

        const written = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
        const command = written.hooks.Stop[0].hooks[0].command;
        // Operator-directed default: the tracked default DOES force enforce — the forcing-function
        // rollout. A future drift to dry-run fails this assertion.
        expect(command).toContain('NEO_LANE_STATE_ENFORCE=1');
        expect(command).toContain('laneStateStopHook.mjs');
        expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('rgReplaceGuardHook.mjs');
    });

    test('initClaudeSettings: re-run is idempotent → silent', async () => {
        const dir = buildClaudeDir('silent', {template: TEMPLATE});
        await initClaudeSettings({claudeDir: dir, logger: recordingLogger()});
        const r2 = await initClaudeSettings({claudeDir: dir, logger: recordingLogger()});
        expect(r2.action).toBe('silent');
    });

    test('initClaudeSettings: existing settings.json (perms only) → wired, local keys preserved', async () => {
        const dir = buildClaudeDir('wired', {template: TEMPLATE, settings: {permissions: {allow: ['my-local-perm']}}});
        const r   = await initClaudeSettings({claudeDir: dir, logger: recordingLogger()});
        expect(r.action).toBe('wired');

        const written = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
        expect(written.permissions.allow).toEqual(['my-local-perm']);                      // preserved
        expect(written.hooks.Stop[0].hooks[0].command).toContain('NEO_LANE_STATE_ENFORCE=1');
        expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('rgReplaceGuardHook.mjs');
    });

    test('initClaudeSettings: no template → skip-no-template (no settings.json written)', async () => {
        const dir = buildClaudeDir('no-template', {});
        const r   = await initClaudeSettings({claudeDir: dir, logger: recordingLogger()});
        expect(r.action).toBe('skip-no-template');
        expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
    });
});
