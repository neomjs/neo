import {test, expect}                          from '@playwright/test';
import {spawnSync}                             from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path                                    from 'node:path';
import {pathToFileURL}                         from 'node:url';

import {
    ADR_0019_RULES,
    AI_CONFIG_IMPLEMENTATION_BASELINE,
    AI_CONFIG_MODULE_SCOPE_BASELINE,
    BASELINE,
    buildConfigLeafParitySnapshot,
    buildConfigPathKindsByIdentifier,
    collectCatalogRuleIdsFromSource,
    collectConfigPathKindsFromSource,
    collectConfigEnvNamesFromSource,
    collectDeclaredConfigPaths,
    createAdr0019GuardRegistry,
    detectAiConfigImplementationViolations,
    detectComposeDefaultRestatements,
    detectComposeDefaultRestatementsFromDocuments,
    detectConfigLeafParityViolations,
    detectInlineEnvLeaves,
    detectModuleScopeAiConfigCaptures,
    detectNonEntrypointConfigResolvers,
    detectTestConfigOverlayImports,
    detectTestConfigProviderExports,
    detectUnprojectedBehaviorBindingClocksFromSources,
    lintAiConfigImplementationSsot,
    lintAiConfigModuleScopeCaptures,
    lintAdr0019GuardOwnership,
    lintConfigTemplateSsot,
    lintTestConfigAuthority,
    isThreadEntrypoint,
    parseAdr0019CatalogRows,
    runLint
} from '../../../../../../ai/scripts/lint/lint-config-template-ssot.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-config-template-ssot.mjs` — the guard that bans
 * inline `process.env` reads inside `leaf(...)` defaults in `config.template.mjs` files and
 * mechanical ADR-19 AiConfig implementation pass-through/defaulting violations, executable test
 * imports of ignored operator overlays, and exports derived from canonical config Providers.
 *
 * The antipattern it mechanizes: env-resolution branching (e.g. an inline
 * `process.env.UNIT_TEST_MODE === 'true' ? test : prod`) baked into the declarative config
 * SSOT instead of flowing through the leaf env-var-name argument. The lint lands enforcing via
 * a frozen baseline of the known instances, so NEW occurrences fail while the historical debt
 * burns down. These tests prove: detection is precise, the baseline suppresses the known set,
 * a fresh violation fails, and a stale baseline row fails (burndown hygiene).
 */
