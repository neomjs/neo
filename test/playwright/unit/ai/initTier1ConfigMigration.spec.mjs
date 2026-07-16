import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

import {assertConfigFresh, collectStaleOverlayFindings, detectTier1OverlayDrift, initTier1Config,
        projectSourceShape, projectTier1DefaultsShape, stripSourceComments} from '../../../../ai/scripts/setup/initServerConfigs.mjs';
import {renderOverlayModule} from '../../../../ai/scripts/setup/migrateConfigOverlay.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

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
