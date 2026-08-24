import {expect, test}             from '@playwright/test';
import * as yaml                  from 'js-yaml';
import {mkdtemp, readFile, rm}    from 'node:fs/promises';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir}                   from 'node:os';
import {fileURLToPath}            from 'node:url';
import {
    BRAIN_TREES,
    TREE_EXCLUDES,
    assertNoInstanceOverlays,
    buildNodeShim,
    buildOrganismManifest,
    collectTreeBarePackages,
    deriveCopySpecs,
    extractBarePackages,
    extractLiteralImportSpecifiers,
    extractLocalMjsImports,
    isInstanceOverlayPath
} from '../../../../harness/pack.mjs';
import {buildPackagedBrainEnv, resolveBrainMode} from '../../../../harness/brain.mjs';
import path                                      from 'node:path';

/**
 * @summary Traverses the packaged main-process `.mjs` graph from one entry file. Relative literals
 * are resolved against their importing source, so nested modules cannot spell the same harness-root
 * escape at a different depth. Missing local modules and lexical root escapes fail loudly; bare
 * imports and expression-based dynamic loaders stay outside this static closure contract.
 * @param {Object} options
 * @param {String} options.entryFile Absolute entry-module path.
 * @param {String} options.harnessRoot Absolute packaged-main root.
 * @returns {Promise<String[]>} Harness-relative POSIX module paths.
 */
async function collectPackagedMainModules({entryFile, harnessRoot}) {
    const
        root    = path.resolve(harnessRoot),
        visited = new Set();

    const visit = async (modulePath, importer = null, specifier = null) => {
        const
            resolved = path.resolve(modulePath),
            relative = path.relative(root, resolved),
            outside  = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

        if (outside) {
            const source = importer ? path.relative(root, importer).split(path.sep).join('/') : '<entry>';

            throw new Error(`packaged harness source ${source} imports outside harness root: ${specifier ?? resolved}`)
        }

        if (visited.has(resolved)) {
            return
        }

        visited.add(resolved);

        let source;

        try {
            source = await readFile(resolved, 'utf8')
        } catch (error) {
            throw new Error(`packaged harness local module is missing: ${relative.split(path.sep).join('/')} (${error.code ?? error.message})`)
        }

        for (const literal of extractLiteralImportSpecifiers(source)) {
            if (literal.startsWith('.') && literal.endsWith('.mjs')) {
                await visit(path.resolve(path.dirname(resolved), literal), resolved, literal)
            }
        }
    };

    await visit(entryFile);

    return [...visited]
        .map(file => path.relative(root, file).split(path.sep).join('/'))
        .sort()
}

/**
 * @summary Fails when the electron-builder app.asar manifest omits any recursively discovered
 * packaged-main module.
 * @param {Object} options
 * @param {String} options.builderConfig Raw electron-builder YAML.
 * @param {String[]} options.modules Harness-relative module closure.
 * @returns {void}
 */
function assertPackagedMainModulesDeclared({builderConfig, modules}) {
    const declared = yaml.load(builderConfig)?.files;

    if (!Array.isArray(declared)) {
        throw new Error('electron-builder files closure is missing or invalid')
    }

    const
        manifest = new Set(declared.filter(entry => typeof entry === 'string')),
        missing  = modules.filter(module => !manifest.has(module));

    if (missing.length) {
        throw new Error(`electron-builder files closure omits packaged main module(s): ${missing.join(', ')}`)
    }
}

/**
 * @summary Writes a small source graph under an isolated fixture root.
 * @param {String} root
 * @param {Object<String, String>} modules Relative path to source map.
 * @returns {void}
 */
function writeModuleFixture(root, modules) {
    for (const [relativePath, source] of Object.entries(modules)) {
        const target = path.join(root, relativePath);

        mkdirSync(path.dirname(target), {recursive: true});
        writeFileSync(target, source, 'utf8')
    }
}