test.describe('ai/scripts/lint-config-template-ssot (#12451 — declarative config SSOT guard)', () => {
    const scriptPath  = path.resolve(process.cwd(), 'ai/scripts/lint/lint-config-template-ssot.mjs');
    const configKinds = ({primitive = [], live = []} = {}) => ({
        primitiveLeafPaths: new Set(primitive),
        liveProxyPaths    : new Set(live)
    });

    // ---- CLI ----

    test('CLI: --help exits 0 with usage text', () => {
        const result = spawnSync('node', [scriptPath, '--help'], {cwd: process.cwd(), encoding: 'utf8'});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: node ai/scripts/lint/lint-config-template-ssot.mjs');
    });

    test('CLI: the real config.template.mjs tree passes (all instances baselined)', () => {
        const result = spawnSync('node', [scriptPath], {cwd: process.cwd(), encoding: 'utf8'});

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-config-template-ssot] OK');
    });

    test('ADR-0019 ids live on executable rule objects, not a detached file list', () => {
        expect([...new Set(ADR_0019_RULES.map(rule => rule.id))].sort())
            .toEqual(['A4', 'B1', 'B2', 'B3', 'B5', 'C1', 'C3']);
        expect(ADR_0019_RULES.every(rule => typeof rule.detect === 'function' || rule.pattern instanceof RegExp))
            .toBe(true);
        expect(() => collectCatalogRuleIdsFromSource(
            "export const ADR_0019_RULES = Object.freeze(['B4']);"
        )).toThrow(/rule objects/)
    });

    test('C1 boundary: import-only is GREEN; exported module-time re-derivation is RED', () => {
        const envNames = new Set(['NEO_DB_PATH']),
              clean    = [
                  "import AiConfig from './config.mjs';",
                  'export default class Agent {}'
              ].join('\n'),
              red      = [
                  clean,
                  "const DEFAULT_DB_PATH = process.env.NEO_DB_PATH || './data/db';",
                  'export {DEFAULT_DB_PATH};'
              ].join('\n');

        expect(detectNonEntrypointConfigResolvers(clean, {configEnvNames: envNames})).toEqual([]);
        expect(detectNonEntrypointConfigResolvers(red, {configEnvNames: envNames}).map(hit => hit.rule))
            .toEqual(['C1']);

        // A runtime function is not A1's module-evaluation shape.
        expect(detectNonEntrypointConfigResolvers(
            'export function readPath() { return process.env.NEO_DB_PATH; }',
            {configEnvNames: envNames}
        )).toEqual([])
    });

    test('C1 only binds env names that a leaf already owns', () => {
        const names = collectConfigEnvNamesFromSource([
            "const data = {dbPath: leaf('/tmp/db', 'NEO_DB_PATH', 'string')};",
            "const ignored = process.env.NOT_A_LEAF;"
        ].join('\n'));

        expect([...names]).toEqual(['NEO_DB_PATH']);
        expect(detectNonEntrypointConfigResolvers(
            "export const EXTERNAL = process.env.NOT_A_LEAF || 'x';",
            {configEnvNames: names}
        )).toEqual([])
    });

    test('entrypoint classification is executable: runAgent + every daemon pass; Agent does not', () => {
        const rootDir  = process.cwd(),
              read     = rel => readFileSync(path.join(rootDir, rel), 'utf8'),
              runAgent = read('ai/scripts/runners/runAgent.mjs'),
              agent    = read('ai/Agent.mjs'),
              daemons  = readdirSync(path.join(rootDir, 'ai/daemons'), {withFileTypes: true})
                  .filter(entry => entry.isDirectory())
                  .map(entry => `ai/daemons/${entry.name}/daemon.mjs`)
                  .filter(rel => existsSync(path.join(rootDir, rel)));

        expect(isThreadEntrypoint({source: runAgent})).toBe(true);
        expect(isThreadEntrypoint({source: agent})).toBe(false);
        expect(daemons.length).toBeGreaterThan(0);
        daemons.forEach(rel => expect(isThreadEntrypoint({source: read(rel)}), rel).toBe(true))
    });

    test('ADR-0019 guard ownership is exact in both directions', () => {
        const adrSource = readFileSync(
                  path.join(process.cwd(), 'learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md'),
                  'utf8'
              ),
              rows      = parseAdr0019CatalogRows(adrSource),
              clean     = lintAdr0019GuardOwnership({adrSource});

        // Not `toHaveLength(<n>)`. An exact row count cannot distinguish a truncated parse from a
        // catalog that legitimately grew: adding a correctly tagged row fails it just as loudly as
        // losing half the table, while the ownership relation below stays clean. A catalog nobody
        // can extend without editing a test is a tripwire, not a check.
        //
        // Assert what the count stood for. One id per group proves the parser reached the end of
        // the table, and `violations` already proves every row carries a disposition — so a
        // truncated parse still fails while a well-formed addition does not.
        expect(rows.map(row => row.id)).toEqual(expect.arrayContaining(['A1', 'B4', 'C3']));
        expect(rows.length).toBeGreaterThanOrEqual(17);
        expect(clean.violations).toEqual([]);

        const missingB4 = createAdr0019GuardRegistry({testMutationRules: []}),
              overstate = lintAdr0019GuardOwnership({adrSource, guardRegistry: missingB4});

        expect(overstate.violations).toContainEqual(expect.objectContaining({
            id: 'B4', guard: 'check-aiconfig-test-mutation', kind: 'overstates-enforcement'
        }));

        const understatedSource = adrSource.replace(
                  '[guarded: check-aiconfig-antipatterns]` — live debt',
                  '[unenforced: mutation]` — live debt'
              ),
              understate = lintAdr0019GuardOwnership({adrSource: understatedSource});

        expect(understate.violations).toContainEqual(expect.objectContaining({
            id: 'A1', guard: 'check-aiconfig-antipatterns', kind: 'understates-enforcement'
        }))
    });

    // ---- pure detection ----

    test('detects an inline process.env read in a leaf default and extracts env + key', () => {
        const hits = detectInlineEnvLeaves(
            `            graph: leaf(process.env.UNIT_TEST_MODE === 'true' ? ':memory:' : '/x.sqlite', 'NEO_MEMORY_DB_PATH', 'string')`
        );

        expect(hits).toHaveLength(1);
        expect(hits[0].env).toBe('NEO_MEMORY_DB_PATH');
        expect(hits[0].key).toBe('graph');
        expect(hits[0].line).toBe(1);
    });

    test('ignores a declarative leaf (env only via the env-var-name argument)', () => {
        expect(detectInlineEnvLeaves(`            debug: leaf(false, 'NEO_DEBUG', 'boolean'),`)).toHaveLength(0);
    });

    test('ignores a process.env read that is not inside a leaf() call', () => {
        expect(detectInlineEnvLeaves(`const wakeDir = path.resolve(process.env.NEO_AI_DAEMON_DIR || cwd);`)).toHaveLength(0);
    });

    test('allows a local Provider subtree reference in implementation code', () => {
        expect(detectAiConfigImplementationViolations(
            `const bridgeConfig = AiConfig.orchestrator.deploymentStateBridge;`
        )).toHaveLength(0);
    });

    test('detects AiConfig exports, config pass-throughs, parameter defaults, and defensive optional chaining', () => {
        const hits = detectAiConfigImplementationViolations([
            `export const deployment = AiConfig.orchestrator.deploymentStateBridge;`,
            `runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,`,
            `async run({bridgeConfig = AiConfig.orchestrator.deploymentStateBridge} = {}) {`,
            `const stuckCfg = AiConfig.orchestrator?.providerReadiness?.stuckRunner;`
        ].join('\n'));

        expect(hits.map(hit => hit.kind)).toEqual([
            'export',
            'config-pass-through',
            'config-parameter-default',
            'defensive-optional-chain'
        ]);
    });

    test('detects hidden defaults and type coercions on AiConfig reads', () => {
        const hits = detectAiConfigImplementationViolations(
            `limit = Math.max(0, Number(AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit) || 0),`
        );

        expect(hits.map(hit => hit.kind)).toEqual(['type-coercion', 'hidden-default']);
    });

    test('ignores a direct AiConfig leaf read at the use site', () => {
        expect(detectAiConfigImplementationViolations(
            `return AiConfig.orchestrator.deploymentStateBridge.snapshotPath;`
        )).toHaveLength(0);
    });

    test('classifies config-template paths as frozen leaves versus live proxies', () => {
        const kinds = collectConfigPathKindsFromSource([
            `class Config {`,
            `    static config = {`,
            `        data: {`,
            `            neoRootDir: leaf('/repo'),`,
            `            issueSync: {`,
            `                maxIssues: leaf(20, 'NEO_MAX_ISSUES', 'number')`,
            `            },`,
            `            queryScoreWeights: leaf({`,
            `                baseIncrement: 1`,
            `            })`,
            `        }`,
            `    }`,
            `}`
        ].join('\n'));

        expect(kinds.primitiveLeafPaths.has('neoRootDir')).toBe(true);
        expect(kinds.primitiveLeafPaths.has('issueSync.maxIssues')).toBe(true);
        expect(kinds.liveProxyPaths.has('issueSync')).toBe(true);
        expect(kinds.liveProxyPaths.has('queryScoreWeights')).toBe(true);
    });

    test('detects module-scope AiConfig primitive leaf captures', () => {
        const configPathKindsByIdentifier = new Map([
            ['aiConfig', configKinds({
                primitive: ['neoRootDir', 'storagePaths.graph', 'datasets.rlaif.trajectories'],
                live     : ['issueSync', 'pullRequest', 'queryScoreWeights']
            })],
            ['Memory_Config', configKinds({primitive: ['storagePaths.memory']})]
        ]);

        const hits = detectModuleScopeAiConfigCaptures([
            `import aiConfig from './config.mjs';`,
            `const issueSyncConfig = aiConfig.issueSync;`,
            `const {queryScoreWeights} = aiConfig;`,
            `const cwd = aiConfig.neoRootDir;`,
            `const memoryPath = Memory_Config.storagePaths.memory;`
        ].join('\n'), {configPathKindsByIdentifier});

        expect(hits.map(hit => hit.text)).toEqual([
            'const cwd = aiConfig.neoRootDir;',
            'const memoryPath = Memory_Config.storagePaths.memory;'
        ]);
    });

    test('maps config.mjs imports to templates for module-scope capture classification', async () => {
        const configPathKindsByIdentifier = await buildConfigPathKindsByIdentifier({
            file  : 'ai/services/github-workflow/sync/IssueSyncer.mjs',
            source: `import aiConfig from '../../../mcp/server/github-workflow/config.mjs';`
        });

        expect(configPathKindsByIdentifier.get('aiConfig').liveProxyPaths.has('issueSync')).toBe(true);
        expect(configPathKindsByIdentifier.get('aiConfig').primitiveLeafPaths.has('issueSync.maxIssues')).toBe(true);
    });

    test('ignores invocation-time and function-local AiConfig reads', () => {
        const hits = detectModuleScopeAiConfigCaptures([
            `const isRemoteIngestTransport = () => aiConfig.transport === 'streamable-http';`,
            `function getSnapshotPath() {`,
            `    const snapshotPath = AiConfig.orchestrator.deploymentStateBridge.snapshotPath;`,
            `    return snapshotPath;`,
            `}`
        ].join('\n'));

        expect(hits).toHaveLength(0);
    });

    test('detects bound, side-effect, dynamic, and computed dynamic test imports of repo overlays', () => {
        const file = 'test/playwright/unit/fixture.spec.mjs',
              hits = detectTestConfigOverlayImports([
                  `import AiConfig from '../../../ai/config.mjs';`,
                  `import '../../../ai/mcp/server/github-workflow/config.mjs';`,
                  `await import('../../../ai/mcp/server/memory-core/config.mjs');`,
                  `const repoRoot = process.cwd();`,
                  `const configUrl = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/config.mjs')).href;`,
                  `await import(configUrl);`
              ].join('\n'), {file});

        expect(hits.map(hit => hit.kind)).toEqual([
            'static-import',
            'side-effect-import',
            'dynamic-import',
            'dynamic-import-computed'
        ]);
        expect(hits.map(hit => hit.replacement)).toEqual([
            '../../../ai/config.template.mjs',
            '../../../ai/mcp/server/github-workflow/config.template.mjs',
            '../../../ai/mcp/server/memory-core/config.template.mjs',
            pathToFileURL(path.resolve(process.cwd(), 'ai/mcp/server/neural-link/config.template.mjs')).href
        ]);
    });

    test('folds concatenation, array join, and interpolated-template computed imports', () => {
        const hits = detectTestConfigOverlayImports([
            `const binaryPath = '../../../ai/' + 'config.mjs';`,
            `const joinedPath = ['../../../ai/mcp/server/memory-core', 'config.mjs'].join('/');`,
            `const templateRoot = '../../../ai/mcp/server/neural-link';`,
            'const templatePath = `${templateRoot}/config.mjs`;',
            `await import(binaryPath);`,
            `await import(joinedPath);`,
            `await import(templatePath);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits.map(hit => hit.kind)).toEqual([
            'dynamic-import-computed',
            'dynamic-import-computed',
            'dynamic-import-computed'
        ]);
        expect(hits.map(hit => hit.template)).toEqual([
            'ai/config.template.mjs',
            'ai/mcp/server/memory-core/config.template.mjs',
            'ai/mcp/server/neural-link/config.template.mjs'
        ]);
    });

    test('resolves the real import-meta dirname chain used by computed config imports', () => {
        const hits = detectTestConfigOverlayImports([
            `const __filename = fileURLToPath(import.meta.url),`,
            `      __dirname  = path.dirname(__filename),`,
            `      repoRoot   = path.resolve(__dirname, '../../..'),`,
            `      configUrl  = pathToFileURL(path.join(repoRoot, 'ai/mcp/server/neural-link/config.mjs')).href;`,
            `await import(configUrl);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(1);
        expect(hits[0].template).toBe('ai/mcp/server/neural-link/config.template.mjs');
    });

    test('resolves the import-site lexical binding instead of an unrelated nested shadow', () => {
        const hits = detectTestConfigOverlayImports([
            `const configUrl = '../../../ai/config.mjs';`,
            `function unrelated() {`,
            `    const configUrl = '/tmp/config.mjs';`,
            `    return configUrl;`,
            `}`,
            `await import(configUrl);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(1);
        expect(hits[0].template).toBe('ai/config.template.mjs');
    });

    test('tracks a later direct assignment to a computed import binding', () => {
        const hits = detectTestConfigOverlayImports([
            `let configUrl = '/tmp/safe.mjs';`,
            `configUrl = '../../../ai/mcp/server/memory-core/config.mjs';`,
            `await import(configUrl);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(1);
        expect(hits[0].template).toBe('ai/mcp/server/memory-core/config.template.mjs');
    });

    test('tracks var bindings across their declaring block boundary', () => {
        const hits = detectTestConfigOverlayImports([
            `{`,
            `    var configUrl = '../../../ai/config.mjs';`,
            `}`,
            `await import(configUrl);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(1);
        expect(hits[0].template).toBe('ai/config.template.mjs');
    });

    test('tracks nested assignments to an uninitialized hoisted var binding', () => {
        const hits = detectTestConfigOverlayImports([
            `var configUrl;`,
            `{`,
            `    configUrl = '../../../ai/config.mjs';`,
            `}`,
            `await import(configUrl);`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(1);
        expect(hits[0].template).toBe('ai/config.template.mjs');
    });

    test('does not reinterpret an unknown disposable-repository root as the current checkout', () => {
        const hits = detectTestConfigOverlayImports([
            `const externalRoot = process.env.DISPOSABLE_REPO;`,
            `const configUrl = path.join(externalRoot, 'ai/config.mjs');`,
            `await import(configUrl);`,
            `await import(path.join(externalRoot, 'ai/mcp/server/memory-core/config.mjs'));`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(0);
    });

    test('ignores comments, inert fixture text, tracked no-template configs, and outside-repo paths', () => {
        const hits = detectTestConfigOverlayImports([
            `// await import('../../../ai/config.mjs');`,
            'const fixture = "await import(\\\'./ai/mcp/server/memory-core/config.mjs\\\')";',
            `import ClientConfig from '../../../ai/mcp/client/config.mjs';`,
            `await import('/tmp/config.mjs');`
        ].join('\n'), {file: 'test/playwright/unit/fixture.spec.mjs'});

        expect(hits).toHaveLength(0);
    });

    test('detects exported snapshots and direct re-exports of imported config-template Providers', () => {
        const file = 'test/playwright/fixtures/probe.mjs',
              hits = detectTestConfigProviderExports([
                  `import AiConfig from '../../../ai/config.template.mjs';`,
                  `const snapshot = snapshotData(AiConfig.data);`,
                  `export const FROZEN_DEFAULTS = deepFreeze(snapshot);`,
                  `export {AiConfig};`
              ].join('\n'), {file});

        expect(hits.map(hit => hit.kind)).toEqual([
            'config-provider-derived-export',
            'config-provider-re-export'
        ]);
        expect(hits.map(hit => hit.line)).toEqual([3, 4]);
    });

    test('detects direct source re-exports of a canonical config template', () => {
        const hits = detectTestConfigProviderExports(
            `export {default as AiConfig} from '../../../ai/config.template.mjs';`,
            {file: 'test/playwright/fixtures/probe.mjs'}
        );

        expect(hits).toHaveLength(1);
        expect(hits[0].kind).toBe('config-provider-re-export');
    });

    test('allows invocation-time Provider reads and unrelated exported object keys', () => {
        const hits = detectTestConfigProviderExports([
            `import AiConfig from '../../../ai/config.template.mjs';`,
            `export const readPort = () => AiConfig.network.port;`,
            `export const metadata = {AiConfig: 'label'};`
        ].join('\n'), {file: 'test/playwright/fixtures/probe.mjs'});

        expect(hits).toHaveLength(0);
    });

    // ---- baseline partitioning (injected files, no disk) ----

    const fileOf = (file, source) => ({file, source});

    test('a baselined violation is suppressed (no new violations)', () => {
        // Use a SYNTHETIC baseline so this test exercises the suppression logic independent of the live
        // BASELINE contents — which empties as reshapes land (the live BASELINE is now empty / fully
        // enforcing) and which churned this fixture each time a specific env was dropped.
        const baseline = [{file: 'ai/mcp/server/x/config.template.mjs', env: 'NEO_FIXTURE_ENV', ticket: '#0', reshape: 'fixture'}];
        const files    = [fileOf(
            'ai/mcp/server/x/config.template.mjs',
            `x: leaf(process.env.UNIT_TEST_MODE === 'true' ? 'a' : 'b', 'NEO_FIXTURE_ENV', 'string')`
        )];

        const {violations, newViolations} = lintConfigTemplateSsot({files, baseline});

        expect(violations).toHaveLength(1);
        expect(newViolations).toHaveLength(0);
    });

    test('a fresh (unbaselined) violation fails the lint', async () => {
        const files = [fileOf(
            'ai/mcp/server/knowledge-base/config.template.mjs',
            `host: leaf(process.env.UNIT_TEST_MODE === 'true' ? 'a' : 'b', 'NEO_KB_HOST', 'string')`
        )];

        const {newViolations} = lintConfigTemplateSsot({files});

        expect(newViolations).toHaveLength(1);
        expect(newViolations[0].env).toBe('NEO_KB_HOST');
        expect((await runLint({files})).exitCode).toBe(1);
    });

    test('a stale baseline row (reshape landed, no live violation) fails the lint', async () => {
        const baseline = [{file: 'ai/config.template.mjs', env: 'NEO_GONE', ticket: '#12451', reshape: 'done'}];

        const {staleBaseline, newViolations} = lintConfigTemplateSsot({files: [], baseline});

        expect(newViolations).toHaveLength(0);
        expect(staleBaseline).toHaveLength(1);
        expect((await runLint({files: [], baseline})).exitCode).toBe(1);
    });

    test('a baselined AiConfig implementation hit is suppressed (allowed boundary/burndown row)', async () => {
        const baseline = [{
            file  : 'ai/fixture.mjs',
            kind  : 'config-pass-through',
            text  : 'runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,',
            ticket: '#13939',
            reason: 'fixture boundary'
        }];
        const files = [fileOf(
            'ai/fixture.mjs',
            `runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,`
        )];

        const {violations, newViolations} = lintAiConfigImplementationSsot({files, baseline});

        expect(violations).toHaveLength(1);
        expect(newViolations).toHaveLength(0);
    });

    test('a fresh AiConfig implementation hit fails the combined lint', async () => {
        const implementationFiles = [fileOf(
            'ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs',
            `limit = Math.max(0, Number(AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit) || 0),`
        )];

        const result = await runLint({files: [], implementationFiles, implementationBaseline: []});

        expect(result.exitCode).toBe(1);
        expect(result.implementation.newViolations).toHaveLength(2);
        expect(result.implementation.newViolations.map(hit => hit.kind)).toEqual(['type-coercion', 'hidden-default']);
    });

    test('a baselined module-scope AiConfig primitive leaf capture is suppressed (documented P1 debt)', async () => {
        const baseline = [{
            file  : 'ai/fixture.mjs',
            kind  : 'module-scope-leaf-capture',
            text  : 'const cwd = aiConfig.neoRootDir;',
            ticket: '#14239',
            reason: 'fixture frozen primitive leaf'
        }];
        const files = [fileOf(
            'ai/fixture.mjs',
            `const cwd = aiConfig.neoRootDir;`
        )];

        const {violations, newViolations} = await lintAiConfigModuleScopeCaptures({files, baseline});

        expect(violations).toHaveLength(1);
        expect(newViolations).toHaveLength(0);
    });

    test('a fresh module-scope AiConfig primitive leaf capture fails the combined lint', async () => {
        const moduleScopeFiles = [fileOf(
            'ai/daemons/orchestrator/services/SelfHealFixture.mjs',
            [
                `import AiConfig from '../../../config.mjs';`,
                `const recoveryRunStateDir = AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir;`
            ].join('\n')
        )];

        const result = await runLint({
            files                 : [],
            implementationFiles   : [],
            implementationBaseline: [],
            moduleScopeFiles,
            moduleScopeBaseline   : []
        });

        expect(result.exitCode).toBe(1);
        expect(result.moduleScope.newViolations).toHaveLength(1);
        expect(result.moduleScope.newViolations[0].text).toBe(
            'const recoveryRunStateDir = AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir;'
        );
    });

    test('a fresh module-scope namespace proxy capture passes the combined lint', async () => {
        const moduleScopeFiles = [fileOf(
            'ai/daemons/orchestrator/services/SelfHealFixture.mjs',
            [
                `import AiConfig from '../../../config.mjs';`,
                `const recoveryActuatorConfig = AiConfig.orchestrator.recoveryActuator;`
            ].join('\n')
        )];

        const result = await runLint({
            files                 : [],
            implementationFiles   : [],
            implementationBaseline: [],
            moduleScopeFiles,
            moduleScopeBaseline   : []
        });

        expect(result.exitCode).toBe(0);
        expect(result.moduleScope.newViolations).toHaveLength(0);
    });

    test('the combined lint keeps C1 import-only GREEN and competing export RED', async () => {
        const common = {
                  files                 : [],
                  implementationFiles   : [],
                  implementationBaseline: [],
                  moduleScopeFiles      : [],
                  moduleScopeBaseline   : [],
                  testConfigFiles       : [],
                  configEnvNames        : new Set(['NEO_DB_PATH'])
              },
              importOnly = fileOf(
                  'ai/Agent.mjs',
                  "import AiConfig from './config.mjs';\nexport default class Agent {}"
              ),
              competing = fileOf(
                  'ai/Agent.mjs',
                  [
                      importOnly.source,
                      "const DEFAULT_DB_PATH = process.env.NEO_DB_PATH || './data/db';",
                      'export {DEFAULT_DB_PATH};'
                  ].join('\n')
              );

        const green = await runLint({...common, c1Files: [importOnly]}),
              red   = await runLint({...common, c1Files: [competing]});

        expect(green.exitCode).toBe(0);
        expect(green.c1Resolvers.violations).toEqual([]);
        expect(red.exitCode).toBe(1);
        expect(red.c1Resolvers.violations).toEqual([
            expect.objectContaining({file: 'ai/Agent.mjs', rule: 'C1', env: 'NEO_DB_PATH'})
        ])
    });

    test('a test overlay import fails the combined lint without a baseline escape hatch', async () => {
        const testConfigFiles = [fileOf(
            'test/playwright/unit/fixture.spec.mjs',
            `import AiConfig from '../../../ai/config.mjs';`
        )];

        const direct = lintTestConfigAuthority({files: testConfigFiles});
        const result = await runLint({
            files                 : [],
            implementationFiles   : [],
            implementationBaseline: [],
            moduleScopeFiles      : [],
            moduleScopeBaseline   : [],
            testConfigFiles
        });

        expect(direct.violations).toHaveLength(1);
        expect(result.exitCode).toBe(1);
        expect(result.testConfig.violations).toHaveLength(1);
        expect(result.testConfig.violations[0].template).toBe('ai/config.template.mjs');
    });

    test('a test-side config Provider snapshot fails the combined lint without a baseline escape hatch', async () => {
        const testConfigFiles = [fileOf(
            'test/playwright/fixtures/probe.mjs',
            [
                `import AiConfig from '../../../ai/config.template.mjs';`,
                `export const DEFAULTS = deepFreeze(snapshotData(AiConfig.data));`
            ].join('\n')
        )];

        const result = await runLint({
            files                 : [],
            implementationFiles   : [],
            implementationBaseline: [],
            moduleScopeFiles      : [],
            moduleScopeBaseline   : [],
            testConfigFiles
        });

        expect(result.exitCode).toBe(1);
        expect(result.testConfig.violations).toHaveLength(1);
        expect(result.testConfig.violations[0].kind).toBe('config-provider-derived-export');
    });

    // ---- the shipped baseline is internally well-formed ----

    test('every shipped BASELINE row carries file, env, and a reshape note', () => {
        // BASELINE may be empty once all instances are reshaped (fully-enforcing); the per-row shape
        // assertions below still guard any future grandfathered row.
        for (const row of BASELINE) {
            expect(row.file).toMatch(/config\.template\.mjs$/);
            expect(row.env).toMatch(/^[A-Z][A-Z0-9_]+$/);
            expect(row.reshape.length).toBeGreaterThan(0);
        }
    });

    test('every shipped AI_CONFIG_IMPLEMENTATION_BASELINE row carries file, kind, text, and reason', () => {
        for (const row of AI_CONFIG_IMPLEMENTATION_BASELINE) {
            expect(row.file).toMatch(/^ai\/.*\.mjs$/);
            expect(row.kind.length).toBeGreaterThan(0);
            expect(row.text.length).toBeGreaterThan(0);
            expect(row.reason.length).toBeGreaterThan(0);
        }
    });

    test('every shipped AI_CONFIG_MODULE_SCOPE_BASELINE row carries #14239 burndown context', () => {
        for (const row of AI_CONFIG_MODULE_SCOPE_BASELINE) {
            expect(row.file).toMatch(/^ai\/.*\.mjs$/);
            expect(row.kind).toBe('module-scope-leaf-capture');
            expect(row.text.length).toBeGreaterThan(0);
            expect(row.ticket).toBe('#14239');
            expect(row.reason).toContain('Frozen primitive');
        }
    });

    /**
     * The behavior-binding projection rule.
     *
     * These cases exist for the DIRECTIONS the rule must distinguish, not for its branching, which is
     * three predicates. The defect it was built for shipped on two successive plane generations: a
     * contention ladder that governs every single-input embed while appearing in no template, so an
     * operator read the outer deadlines and could not see the ~47s clock that actually bound.
     *
     * The load-bearing case is the FIRST one — a commented mention satisfies the rule. That is not a
     * lenience, it is the whole design: the sibling `matches-config-default` rule bans restating a
     * default as a live value, so a comment is the only form that documents a clock without creating
     * a second declaration site. A version of this rule that demanded a live assignment would put the
     * two rules in permanent contradiction and one of them would be deleted within a week.
     */
    const PROJECTION_POLICY = {
        clockSuffixes: ['_TIMEOUT_MS', '_RETRY_COUNT', '_RETRY_DELAY_MS'],
        profiles     : {
            'compose.yml': {namespaces: ['NEO_DEMO_'], template: 'ai/config.template.mjs'}
        }
    };

    const TIMEOUT_ROWS = [{configPath: 'demo.contentionTimeoutMs', default: 15000}];

    const projectionKinds = ({source, envDefaults = {NEO_DEMO_CONTENTION_TIMEOUT_MS: TIMEOUT_ROWS}, policy = PROJECTION_POLICY}) =>
        detectUnprojectedBehaviorBindingClocksFromSources({
            composeSources   : {'compose.yml': source},
            envDefaultsByFile: {'compose.yml': envDefaults},
            policy
        }).map(violation => violation.kind);

    test('the canonical projection line passes: comment + exact name + current default + guidance', () => {
        expect(projectionKinds({
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"   # per-attempt ceiling, ONE single-input embed'
        })).toEqual([]);
    });

    test('RED: a STALE value fails — the class that makes a green gate publish a wrong number', () => {
        // The dangerous shape, and the one a token-presence check cannot see. An operator trusts a
        // number and only distrusts a blank, so a projection that outlived its leaf is worse than no
        // projection at all. Value-equality is what makes the documentation self-invalidating.
        expect(projectionKinds({
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "20000"   # per-attempt ceiling'
        })).toEqual(['projection-default-mismatch']);
    });

    test('RED: prose that merely names the variable is not a projection', () => {
        expect(projectionKinds({
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS exists somewhere'
        })).toEqual(['unprojected-behavior-binding-clock']);
    });

    test('RED: a PREFIXED token does not satisfy the requirement', () => {
        // The first shape of this check bounded the match on the right only, justified by reasoning
        // about shorter-vs-longer generated names — which never considered a contaminated prefix.
        // Both boundaries are anchored now.
        expect(projectionKinds({
            source: '  # OLD_NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"   # retired'
        })).toEqual(['unprojected-behavior-binding-clock']);
    });

    test('RED: a correct value without plane-class guidance still fails', () => {
        expect(projectionKinds({
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"'
        })).toEqual(['projection-missing-guidance']);
    });

    test('a LIVE key is not a projection — that is the sibling rule\'s territory', () => {
        // Projection must be commented. A live assignment equal to the default is precisely what
        // matches-config-default bans, so accepting it here would put the two rules in contradiction.
        expect(projectionKinds({
            source: '  NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"   # guidance'
        })).toEqual(['unprojected-behavior-binding-clock']);
    });

    test('every leaf of a three-leaf ladder is required — projecting two of three still fails', () => {
        // The 47s ceiling is 15000x3 + 1000x2: the composition, not any single leaf.
        expect(projectionKinds({
            envDefaults: {
                NEO_DEMO_CONTENTION_TIMEOUT_MS    : TIMEOUT_ROWS,
                NEO_DEMO_CONTENTION_RETRY_COUNT   : [{configPath: 'demo.retryCount', default: 2}],
                NEO_DEMO_CONTENTION_RETRY_DELAY_MS: [{configPath: 'demo.retryDelayMs', default: 1000}]
            },
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"  # a\n  # NEO_DEMO_CONTENTION_RETRY_COUNT: "2"  # b\n'
        })).toEqual(['unprojected-behavior-binding-clock']);
    });

    test('one env binding several config paths accepts any of its resolved defaults', () => {
        expect(projectionKinds({
            envDefaults: {
                NEO_DEMO_CONTENTION_TIMEOUT_MS: [
                    {configPath: 'a.timeoutMs', default: 15000},
                    {configPath: 'b.timeoutMs', default: 30000}
                ]
            },
            source: '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "30000"   # the other binding'
        })).toEqual([]);
    });

    test('scope is declared, never inferred: out-of-namespace and non-clock leaves are ignored', () => {
        expect(projectionKinds({
            envDefaults: {
                NEO_OTHER_CONTENTION_TIMEOUT_MS: TIMEOUT_ROWS,
                NEO_DEMO_EMBEDDING_MODEL       : [{configPath: 'demo.model', default: 'x'}]
            },
            source: '  NEO_DEMO_HOST: http://embedding-model:8080\n'
        })).toEqual([]);
    });

    test('a profile with no namespaces demands nothing rather than everything', () => {
        expect(projectionKinds({
            policy: {clockSuffixes: ['_TIMEOUT_MS'], profiles: {'compose.yml': {}}},
            source: ''
        })).toEqual([]);
    });

    test('RED: deleting a prose guidance block fails, even with every per-line annotation intact', () => {
        // The per-line trailing comment proves a line was annotated; it cannot prove the file still
        // explains what the knobs DO. A gate satisfied by annotations alone enforces visibility down
        // to the identifier and the value while staying silent about the only part an operator reads
        // to make a decision. The expected count is DECLARED, so removing a block is a reviewed edit.
        const policy = {
            clockSuffixes: ['_TIMEOUT_MS'],
            profiles     : {
                'compose.yml': {
                    guidanceBlocks: 2,
                    guidanceMarker: 'Plane-class guidance',
                    namespaces    : ['NEO_DEMO_'],
                    template      : 'ai/config.template.mjs'
                }
            }
        };
        const projected = '  # NEO_DEMO_CONTENTION_TIMEOUT_MS: "15000"   # per-attempt ceiling\n';

        expect(projectionKinds({
            policy,
            source: `${projected}  # Plane-class guidance: CPU\n  # Plane-class guidance: GPU\n`
        }), 'both blocks present').toEqual([]);

        expect(projectionKinds({
            policy,
            source: `${projected}  # Plane-class guidance: CPU\n`
        })).toEqual(['projection-guidance-blocks-missing']);
    });

    test('the shipped policy is clean on dev and the detector can still fail', async () => {
        const {detectUnprojectedBehaviorBindingClocks} = await import(
            pathToFileURL(path.join(process.cwd(), 'ai/scripts/lint/lint-config-template-ssot.mjs')).href
        );

        expect(await detectUnprojectedBehaviorBindingClocks({}), 'dev tree must be clean').toEqual([]);
        expect(projectionKinds({source: ''}).length, 'and the detector must be able to fail').toBe(1);
    });

    test('Compose parity names both literal-default and retired/derived restatements', () => {
        const violations = detectComposeDefaultRestatementsFromDocuments({
            policy: {
                profiles: {
                    'compose.yml': {
                        services: {server: 'config.template.mjs'}
                    }
                },
                forbiddenEnv: {
                    NEO_AUTO_SYNC: 'retired startup control'
                }
            },
            composeDocuments: {
                'compose.yml': {
                    services: {
                        server: {
                            environment: [
                                'MCP_HTTP_PORT=3000',
                                'NEO_AUTO_SYNC=false',
                                'NEO_PROVIDER=${NEO_PROVIDER:-}'
                            ]
                        }
                    }
                }
            },
            envDefaultsByTemplate: {
                'config.template.mjs': {
                    MCP_HTTP_PORT: [{configPath: 'mcpHttpPort', default: 3000}],
                    NEO_PROVIDER : [{configPath: 'provider', default: 'cloud'}]
                }
            }
        });

        expect(violations).toEqual([
            expect.objectContaining({
                configPath: 'mcpHttpPort',
                env       : 'MCP_HTTP_PORT',
                kind      : 'matches-config-default'
            }),
            expect.objectContaining({
                env : 'NEO_AUTO_SYNC',
                kind: 'derived-or-retired-env'
            })
        ])
    });

    test('Compose parity: a named exemption permits a restatement, and a dormant one fails', () => {
        // An exemption exists because some restatements are legitimate: a deployment template naming
        // the model it runs documents an IDENTITY, and deleting it to satisfy a rule aimed at tuning
        // knobs trades a real artifact for a lint. But an exemption is the one part of a guard that
        // never fails on its own — the key it names can be removed, renamed, or drift off its default
        // and the entry keeps silently licensing a restatement nobody decided on. So it expires.
        const run = (environment, exemptEnv) => detectComposeDefaultRestatementsFromDocuments({
            policy: {
                profiles: {'compose.yml': {services: {server: 'config.template.mjs'}, exemptEnv}}
            },
            composeDocuments     : {'compose.yml': {services: {server: {environment}}}},
            envDefaultsByTemplate: {
                'config.template.mjs': {
                    NEO_MODEL    : [{configPath: 'model', default: 'gemma4:26b'}],
                    MCP_HTTP_PORT: [{configPath: 'mcpHttpPort', default: 3000}]
                }
            }
        });

        // Exempted: named, reasoned, and the key really is there restating its default.
        expect(run(['NEO_MODEL=gemma4:26b'], {NEO_MODEL: 'model identity'})).toEqual([]);

        // NOT exempted: the exemption is per-env, so it cannot blanket the file.
        expect(run(['NEO_MODEL=gemma4:26b', 'MCP_HTTP_PORT=3000'], {NEO_MODEL: 'model identity'})).toEqual([
            expect.objectContaining({env: 'MCP_HTTP_PORT', kind: 'matches-config-default'})
        ]);

        // Dormant: the exempted key is gone from the file, so the entry is now dead weight.
        expect(run(['MCP_HTTP_PORT=${PORT:-}'], {NEO_MODEL: 'model identity'})).toEqual([
            expect.objectContaining({env: 'NEO_MODEL', kind: 'unused-compose-default-exemption'})
        ]);

        // Also dormant when the key is present but has DRIFTED off the default — the restatement the
        // exemption was granted for no longer exists, and the entry must not survive that silently.
        expect(run(['NEO_MODEL=some-other-model'], {NEO_MODEL: 'model identity'})).toEqual([
            expect.objectContaining({env: 'NEO_MODEL', kind: 'unused-compose-default-exemption'})
        ])
    });

    test('Compose parity: an exemption with no rationale is refused, not honoured', () => {
        // The escape hatch's own escape hatch. `Object.hasOwn` asked whether the KEY was present and
        // never what it said, so `{NEO_MODEL: ''}` suppressed a real restatement — an exemption that
        // says nothing, which the rule's own prose calls indistinguishable from the drift it catches.
        // Presence is not substance, and a guard that checks the cheaper one false-greens on exactly
        // the input its invariant was written to refuse.
        //
        // Each case is ISOLATED: one env, one exemption, one matching default, so a pass cannot come
        // from the per-env scoping or the dormancy rule. And the verdict is a reported violation
        // rather than silence — quietly declining to exempt would restore the rule while hiding a
        // malformed policy entry, sending the operator to debug the restatement instead of the
        // exemption they thought they had written.
        const run = (environment, exemptEnv) => detectComposeDefaultRestatementsFromDocuments({
            policy: {
                profiles: {'compose.yml': {services: {server: 'config.template.mjs'}, exemptEnv}}
            },
            composeDocuments     : {'compose.yml': {services: {server: {environment}}}},
            envDefaultsByTemplate: {
                'config.template.mjs': {NEO_MODEL: [{configPath: 'model', default: 'gemma4:26b'}]}
            }
        });

        for (const [label, reason] of [
            ['empty string',      ''],
            ['whitespace only',   '   '],
            ['null',              null],
            ['a bare true',       true],
            ['a number',          1]
        ]) {
            expect(run(['NEO_MODEL=gemma4:26b'], {NEO_MODEL: reason}), label).toEqual([
                expect.objectContaining({env: 'NEO_MODEL', kind: 'unreasoned-compose-default-exemption'})
            ])
        }

        // The control: the identical call with a real rationale still passes, so the repair refuses
        // blankness rather than refusing exemptions.
        expect(run(['NEO_MODEL=gemma4:26b'], {NEO_MODEL: 'model identity'})).toEqual([]);
    });

    test('Compose parity: one blank exemption is ONE violation, however many services share the anchor', () => {
        // The production shape, and the one the single-service case above structurally cannot see.
        // Compose profiles share an env anchor across services, so a per-service push turns one
        // malformed policy entry into four byte-identical records — describing the fan-out of the
        // anchor rather than the size of the defect. A reader counting violations would over-read it,
        // and the repair is the same single edit either way.
        //
        // My first fixture used one service, so the cardinality bug could not fail it. @neo-gpt-emmy
        // found this by re-running the real four-service shape rather than the example I supplied —
        // the second time today a fixture of mine agreed with the code it was meant to falsify.
        const services = ['kb-server', 'mc-server', 'orchestrator', 'provider-lane-worker'];

        const run = exemptEnv => detectComposeDefaultRestatementsFromDocuments({
            policy: {
                profiles: {
                    'compose.yml': {
                        exemptEnv,
                        services: Object.fromEntries(services.map(name => [name, 'config.template.mjs']))
                    }
                }
            },
            composeDocuments: {
                'compose.yml': {
                    services: Object.fromEntries(services.map(name =>
                        [name, {environment: ['NEO_MODEL=gemma4:26b']}]
                    ))
                }
            },
            envDefaultsByTemplate: {
                'config.template.mjs': {NEO_MODEL: [{configPath: 'model', default: 'gemma4:26b'}]}
            }
        });

        const blank = run({NEO_MODEL: ''});

        expect(blank.length, 'four services restating one anchor is still ONE policy defect').toBe(1);
        expect(blank[0]).toEqual(expect.objectContaining({
            env : 'NEO_MODEL',
            file: 'compose.yml',
            kind: 'unreasoned-compose-default-exemption'
        }));

        // Same four-service shape with a real rationale: silent. The bound must not be achieved by
        // suppressing the diagnostic altogether.
        expect(run({NEO_MODEL: 'model identity'})).toEqual([]);
    });

    test('Compose parity: shipped canonical profiles contain no matching defaults or census drift', async () => {
        const previousRoot = globalThis.Neo?.ai?.Config;

        if (previousRoot !== undefined) delete globalThis.Neo.ai.Config;

        try {
            expect(await detectComposeDefaultRestatements()).toEqual([]);
            expect(globalThis.Neo?.ai?.Config).toBeUndefined()
        } finally {
            if (previousRoot !== undefined) globalThis.Neo.ai.Config = previousRoot
        }
    });

    // ---- config leaf parity: a dropped leaf is silent at every other gate ----

    test('parity: the shipped tree matches its snapshot — no false positive on what is merged', async () => {
        await expect.poll(async () => {
            const parity = await detectConfigLeafParityViolations();

            return {
                added    : parity.added,
                missing  : parity.missing,
                untracked: parity.untracked,
                vanished : parity.vanished
            }
        }, {
            message: 'committed parity must settle after parallel on-disk lint fixtures are removed',
            timeout: 10_000
        }).toEqual({
            added    : {},
            missing  : {},
            untracked: [],
            vanished : []
        })
    });

    test('parity: the snapshot covers every server template plus the Tier-1 root', async () => {
        const expectedTemplates = [
            'ai/config.template.mjs',
            'ai/mcp/server/github-workflow/config.template.mjs',
            'ai/mcp/server/gitlab-workflow/config.template.mjs',
            'ai/mcp/server/knowledge-base/config.template.mjs',
            'ai/mcp/server/memory-core/config.template.mjs',
            'ai/mcp/server/neural-link/config.template.mjs'
        ];

        await expect.poll(async () => Object.keys(await buildConfigLeafParitySnapshot()).sort(), {
            message: 'template census must settle after parallel on-disk lint fixtures are removed',
            timeout: 10_000
        }).toEqual(expectedTemplates);

        // a base is read THROUGH its template, never listed as a surface of its own — it declares no
        // runtime namespace, and listing it would double-count every path it contributes
        const snapshot = await buildConfigLeafParitySnapshot();

        Object.keys(snapshot).forEach(template => expect(template).not.toContain('configBase.mjs'))
    });

    test('parity: the guarded surface is the UNION — an object-default leaf is not a primitive', () => {
        // `leaf({...})` classifies as a live proxy rather than a primitive, so guarding only
        // `primitiveLeafPaths` would leave 8 declarations across the servers unwatched — and they are
        // exactly the ones a reader counting `leaf(` calls assumes are covered. github-workflow:
        // 41 `leaf(` calls, 39 primitives, and `logger` + `discussionDenylist` sitting in the proxies.
        const declared = collectDeclaredConfigPaths(path.resolve(process.cwd(), 'ai/mcp/server/github-workflow/config.template.mjs'));

        expect(declared).toContain('logger');
        expect(declared).toContain('issueSync.discussionDenylist');
        // sorted + de-duplicated, so the snapshot diff is stable and reviewable
        expect(declared).toEqual([...new Set(declared)].sort())
    });

    test('parity: a REMOVED path is named, not counted', async () => {
        const actual   = await buildConfigLeafParitySnapshot(),
              template = 'ai/mcp/server/neural-link/config.template.mjs',
              expected = {...actual, [template]: [...actual[template], 'neural.link.ghostLeaf']};

        const parity = await detectConfigLeafParityViolations({expectation: expected});

        // the exact path, because "17 → 16" tells nobody which leaf died
        expect(parity.missing[template]).toEqual(['neural.link.ghostLeaf'])
    });

    test('parity: a RENAME fails — the count-only trap nets to zero and passes', async () => {
        const actual   = await buildConfigLeafParitySnapshot(),
              template = 'ai/mcp/server/neural-link/config.template.mjs',
              renamed  = [...actual[template].slice(1), 'neural.link.renamedLeaf'],
              parity   = await detectConfigLeafParityViolations({expectation: {...actual, [template]: renamed}});

        // same cardinality, different set: a count check sees nothing, which is precisely the refactor
        // that hides a loss
        expect(renamed.length).toBe(actual[template].length);
        expect(parity.missing[template]).toEqual(['neural.link.renamedLeaf']);
        expect(parity.added[template]?.length).toBe(1)
    });

    test('parity: a template absent from the snapshot is UNTRACKED, never silently adopted', async () => {
        const actual  = await buildConfigLeafParitySnapshot(),
              partial = {...actual};

        delete partial['ai/mcp/server/neural-link/config.template.mjs'];

        expect((await detectConfigLeafParityViolations({expectation: partial})).untracked)
            .toEqual(['ai/mcp/server/neural-link/config.template.mjs'])
    });

    test('parity: a template that VANISHED is caught — the per-template diff cannot see it', async () => {
        const expectation = {...await buildConfigLeafParitySnapshot(), 'ai/mcp/server/ghost/config.template.mjs': ['ghost.leaf']};

        // iterating what still exists can never notice what stopped existing
        expect((await detectConfigLeafParityViolations({expectation})).vanished)
            .toEqual(['ai/mcp/server/ghost/config.template.mjs'])
    });

    test('CLI: --update-parity is an explicit act, and reports the surface it recorded', () => {
        const result = spawnSync(process.execPath, [scriptPath, '--help'], {encoding: 'utf8'});

        // documented on the CLI it belongs to — a flag that rewrites the record of what the repo
        // declares must be discoverable, and must never be a --fix that runs as a side effect
        expect(result.stdout).toContain('--update-parity');
        expect(result.stdout).toContain('snapshot')
    });
});
