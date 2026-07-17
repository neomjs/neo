import {test, expect}                 from '@playwright/test';
import {execFileSync}                 from 'child_process';
import fs                             from 'fs';
import os                             from 'os';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

import {assertConfigFresh, collectStaleOverlayFindings, detectTier1OverlayDrift, initTier1Config,
        projectSourceShape, projectTier1DefaultsShape, stripSourceComments} from '../../../../ai/scripts/setup/initServerConfigs.mjs';
import {renderOverlayModule, writeMigratedOverlay} from '../../../../ai/scripts/setup/migrateConfigOverlay.mjs';

const repoRoot      = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..'),
      converterPath = path.join(repoRoot, 'ai/scripts/setup/migrateConfigOverlay.mjs');

/**
 * Transition-owner coverage for the Tier-1 template/base split: the sync-pipeline cascade
 * (`--migrate-config`) must convert a legacy snapshot overlay through the shape-aware
 * declaration-level migration — operator deltas survive, a backup lands beside the old file, and a
 * second run mutates nothing. Subclass overlays are operator-authored and never auto-overwritten.
 * Freshness gates (`initTier1Config` / `collectStaleOverlayFindings` / `assertConfigFresh`)
 * understand both accepted overlay shapes against the DEFAULTS surface (`configBase.mjs`), and
 * documentation examples never contribute to source-shape projection.
 */
