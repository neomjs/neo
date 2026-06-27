import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import path           from 'node:path';

import {
    AI_CONFIG_IMPLEMENTATION_BASELINE,
    AI_CONFIG_MODULE_SCOPE_BASELINE,
    BASELINE,
    buildConfigPathKindsByIdentifier,
    collectConfigPathKindsFromSource,
    detectAiConfigImplementationViolations,
    detectInlineEnvLeaves,
    detectModuleScopeAiConfigCaptures,
    lintAiConfigImplementationSsot,
    lintAiConfigModuleScopeCaptures,
    lintConfigTemplateSsot,
    runLint
} from '../../../../../../ai/scripts/lint/lint-config-template-ssot.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-config-template-ssot.mjs` — the guard that bans
 * inline `process.env` reads inside `leaf(...)` defaults in `config.template.mjs` files and
 * mechanical ADR-19 AiConfig implementation pass-through/defaulting violations.
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

    test('maps config.mjs imports to templates for module-scope capture classification', () => {
        const configPathKindsByIdentifier = buildConfigPathKindsByIdentifier({
            file  : 'ai/services/github-workflow/sync/IssueSyncer.mjs',
            source: `import aiConfig from '../../../mcp/server/github-workflow/config.mjs';`
        });

        expect(configPathKindsByIdentifier.get('aiConfig').liveProxyPaths.has('issueSync')).toBe(true);
        expect(configPathKindsByIdentifier.get('aiConfig').primitiveLeafPaths.has('issueSync.maxIssues')).toBe(true);
    });

    test('ignores invocation-time and function-local AiConfig reads', () => {
        const hits = detectModuleScopeAiConfigCaptures([
            `const isRemoteIngestTransport = () => aiConfig.transport === 'sse';`,
            `function getSnapshotPath() {`,
            `    const snapshotPath = AiConfig.orchestrator.deploymentStateBridge.snapshotPath;`,
            `    return snapshotPath;`,
            `}`
        ].join('\n'));

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

    test('a fresh (unbaselined) violation fails the lint', () => {
        const files = [fileOf(
            'ai/mcp/server/knowledge-base/config.template.mjs',
            `host: leaf(process.env.UNIT_TEST_MODE === 'true' ? 'a' : 'b', 'NEO_KB_HOST', 'string')`
        )];

        const {newViolations} = lintConfigTemplateSsot({files});

        expect(newViolations).toHaveLength(1);
        expect(newViolations[0].env).toBe('NEO_KB_HOST');
        expect(runLint({files}).exitCode).toBe(1);
    });

    test('a stale baseline row (reshape landed, no live violation) fails the lint', () => {
        const baseline = [{file: 'ai/config.template.mjs', env: 'NEO_GONE', ticket: '#12451', reshape: 'done'}];

        const {staleBaseline, newViolations} = lintConfigTemplateSsot({files: [], baseline});

        expect(newViolations).toHaveLength(0);
        expect(staleBaseline).toHaveLength(1);
        expect(runLint({files: [], baseline}).exitCode).toBe(1);
    });

    test('a baselined AiConfig implementation hit is suppressed (allowed boundary/burndown row)', () => {
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

    test('a fresh AiConfig implementation hit fails the combined lint', () => {
        const implementationFiles = [fileOf(
            'ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs',
            `limit = Math.max(0, Number(AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit) || 0),`
        )];

        const result = runLint({files: [], implementationFiles, implementationBaseline: []});

        expect(result.exitCode).toBe(1);
        expect(result.implementation.newViolations).toHaveLength(2);
        expect(result.implementation.newViolations.map(hit => hit.kind)).toEqual(['type-coercion', 'hidden-default']);
    });

    test('a baselined module-scope AiConfig primitive leaf capture is suppressed (documented P1 debt)', () => {
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

        const {violations, newViolations} = lintAiConfigModuleScopeCaptures({files, baseline});

        expect(violations).toHaveLength(1);
        expect(newViolations).toHaveLength(0);
    });

    test('a fresh module-scope AiConfig primitive leaf capture fails the combined lint', () => {
        const moduleScopeFiles = [fileOf(
            'ai/daemons/orchestrator/services/SelfHealFixture.mjs',
            [
                `import AiConfig from '../../../config.mjs';`,
                `const recoveryRunStateDir = AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir;`
            ].join('\n')
        )];

        const result = runLint({
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

    test('a fresh module-scope namespace proxy capture passes the combined lint', () => {
        const moduleScopeFiles = [fileOf(
            'ai/daemons/orchestrator/services/SelfHealFixture.mjs',
            [
                `import AiConfig from '../../../config.mjs';`,
                `const recoveryActuatorConfig = AiConfig.orchestrator.recoveryActuator;`
            ].join('\n')
        )];

        const result = runLint({
            files                 : [],
            implementationFiles   : [],
            implementationBaseline: [],
            moduleScopeFiles,
            moduleScopeBaseline   : []
        });

        expect(result.exitCode).toBe(0);
        expect(result.moduleScope.newViolations).toHaveLength(0);
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
});
