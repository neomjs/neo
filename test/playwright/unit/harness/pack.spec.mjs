import {expect, test} from '@playwright/test';
import {
    BRAIN_TREES,
    buildNodeShim,
    buildOrganismManifest,
    deriveCopySpecs,
    extractBarePackages
} from '../../../../harness/pack.mjs';
import {buildPackagedDataEnv} from '../../../../harness/brain.mjs';
import path                   from 'node:path';

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

    test('buildPackagedDataEnv moves every mutable Brain leaf under the per-user data root without gates or test mode', () => {
        const env = buildPackagedDataEnv({dataRoot: '/Users/someone/Library/Application Support/neo-harness/brain'});

        for (const value of Object.values(env)) {
            expect(value.startsWith('/Users/someone/Library/Application Support/neo-harness/brain' + path.sep)).toBe(true)
        }

        // The product profile is the REAL organism: no lane gates, no UNIT_TEST_MODE, no port shifts.
        expect(Object.keys(env).some(name => name.endsWith('_ENABLED'))).toBe(false);
        expect(env.UNIT_TEST_MODE).toBeUndefined();
        expect(env.NEO_CHROMA_DATA_DIR).toBeDefined();
        expect(env.NEO_AI_DB_PATH).toBeDefined()
    })
});