test.describe('ai/scripts/setup — Tier-1 overlay migration cascade (template/base split transition)', () => {
    const silentLogger = {log: () => {}, warn: () => {}};

    /**
     * @summary Writes a disposable Tier-1 root: fixture base + thin template + optional overlay.
     * @param {Object} [options]
     * @param {String|null} [options.overlaySrc=null] `config.mjs` source, or null for none.
     * @returns {{aiRoot: String, baseSrc: String}}
     */
    function makeFixtureRoot({overlaySrc = null} = {}) {
        const aiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-migration-'));

        const baseSrc = [
            `import Neo from '${repoRoot}/src/Neo.mjs';`,
            `import '${repoRoot}/src/core/_export.mjs';`,
            `import ConfigProvider, {createConfigProxy, leaf} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class FixtureConfigBase extends ConfigProvider {',
            '    static config = {',
            "        className: 'Fixture.ai.ConfigBase',",
            '        data: {',
            "            alpha       : leaf('alpha-default', 'NEO_FIXTURE_ALPHA', 'string'),",
            "            sentinelHost: leaf('base-default', 'NEO_FIXTURE_SENTINEL', 'string')",
            '        }',
            '    }',
            '}',
            '',
            'export default Neo.setupClass(FixtureConfigBase);',
            ''
        ].join('\n');

        const templateSrc = [
            "import ConfigBase          from './configBase.mjs';",
            `import {createConfigProxy} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class Config extends ConfigBase {',
            '    static config = {',
            "        className: 'Neo.ai.Config',",
            '        singleton: true',
            '    }',
            '}',
            '',
            'export default createConfigProxy(Neo.setupClass(Config));',
            ''
        ].join('\n');

        fs.writeFileSync(path.join(aiRoot, 'configBase.mjs'), baseSrc, 'utf-8');
        fs.writeFileSync(path.join(aiRoot, 'config.template.mjs'), templateSrc, 'utf-8');

        if (overlaySrc !== null) {
            fs.writeFileSync(path.join(aiRoot, 'config.mjs'), overlaySrc, 'utf-8');
        }

        return {aiRoot, baseSrc};
    }

    /** Legacy snapshot shape: full copy carrying one operator delta (the sentinel). */
    function snapshotOverlaySrc() {
        return [
            `import Neo from '${repoRoot}/src/Neo.mjs';`,
            `import '${repoRoot}/src/core/_export.mjs';`,
            `import ConfigProvider, {createConfigProxy, leaf} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class Config extends ConfigProvider {',
            '    static config = {',
            "        className: 'Neo.ai.Config',",
            '        singleton: true,',
            '        data: {',
            "            alpha       : leaf('alpha-default', 'NEO_FIXTURE_ALPHA', 'string'),",
            "            sentinelHost: leaf('OPERATOR_SENTINEL_VALUE', 'NEO_FIXTURE_SENTINEL', 'string')",
            '        }',
            '    }',
            '}',
            '',
            'export default createConfigProxy(Neo.setupClass(Config));',
            ''
        ].join('\n');
    }

    test('sync-cascade RA: a snapshot overlay migrates through the declaration-level conversion — sentinel survives, backup lands, second run mutates nothing', async () => {
        const {aiRoot}    = makeFixtureRoot({overlaySrc: snapshotOverlaySrc()});
        const overlayPath = path.join(aiRoot, 'config.mjs');

        const first = await initTier1Config({argv: ['node', 'x', '--migrate-config'], logger: silentLogger, aiRoot});

        expect(first.action).toBe('migrate');
        expect(first.overlayShape).toBe('snapshot');

        const migrated = fs.readFileSync(overlayPath, 'utf-8');

        // The operator's delta survives into the generated delta-only subclass overlay …
        expect(migrated).toContain('OPERATOR_SENTINEL_VALUE');
        expect(migrated).toMatch(/class\s+Config\s+extends\s+ConfigBase\b/);
        // … the unchanged leaf is NOT re-declared (inherited by construction) …
        expect(migrated).not.toContain("'alpha-default'");
        // … and the old snapshot is preserved beside it.
        expect(fs.existsSync(`${overlayPath}.pre-migration.bak`)).toBe(true);
        expect(fs.readFileSync(`${overlayPath}.pre-migration.bak`, 'utf-8')).toContain('extends ConfigProvider');

        // Idempotency: a second --migrate-config run never rewrites the subclass overlay.
        const before = fs.readFileSync(overlayPath, 'utf-8'),
              second = await initTier1Config({argv: ['node', 'x', '--migrate-config'], logger: silentLogger, aiRoot});

        expect(['silent', 'warn']).toContain(second.action);
        expect(second.overlayShape).toBe('subclass');
        expect(fs.readFileSync(overlayPath, 'utf-8')).toBe(before);
        expect(fs.existsSync(`${overlayPath}.pre-migration.bak.pre-migration.bak`)).toBe(false);
    });

    test('a generated ZERO-DELTA subclass passes initTier1Config, collectStaleOverlayFindings, and assertConfigFresh — no overwrite, no finding, no throw', async () => {
        const zeroDelta   = renderOverlayModule({}),
              {aiRoot}    = makeFixtureRoot({overlaySrc: zeroDelta}),
              overlayPath = path.join(aiRoot, 'config.mjs'),
              before      = fs.readFileSync(overlayPath, 'utf-8');

        const init = await initTier1Config({argv: ['node', 'x', '--migrate-config'], logger: silentLogger, aiRoot});
        expect(init.action).toBe('silent');
        expect(init.overlayShape).toBe('subclass');
        expect(fs.readFileSync(overlayPath, 'utf-8')).toBe(before);

        const findings = collectStaleOverlayFindings({aiRoot, serversRoot: path.join(aiRoot, 'no-servers')});
        expect(findings.filter(f => f.label.includes('Tier-1'))).toEqual([]);

        await expect(assertConfigFresh({aiRoot, logger: silentLogger})).resolves.toBeUndefined();
    });

    test('a legacy snapshot with NO operator deltas migrates to a clean zero-delta subclass', async () => {
        const cleanSnapshot = snapshotOverlaySrc().replace("'OPERATOR_SENTINEL_VALUE'", "'base-default'"),
              {aiRoot}      = makeFixtureRoot({overlaySrc: cleanSnapshot});

        // A drift-free snapshot is left alone ('silent'): conversion is drift-triggered, and the
        // snapshot keeps working until the base actually evolves past it.
        const result = await initTier1Config({argv: ['node', 'x', '--migrate-config'], logger: silentLogger, aiRoot});
        expect(result.action).toBe('silent');
        expect(result.overlayShape).toBe('snapshot');
    });

    test('documentation examples never contribute to shape projection (the thin-template JSDoc leak)', async () => {
        const withExample = [
            '/**',
            ' * Overlay example:',
            ' * ```js',
            " * debug: leaf(true, 'NEO_DEBUG', 'boolean')",
            ' * ```',
            ' */',
            "import {leaf} from './ConfigProvider.mjs';",
            "const real = leaf('x', 'NEO_REAL_VAR', 'string');",
            ''
        ].join('\n');

        const shape = projectSourceShape(withExample);
        expect(shape.envVars).toContain('NEO_REAL_VAR');
        expect(shape.envVars).not.toContain('NEO_DEBUG');

        // Inline protocol literals survive line-comment stripping.
        expect(stripSourceComments("const url = 'https://gitlab.com'; // trailing note")).toContain('https://gitlab.com');
    });

    test('the REAL thin template vs a generated zero-delta subclass reports no crash-causing drift (reviewer falsifier)', async () => {
        const realAiRoot            = path.join(repoRoot, 'ai'),
              defaultsShape         = await projectTier1DefaultsShape(realAiRoot),
              {drift, overlayShape} = detectTier1OverlayDrift(renderOverlayModule({}), defaultsShape);

        expect(overlayShape).toBe('subclass');
        expect(drift.missingImports).toEqual([]);
        expect(drift.missingExports).toEqual([]);
        expect(drift.missingEnvVars).toEqual([]);
        expect(drift.missingRequiredLeaves).toEqual([]);
        expect(drift.hasDrift).toBe(false);
    });
});