test.describe('harness pack stage', () => {
    test('packaged main imports are closed over app.asar and parent-root contracts are forbidden', async () => {
        const
            harnessRoot                 = fileURLToPath(new URL('../../../../harness/', import.meta.url)),
            [builderConfig, mainSource] = await Promise.all([
                readFile(path.join(harnessRoot, 'electron-builder.yml'), 'utf8'),
                readFile(path.join(harnessRoot, 'main.mjs'), 'utf8')
            ]);

        const modules = await collectPackagedMainModules({
            entryFile: path.join(harnessRoot, 'main.mjs'),
            harnessRoot
        });

        expect(modules).toEqual([
            'adapterWitness.mjs',
            'appLifecycle.mjs',
            'brain.mjs',
            'contentPolicy.mjs',
            'fleetCapability.mjs',
            'main.mjs'
        ]);
        expect(() => assertPackagedMainModulesDeclared({builderConfig, modules})).not.toThrow();
        expect(mainSource).toContain('loadFleetRuntimeContracts(organismRoot)')
    });

    test('source-relative traversal rejects nested and normalized harness-root escapes', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-main-escape-'));

        try {
            writeModuleFixture(root, {
                'main.mjs'   : "import './tools/x.mjs';",
                'tools/x.mjs': ''
            });

            for (const specifier of ['../../ai/Agent.mjs', '../middle/../../src/Neo.mjs']) {
                writeModuleFixture(root, {'tools/x.mjs': `import '${specifier}';`});

                await expect(collectPackagedMainModules({
                    entryFile  : path.join(root, 'main.mjs'),
                    harnessRoot: root
                })).rejects.toThrow(/tools\/x\.mjs imports outside harness root/)
            }
        } finally {
            await rm(root, {force: true, recursive: true})
        }
    });

    test('source-relative traversal fails loudly when a local module is missing', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-main-missing-'));

        try {
            writeModuleFixture(root, {'main.mjs': "import './missing.mjs';"});

            await expect(collectPackagedMainModules({
                entryFile  : path.join(root, 'main.mjs'),
                harnessRoot: root
            })).rejects.toThrow(/local module is missing: missing\.mjs/)
        } finally {
            await rm(root, {force: true, recursive: true})
        }
    });

    test('source-relative traversal terminates cycles through its visited set', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-main-cycle-'));

        try {
            writeModuleFixture(root, {
                'cycle/a.mjs': "export {value} from '../main.mjs';",
                'main.mjs'   : "import './cycle/a.mjs';"
            });

            await expect(collectPackagedMainModules({
                entryFile  : path.join(root, 'main.mjs'),
                harnessRoot: root
            })).resolves.toEqual(['cycle/a.mjs', 'main.mjs'])
        } finally {
            await rm(root, {force: true, recursive: true})
        }
    });

    test('one syntax authority expands every literal module shape while expressions and prose stay inert', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-main-syntax-'));

        try {
            writeModuleFixture(root, {
                'all.mjs'    : 'export const all = true;',
                'dynamic.mjs': 'export default null;',
                'main.mjs'   : [
                    "import StaticDefault from './static.mjs';",
                    "import './side-effect.mjs';",
                    "export {named} from './named.mjs';",
                    "export * from './all.mjs';",
                    "const lazy = import('./dynamic.mjs');",
                    "const prose = \"import './ordinary-string.mjs'\";",
                    "const template = `export * from './template.mjs'`;",
                    'const runtime = import(runtimeSpecifier);',
                    "// import './line-comment.mjs';",
                    "/* import('./block-comment.mjs'); */",
                    "import 'bare-package';"
                ].join('\n'),
                'named.mjs'      : 'export const named = true;',
                'side-effect.mjs': 'void 0;',
                'static.mjs'     : 'export default null;'
            });

            const modules = await collectPackagedMainModules({
                entryFile  : path.join(root, 'main.mjs'),
                harnessRoot: root
            });

            expect(modules).toEqual([
                'all.mjs',
                'dynamic.mjs',
                'main.mjs',
                'named.mjs',
                'side-effect.mjs',
                'static.mjs'
            ]);
            expect(() => assertPackagedMainModulesDeclared({
                builderConfig: yaml.dump({files: modules}),
                modules
            })).not.toThrow();
            expect(() => assertPackagedMainModulesDeclared({
                builderConfig: yaml.dump({files: ['main.mjs']}),
                modules
            })).toThrow(/omits packaged main module/)
        } finally {
            await rm(root, {force: true, recursive: true})
        }
    });

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

    test('extractLiteralImportSpecifiers follows syntax without matching strings, templates, comments, or expressions', () => {
        const source = [
            "import StaticDefault from './static-default.mjs';",
            "import './side-effect.mjs';",
            "export {named} from './re-export.mjs';",
            "export * from './re-export-all.mjs';",
            "const lazy = import('./dynamic.mjs');",
            "const prose = \"import './ordinary-string.mjs'\";",
            "const sentence = \"value from './ordinary-from.mjs'\";",
            "const template = `export * from './template.mjs'`;",
            "const runtime = import(runtimeSpecifier);",
            "// import './line-comment.mjs';",
            "/* import('./block-comment.mjs'); */"
        ].join('\n');

        expect(extractLiteralImportSpecifiers(source)).toEqual([
            './dynamic.mjs',
            './re-export-all.mjs',
            './re-export.mjs',
            './side-effect.mjs',
            './static-default.mjs'
        ])
    });

    test('extractLocalMjsImports covers every literal local module shape without parsing comments or expressions', () => {
        const source = [
            "import StaticDefault from './static-default.mjs';",
            "export {named} from './re-export.mjs';",
            "import './side-effect.mjs';",
            "const lazy = import('./dynamic.mjs');",
            "const variable = import(runtimeSpecifier);",
            "import '../outside-root.mjs';",
            "// import './line-comment.mjs';",
            "/* import './block-comment.mjs'; */",
            "import 'bare-package';"
        ].join('\n');

        expect(extractLocalMjsImports(source)).toEqual([
            'dynamic.mjs',
            're-export.mjs',
            'side-effect.mjs',
            'static-default.mjs'
        ])
    });

    test('collectTreeBarePackages scans staged mjs, cjs, and js files through the shared syntax scanner', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'neo-pack-import-scan-'));

        try {
            writeFileSync(path.join(root, 'module.mjs'), [
                "import MjsPackage from 'mjs-package';",
                "const prose = \"import 'mjs-ghost'\";"
            ].join('\n'), 'utf8');
            writeFileSync(path.join(root, 'common.cjs'), [
                "void import('cjs-package/subpath');",
                "// import('cjs-ghost');"
            ].join('\n'), 'utf8');
            writeFileSync(path.join(root, 'plain.js'), [
                "export {value} from '@scope/js-package/deep/path.mjs';",
                "const runtime = import(runtimeSpecifier);"
            ].join('\n'), 'utf8');

            expect(collectTreeBarePackages({rootDir: root})).toEqual([
                '@scope/js-package',
                'cjs-package',
                'mjs-package'
            ])
        } finally {
            await rm(root, {force: true, recursive: true})
        }
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

    test('buildOrganismManifest reads the Brain-tier manifest as dependency authority (the tier split)', () => {
        // The root package.json is no longer the whole authority: the Brain runtime the organism
        // ships is declared in package.brain.json. A scan that cannot see it must hard-error —
        // that was the review falsifier this witness pins.
        const repoPackageJson  = {devDependencies: {webpack: '^5.0.0'}, version: '13.1.0'},
              brainPackageJson = {devDependencies: {'better-sqlite3': '12.11.1', chromadb: '3.5.0'}};

        const manifest = buildOrganismManifest({
            packages    : ['better-sqlite3', 'chromadb', 'webpack'],
            repoPackageJson,
            brainPackageJson,
            supplemental: []
        });

        expect(manifest.dependencies).toEqual({'better-sqlite3': '12.11.1', chromadb: '3.5.0', webpack: '^5.0.0'});

        // Without the brain authority the same scan fails loud — never a silently broken artifact.
        expect(() => buildOrganismManifest({
            packages    : ['better-sqlite3'],
            repoPackageJson,
            supplemental: []
        })).toThrow(/no declared version.*better-sqlite3/)
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

        // The ONE non-path, non-gate key: the declared authority role. It is named
        // here rather than pattern-exempted — the loop's guarantee is "every mutable PATH is
        // userData-rooted", and an exemption that admits a whole shape would let the next
        // unrooted path in silently.
        const NON_PATH_KEYS = ['NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE'];

        for (const [name, value] of Object.entries(env)) {
            if (!name.endsWith('_ENABLED') && !NON_PATH_KEYS.includes(name)) {
                expect(value.startsWith(dataRoot + path.sep), `${name} must be userData-rooted`).toBe(true)
            }
        }

        // The artifact declares its authority: `authorityProfile` carries no leaf default, so an
        // undeclared role is a REFUSED launch — the packaged product boot would not start at all.
        // `container-plane` names what the ON-by-omission set below already is; it is the authority
        // class, not a claim about running in a container.
        expect(env.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE).toBe('container-plane');

        // The lane closure is an EXACT contract: each OFF names a resource the artifact does not
        // carry (webpack, git-checkout semantics, external model servers, cwd-relative writers).
        // A new gate here means the artifact's product behavior changed — update deliberately.
        expect(Object.keys(env).filter(name => name.endsWith('_ENABLED')).sort()).toEqual([
            'NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED',
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
