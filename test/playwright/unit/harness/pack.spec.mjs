import {expect, test}             from '@playwright/test';
import {mkdtemp, rm}              from 'node:fs/promises';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir}                   from 'node:os';
import {
    BRAIN_TREES,
    TREE_EXCLUDES,
    assertNoInstanceOverlays,
    buildNodeShim,
    buildOrganismManifest,
    deriveCopySpecs,
    extractBarePackages,
    isInstanceOverlayPath
} from '../../../../harness/pack.mjs';
import {buildPackagedBrainEnv, resolveBrainMode} from '../../../../harness/brain.mjs';
import path                                      from 'node:path';

test.describe('harness pack stage', () => {
    test('deriveCopySpecs rides the contentPolicy allowlist plus the Brain trees, skipping node_modules entries', () => {
        const {files, trees} = deriveCopySpecs();

        for (const tree of BRAIN_TREES) {
            expect(trees).toContain(tree)
        }

        // Allowlist-derived: the renderer's source graph ships automatically.
        expect(trees).toContain('src');
        expect(trees).toContain('apps/agentos');
        expect(trees).toContain('dist/development/css');
        expect(files).toContain('resources/theme-map.json');
        expect(files).toContain('resources/images/logo/neo_logo_primary.svg');

        // node_modules-prefixed allowlist entries come from the staged dependency install.
        expect([...trees, ...files].some(entry => entry.includes('node_modules'))).toBe(false)
    });

    test('the Genesis probe is checkout-only without excluding runtime diagnostics wholesale', () => {
        expect(TREE_EXCLUDES).toContain('ai/scripts/diagnostics/genesisProbe.mjs');
        expect(TREE_EXCLUDES).not.toContain('ai/scripts/diagnostics');
        expect(TREE_EXCLUDES).not.toContain('ai/scripts/diagnostics/mcpHealthcheck.mjs')
    });

    test('extractBarePackages keeps package names only — no relative, builtin, alias, or subpath noise', () => {
        const source = [
            "import 'dotenv/config';",
            "import fs from 'node:fs';",
            "import path from 'path';",
            "import Neo from '../../src/Neo.mjs';",
            "import {x} from '#internal/alias';",
            "import Database from 'better-sqlite3';",
            "import {ChromaClient} from 'chromadb';",
            "export {y} from '@scope/pkg/deep/path.mjs';",
            "const lazy = await import('fs-extra');"
        ].join('\n');

        expect(extractBarePackages(source)).toEqual(['@scope/pkg', 'better-sqlite3', 'chromadb', 'dotenv', 'fs-extra'])
    });

    test('buildOrganismManifest pins scanned packages to repo-declared versions and fails loud on undeclared imports', () => {
        const repoPackageJson = {
            devDependencies: {'better-sqlite3': '^12.0.0', chromadb: '^3.5.0'},
            version        : '11.11.0'
        };

        const manifest = buildOrganismManifest({
            packages    : ['better-sqlite3', 'chromadb'],
            repoPackageJson,
            supplemental: []
        });

        expect(manifest.dependencies).toEqual({'better-sqlite3': '^12.0.0', chromadb: '^3.5.0'});
        expect(manifest.private).toBe(true);
        expect(manifest.type).toBe('module');

        expect(() => buildOrganismManifest({
            packages    : ['ghost-package'],
            repoPackageJson,
            supplemental: []
        })).toThrow(/no declared version.*ghost-package/)
    });

    test('the node shim fails loud without the runtime binary and execs it in node mode', () => {
        const shim = buildNodeShim();

        expect(shim.startsWith('#!/bin/sh')).toBe(true);
        expect(shim).toContain('NEO_HARNESS_ELECTRON_BIN:?');
        expect(shim).toContain('ELECTRON_RUN_AS_NODE=1 exec "$NEO_HARNESS_ELECTRON_BIN"')
    });

    test('buildPackagedBrainEnv is THE product profile: userData-rooted paths + the exact artifact lane closure', () => {
        const
            dataRoot = '/Users/someone/Library/Application Support/neo-harness/brain',
            env      = buildPackagedBrainEnv({dataRoot});

        for (const [name, value] of Object.entries(env)) {
            if (!name.endsWith('_ENABLED')) {
                expect(value.startsWith(dataRoot + path.sep)).toBe(true)
            }
        }

        // The lane closure is an EXACT contract: each OFF names a resource the artifact does not
        // carry (webpack, git-checkout semantics, external model servers, cwd-relative writers).
        // A new gate here means the artifact's product behavior changed — update deliberately.
        expect(Object.keys(env).filter(name => name.endsWith('_ENABLED')).sort()).toEqual([
            'NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED',
            'NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED',
            'NEO_ORCHESTRATOR_KB_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_LMS_ENABLED',
            'NEO_ORCHESTRATOR_MLX_ENABLED',
            'NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_OLLAMA_ENABLED',
            'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED'
        ]);

        // Product semantics, never test semantics: the embed/message organism lanes stay ON (no
        // gate present), and UNIT_TEST_MODE must never appear in a product profile.
        expect(env.NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED).toBeUndefined();
        expect(env.NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED).toBeUndefined();
        expect(env.UNIT_TEST_MODE).toBeUndefined();
        expect(env.NEO_CHROMA_DATA_DIR).toBeDefined();
        expect(env.NEO_AI_DB_PATH).toBeDefined()
    });

    test('resolveBrainMode: packaged double-click boots the Brain by default; checkout stays opt-in', () => {
        expect(resolveBrainMode({env: {}, packaged: true})).toBe(true);
        expect(resolveBrainMode({env: {NEO_HARNESS_BRAIN: '0'}, packaged: true})).toBe(false);
        expect(resolveBrainMode({env: {}, packaged: false})).toBe(false);
        expect(resolveBrainMode({env: {NEO_HARNESS_BRAIN: '1'}, packaged: false})).toBe(true)
    });

    // The security stop-line: a checkout's gitignored config overlay (which CAN carry hand-edited
    // operator credentials) must never reach the stage. The rule is DERIVED — any config.mjs with
    // a config.template.mjs sibling — so new server overlays are covered without enumeration.
    test('instance overlays are excluded by template-sibling derivation and the stage assertion fails loud on a sentinel', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-overlay-'));

        try {
            mkdirSync(path.join(root, 'ai', 'mcp', 'server', 'github-workflow'), {recursive: true});
            mkdirSync(path.join(root, 'ai', 'mcp', 'client'), {recursive: true});
            writeFileSync(path.join(root, 'ai', 'mcp', 'server', 'github-workflow', 'config.template.mjs'), 'export default {}', 'utf8');
            writeFileSync(path.join(root, 'ai', 'mcp', 'server', 'github-workflow', 'config.mjs'), "export default {token: 'SENTINEL_MUST_NOT_SHIP'}", 'utf8');
            writeFileSync(path.join(root, 'ai', 'mcp', 'client', 'config.mjs'), 'export default {}', 'utf8');

            // Overlay (template sibling) → excluded; tracked standalone config.mjs → ships.
            expect(isInstanceOverlayPath(root, path.join('ai', 'mcp', 'server', 'github-workflow', 'config.mjs'))).toBe(true);
            expect(isInstanceOverlayPath(root, path.join('ai', 'mcp', 'client', 'config.mjs'))).toBe(false);

            // The belt: a stage that somehow still contains the overlay fails the build loudly.
            expect(() => assertNoInstanceOverlays(root)).toThrow(/refusing to ship.*github-workflow/)
        } finally {
            await rm(root, {force: true, recursive: true})
        }
    })
});