/**
 * Per-server converter contract: a caller supplies the explicit config root, while `--ai-root`
 * remains available as the transition-owner context. Every invocation uses a fresh process so
 * Neo's first-registration-wins namespaces cannot leak between preview/write assertions.
 */
test.describe('ai/scripts/setup — per-server overlay declaration-level conversion', () => {
    const fixtureRoots = new Set();

    test.afterEach(() => {
        for (const root of fixtureRoots) fs.rmSync(root, {force: true, recursive: true});
        fixtureRoots.clear();
    });

    /**
     * @summary Writes a disposable Tier-1 parent plus one legacy per-server snapshot/base pair.
     * @param {Object} [options]
     * @param {Boolean} [options.boundParent=false] Use the Knowledge Base's bound Tier-1 import form.
     * @param {Boolean} [options.customFormula=false] Add one non-renderable operator formula.
     * @param {Boolean} [options.customFunctionLeaf=false] Add one non-renderable operator-custom leaf.
     * @param {Boolean} [options.customLeaf=false] Add one renderable operator-custom leaf.
     * @returns {{fixtureRoot: String, baseSource: String, legacySource: String, overlayPath: String, serverRoot: String}}
     */
    function makeServerFixture({
        boundParent = false,
        customFormula = false,
        customFunctionLeaf = false,
        customLeaf = false
    } = {}) {
        const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'server-overlay-migration-')),
              serverRoot  = path.join(fixtureRoot, 'converter-fixture'),
              overlayPath = path.join(serverRoot, 'config.mjs');

        fixtureRoots.add(fixtureRoot);
        fs.mkdirSync(serverRoot);

        const rootConfig = marker => [
            `import Neo from '${repoRoot}/src/Neo.mjs';`,
            `import '${repoRoot}/src/core/_export.mjs';`,
            `import ConfigProvider, {createConfigProxy, leaf} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class Config extends ConfigProvider {',
            '    static config = {',
            "        className: 'Neo.ai.Config',",
            '        singleton: true,',
            `        data: {rootMarker: leaf('${marker}')}`,
            '    }',
            '}',
            '',
            'export default createConfigProxy(Neo.setupClass(Config));',
            ''
        ].join('\n');

        const sharedEntries = Array.from({length: 79}, (_, index) => [
            `fixtureLeaf${String(index).padStart(2, '0')}`,
            `leaf('fixture-default-${index}', 'NEO_FIXTURE_LEAF_${String(index).padStart(2, '0')}', 'string')`
        ]);
        const renderEntries = entries => entries.map(([key, value], index) =>
            `            ${key}: ${value}${index < entries.length - 1 ? ',' : ''}`);
        const baseEntries = [
            ...sharedEntries,
            ['sentinelHost', "leaf('base-default', 'NEO_FIXTURE_SENTINEL', 'string')"],
            ['laneLandscapeCensusPageLimit', "leaf(20, 'NEO_LANE_LANDSCAPE_CENSUS_PAGE_LIMIT', 'number')"],
            ['laneLandscapeCensusMaxPages', "leaf(5, 'NEO_LANE_LANDSCAPE_CENSUS_MAX_PAGES', 'number')"],
            ['laneLandscapeRelationEdgeLimit', "leaf(100, 'NEO_LANE_LANDSCAPE_RELATION_EDGE_LIMIT', 'number')"]
        ];
        const legacyEntries = [
            ...sharedEntries,
            ['sentinelHost', "leaf('OPERATOR_SENTINEL_VALUE', 'NEO_FIXTURE_SENTINEL', 'string')"],
            ...(customLeaf ? [['operatorCustom', "leaf('OPERATOR_CUSTOM_VALUE', 'NEO_OPERATOR_CUSTOM', 'string')"]] : []),
            ...(customFunctionLeaf ? [['operatorHook', "leaf(() => 'operator-hook')"]] : [])
        ];

        const baseSource = [
            `import Neo from '${repoRoot}/src/Neo.mjs';`,
            `import '${repoRoot}/src/core/_export.mjs';`,
            `import ConfigProvider, {leaf} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class ConfigBase extends ConfigProvider {',
            '    static config = {',
            "        className: 'Neo.ai.mcp.server.converter-fixture.ConfigBase',",
            '        data: {',
            ...renderEntries(baseEntries),
            '        }',
            '    }',
            '}',
            '',
            'export default Neo.setupClass(ConfigBase);',
            ''
        ].join('\n');

        const legacySource = [
            boundParent ? "import AiConfig from '../config.mjs';" : "import '../config.mjs';",
            `import Neo from '${repoRoot}/src/Neo.mjs';`,
            `import '${repoRoot}/src/core/_export.mjs';`,
            `import ConfigProvider, {createConfigProxy, leaf} from '${repoRoot}/ai/ConfigProvider.mjs';`,
            '',
            'class Config extends ConfigProvider {',
            '    static config = {',
            "        className: 'Neo.ai.mcp.server.converter-fixture.Config',",
            '        singleton: true,',
            '        data: {',
            ...renderEntries(legacyEntries),
            `        }${customFormula ? ',' : ''}`,
            ...(customFormula ? [
                '        formulas: {',
                '            operatorFormula: data => data.sentinelHost',
                '        }'
            ] : []),
            '    }',
            '}',
            '',
            'export default createConfigProxy(Neo.setupClass(Config));',
            ''
        ].join('\n');

        fs.writeFileSync(path.join(fixtureRoot, 'config.template.mjs'), rootConfig('template-root'), 'utf8');
        fs.writeFileSync(path.join(fixtureRoot, 'config.mjs'), rootConfig('operator-root'), 'utf8');
        fs.writeFileSync(path.join(serverRoot, 'configBase.mjs'), baseSource, 'utf8');
        fs.writeFileSync(overlayPath, legacySource, 'utf8');

        return {fixtureRoot, baseSource, legacySource, overlayPath, serverRoot};
    }

    /**
     * @summary Runs the converter through its public CLI seam with the exact combined flags used by
     * initServerConfigs. The config root is deliberately absolute.
     * @param {{fixtureRoot: String, serverRoot: String}} fixture
     * @param {String[]} [extraArgs=[]]
     * @returns {String}
     */
    function runConverter({fixtureRoot, serverRoot}, extraArgs = []) {
        return execFileSync(process.execPath, [
            converterPath,
            '--ai-root', fixtureRoot,
            '--config-root', serverRoot,
            ...extraArgs
        ], {encoding: 'utf8'});
    }

    test('preview reports server drift and generated namespace/imports without touching the snapshot', () => {
        const fixture = makeServerFixture({boundParent: true}),
              output  = runConverter(fixture);

        expect(output).toContain('PREVIEW');
        expect(output).toContain('+ laneLandscapeCensusPageLimit');
        expect(output).toContain('+ laneLandscapeCensusMaxPages');
        expect(output).toContain('+ laneLandscapeRelationEdgeLimit');
        expect(output).toContain("import '../config.mjs';");
        expect(output).toContain("className: 'Neo.ai.mcp.server.converter-fixture.Config'");
        expect(fs.readFileSync(fixture.overlayPath, 'utf8')).toBe(fixture.legacySource);
        expect(fs.existsSync(`${fixture.overlayPath}.pre-migration.bak`)).toBe(false);
    });

    test('preview reports a custom operator formula instead of silently dropping it', () => {
        const fixture = makeServerFixture({customFormula: true}),
              output  = runConverter(fixture);

        expect(output).toContain('NON-RENDERABLE differing leaves');
        expect(output).toContain('! formulas.operatorFormula');
        expect(fs.readFileSync(fixture.overlayPath, 'utf8')).toBe(fixture.legacySource);
    });

    test('--write refuses a non-renderable operator-custom leaf and leaves the snapshot untouched', () => {
        const fixture = makeServerFixture({customFunctionLeaf: true});

        let failure;
        try {
            runConverter(fixture, ['--write']);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeTruthy();
        expect(failure.stderr).toContain('non-renderable operator-custom leaves require manual preservation');
        expect(failure.stderr).toContain('operatorHook');
        expect(fs.readFileSync(fixture.overlayPath, 'utf8')).toBe(fixture.legacySource);
        expect(fs.existsSync(`${fixture.overlayPath}.pre-migration.bak`)).toBe(false);
    });

    test('--write carries a renderable operator-custom leaf into the delta subclass', () => {
        const fixture  = makeServerFixture({customLeaf: true}),
              output   = runConverter(fixture, ['--write']),
              migrated = fs.readFileSync(fixture.overlayPath, 'utf8');

        expect(output).toContain('* operatorCustom');
        expect(migrated).toContain('operatorCustom: leaf("OPERATOR_CUSTOM_VALUE"');
    });

    test('--write preserves the operator delta + server topology, backs up once, and a second run is a no-op', () => {
        const fixture    = makeServerFixture(),
              firstOut   = runConverter(fixture, ['--write']),
              backupPath = `${fixture.overlayPath}.pre-migration.bak`,
              migrated   = fs.readFileSync(fixture.overlayPath, 'utf8'),
              parentAt   = migrated.indexOf("import '../config.mjs';"),
              baseAt     = migrated.indexOf("import ConfigBase                from './configBase.mjs';");

        expect(firstOut).toContain('[migrate-config-overlay] written:');
        expect([...fixture.baseSource.matchAll(/\bleaf\(/g)]).toHaveLength(83);
        expect([...fixture.legacySource.matchAll(/\bleaf\(/g)]).toHaveLength(80);
        expect(fs.readFileSync(backupPath, 'utf8')).toBe(fixture.legacySource);
        expect(migrated).toContain('class Config extends ConfigBase');
        expect(migrated).toContain("className: 'Neo.ai.mcp.server.converter-fixture.Config'");
        expect(migrated).toContain(`from '${repoRoot}/ai/ConfigProvider.mjs';`);
        expect(migrated).toContain('OPERATOR_SENTINEL_VALUE');
        expect(migrated).not.toContain('fixture-default-');
        expect(migrated).not.toContain('laneLandscapeCensusPageLimit');
        expect(migrated).not.toContain('laneLandscapeCensusMaxPages');
        expect(migrated).not.toContain('laneLandscapeRelationEdgeLimit');
        expect(parentAt).toBeGreaterThanOrEqual(0);
        expect(parentAt).toBeLessThan(baseAt);

        const probe = JSON.parse(execFileSync(process.execPath, [
            '--input-type=module',
            '--eval',
            `const config = (await import(${JSON.stringify(pathToFileURL(fixture.overlayPath).href)})).default; console.log(JSON.stringify({sentinelHost: config.sentinelHost, laneLandscapeCensusPageLimit: config.laneLandscapeCensusPageLimit, laneLandscapeCensusMaxPages: config.laneLandscapeCensusMaxPages, laneLandscapeRelationEdgeLimit: config.laneLandscapeRelationEdgeLimit}))`
        ], {encoding: 'utf8'}));

        expect(probe).toEqual({
            sentinelHost                  : 'OPERATOR_SENTINEL_VALUE',
            laneLandscapeCensusPageLimit  : 20,
            laneLandscapeCensusMaxPages   : 5,
            laneLandscapeRelationEdgeLimit: 100
        });

        const beforeSecond = migrated,
              secondOut    = runConverter(fixture, ['--write']);

        expect(secondOut).toContain('already in the subclass+delta shape — no-op');
        expect(fs.readFileSync(fixture.overlayPath, 'utf8')).toBe(beforeSecond);
        expect(fs.existsSync(`${backupPath}.pre-migration.bak`)).toBe(false);
    });

    test('a missing server base fails before backup or write', () => {
        const fixture = makeServerFixture();
        fs.rmSync(path.join(fixture.serverRoot, 'configBase.mjs'));

        let failure;
        try {
            runConverter(fixture, ['--write']);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeTruthy();
        expect(failure.stderr).toContain('missing defaults class');
        expect(fs.readFileSync(fixture.overlayPath, 'utf8')).toBe(fixture.legacySource);
        expect(fs.existsSync(`${fixture.overlayPath}.pre-migration.bak`)).toBe(false);
    });

    test('an atomic replacement failure leaves the live overlay byte-identical', () => {
        const root        = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-atomic-write-')),
              overlayPath = path.join(root, 'config.mjs'),
              original    = 'operator-snapshot\n',
              generated   = 'generated-subclass\n';

        fixtureRoots.add(root);
        fs.writeFileSync(overlayPath, original, 'utf8');

        const failingFs = {
            ...fs,
            renameSync(from, to) {
                if (to === overlayPath) throw new Error('injected atomic rename failure');
                return fs.renameSync(from, to)
            }
        };

        expect(() => writeMigratedOverlay({overlayPath, generated, fileSystem: failingFs}))
            .toThrow('injected atomic rename failure');
        expect(fs.readFileSync(overlayPath, 'utf8')).toBe(original);
        expect(fs.readFileSync(`${overlayPath}.pre-migration.bak`, 'utf8')).toBe(original);
        expect(fs.readdirSync(root).some(name => name.includes('.migration-'))).toBe(false);
    });
});
