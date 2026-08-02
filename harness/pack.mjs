// The E6 pack stage: materializes the ORGANISM the packaged shell ships — the renderer's source
// graph (derived from the contentPolicy allowlist, one authority), the Brain tree, a generated
// dependency manifest (this repo declares ONLY devDependencies, so the runtime closure is derived
// from the bundled trees' bare imports), a pack-time-fresh instance config (killing the first-boot
// write into a possibly read-only resources dir), and a `node` shim so shebang children (the
// chroma CLI) run on the bundled Electron runtime via ELECTRON_RUN_AS_NODE — a stranger's machine
// carries no Node.
//
// Shell-ADR bindings implemented here (§2.5 — the E6 row):
//   §2.5.1  one double-clickable artifact wrapping the organism; the packaging root owns it
//   §2.5.2  the UNSIGNED leg only — signing material never enters repo tooling
//   §2.6    the bundled app layer is the SOURCE graph the allowlist names (NL possession), never
//           a minified bundle
//
// Native-module runtime decision (the arm this leaf owns, recorded on its ticket): Brain children
// run under ELECTRON_RUN_AS_NODE, and the staged node_modules is REBUILT for the bundled
// Electron's ABI via @electron/rebuild — scoped to the stage, never the checkout (rebuilding the
// shared dev node_modules is the recorded kill-the-dev-loop trap). A rebuild failure FAILS THE
// BUILD: ABI-compat of a system-Node build under electron-as-node is not a guaranteed contract
// (independent probes disagreed), and a silently mis-built native module is a broken artifact.

import {execFileSync}                               from 'node:child_process';
import fs                                           from 'node:fs';
import {builtinModules}                             from 'node:module';
import path                                         from 'node:path';
import {fileURLToPath}                              from 'node:url';
import {parse}                                      from 'acorn';
import {ALLOWED_EXACT_PATHS, ALLOWED_PATH_PREFIXES} from './contentPolicy.mjs';

const
    harnessDir = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot   = path.resolve(harnessDir, '..');

export const STAGE_DIR = path.join(harnessDir, '.stage', 'organism');

// Runtime trees the renderer allowlist cannot know about: the Brain, plus the single buildScripts
// module its entrypoints import (shipping the whole util dir would drag lint-tooling deps into the
// organism manifest). node_modules-prefixed allowlist entries are NOT copied — they come from the
// staged dependency install.
export const BRAIN_TREES = Object.freeze([
    'ai'
]);

export const BRAIN_FILES = Object.freeze([
    'buildScripts/util/sanitizer.mjs'
]);

// Coordinates inside staged trees that are NOT runtime surface. Entries may name a subtree or one
// exact file: demo/example apps carry demo deps; the temporal-summary daemon is not runtime-enabled;
// and the Genesis probe is a checkout-only operator command whose browser runtime is supplied by
// the checkout rather than the double-clickable organism. Runtime diagnostics stay staged.
export const TREE_EXCLUDES = Object.freeze([
    'ai/examples',
    'ai/daemons/temporal-summary',
    'ai/scripts/diagnostics/genesisProbe.mjs'
]);

/**
 * @summary True when a repo-relative path is a checkout-instance CONFIG OVERLAY — a `config.mjs`
 * with a `config.template.mjs` sibling. The template marks the overlay slot, so the rule is
 * DERIVED, never an enumerated list: every gitignored operator overlay (the top-level
 * `ai/config.mjs` AND each per-server `ai/mcp/server/<name>/config.mjs`) can carry hand-edited
 * credentials and must never ship; the stage regenerates fresh template-defaults instances. A tracked
 * standalone `config.mjs` (no template sibling) is ordinary source and ships normally.
 * @param {String} sourceRoot Absolute root the relative path resolves against.
 * @param {String} relativePath Repo-relative candidate path.
 * @returns {Boolean}
 */
export function isInstanceOverlayPath(sourceRoot, relativePath) {
    return path.basename(relativePath) === 'config.mjs' &&
        fs.existsSync(path.join(sourceRoot, path.dirname(relativePath), 'config.template.mjs'))
}

/**
 * @summary Belt-and-braces post-copy assertion: the staged tree must contain ZERO instance
 * overlays before the fresh-config generation runs. A filter regression here is a
 * credential-shipping vector, so it fails the build loudly rather than trusting one predicate.
 * @param {String} stageDir
 */
export function assertNoInstanceOverlays(stageDir) {
    const offenders = [];

    const walk = dir => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath)
            } else if (isInstanceOverlayPath(stageDir, path.relative(stageDir, fullPath))) {
                offenders.push(path.relative(stageDir, fullPath))
            }
        }
    };

    walk(stageDir);

    if (offenders.length > 0) {
        throw new Error(`pack: checkout instance overlay(s) reached the stage — refusing to ship: ${offenders.join(', ')}`)
    }
}

// Dependencies the bare-import scan cannot see: CSS-linked packages (fontawesome) and
// dynamic-provider modules resolved at runtime.
export const SUPPLEMENTAL_DEPENDENCIES = Object.freeze([
    '@chroma-core/default-embed',
    '@fortawesome/fontawesome-free'
]);

// Lazily-imported packages on modes the packaged product never enters (the MCP shared transport's
// HTTP/cloud leg) — ALSO phantom deps the repo never declares (they resolve transitively on dev
// machines; recorded finding). Excluded unless the repo declares them; a future mode enablement
// fails loudly at its own import site, never as a silent ship.
export const OPTIONAL_LAZY_PACKAGES = Object.freeze([
    'ajv',
    'cors'
]);

/**
 * @summary Derives the filesystem trees/files to stage from the renderer allowlist (URL-path
 * form) + the Brain set. One authority: a new allowlist prefix automatically ships.
 * @returns {{trees: String[], files: String[]}} repo-relative copy specs.
 */
export function deriveCopySpecs() {
    const
        trees = new Set(BRAIN_TREES),
        files = new Set();

    for (const prefix of ALLOWED_PATH_PREFIXES) {
        if (!prefix.startsWith('/node_modules/')) {
            trees.add(prefix.replace(/^\/|\/$/g, ''))
        }
    }

    for (const exact of ALLOWED_EXACT_PATHS) {
        if (!exact.startsWith('/node_modules/')) {
            files.add(exact.replace(/^\//, ''))
        }
    }

    BRAIN_FILES.forEach(file => files.add(file));

    return {files: [...files].sort(), trees: [...trees].sort()}
}

// npm package-name shape — rejects non-package specifiers before manifest projection.
const PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * @summary Extracts unique string-literal module specifiers from JavaScript syntax: static imports,
 * side-effect imports, re-exports, and dynamic `import()` expressions. Ordinary strings, template
 * text, comments, and non-literal dynamic expressions remain inert. Module syntax is attempted
 * first; a script fallback covers staged CommonJS sources. Unparseable source fails the pack loudly.
 * @param {String} source
 * @returns {String[]}
 */
export function extractLiteralImportSpecifiers(source) {
    const
        options = {allowHashBang: true, ecmaVersion: 'latest'},
        text    = String(source);

    let ast;

    try {
        ast = parse(text, {...options, sourceType: 'module'})
    } catch (moduleError) {
        try {
            ast = parse(text, {...options, allowReturnOutsideFunction: true, sourceType: 'script'})
        } catch (scriptError) {
            throw new SyntaxError(`pack import scan could not parse source as module (${moduleError.message}) or script (${scriptError.message})`)
        }
    }

    const specifiers = new Set();

    const visit = node => {
        if (!node || typeof node !== 'object') return;

        if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
            node.source?.type === 'Literal' && typeof node.source.value === 'string') {
            specifiers.add(node.source.value)
        } else if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
            specifiers.add(node.source.value)
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach(visit)
            } else if (value?.type) {
                visit(value)
            }
        }
    };

    visit(ast);

    return [...specifiers].sort()
}

/**
 * @summary Extracts direct or descendant `./` `.mjs` dependencies for the harness app.asar file
 * closure. Parent-root imports remain forbidden by the separate packaged-main contract.
 * @param {String} source
 * @returns {String[]}
 */
export function extractLocalMjsImports(source) {
    return extractLiteralImportSpecifiers(source)
        .filter(specifier => specifier.startsWith('./') && specifier.endsWith('.mjs'))
        .map(specifier => specifier.slice(2))
}

/**
 * @summary Extracts the BARE (package) import specifiers from one module source: static imports,
 * side-effect imports, re-exports, and string-literal dynamic imports. Relative (`./`), absolute,
 * subpath-alias (`#`), and node built-in specifiers are
 * excluded; non-npm-shaped candidates are dropped; subpath imports reduce to their package name
 * (`chromadb/x` → `chromadb`, `@scope/pkg/x` → `@scope/pkg`).
 * @param {String} source
 * @returns {String[]} unique package names.
 */
export function extractBarePackages(source) {
    const
        builtins = new Set(builtinModules),
        packages = new Set();

    for (const specifier of extractLiteralImportSpecifiers(source)) {
        if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#') || specifier.startsWith('node:')) {
            continue
        }

        const
            segments    = specifier.split('/'),
            packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];

        if (!builtins.has(packageName) && PACKAGE_NAME_RE.test(packageName)) {
            packages.add(packageName)
        }
    }

    return [...packages].sort()
}

/**
 * @summary Walks the staged runtime trees and collects every bare package import.
 * @param {Object} options
 * @param {String} options.rootDir Directory whose `.mjs`/`.cjs`/`.js` files are scanned.
 * @returns {String[]} unique package names across the tree.
 */
export function collectTreeBarePackages({rootDir}) {
    const packages = new Set();

    const walk = dir => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    walk(fullPath)
                }
            } else if (/\.(mjs|cjs|js)$/.test(entry.name)) {
                extractBarePackages(fs.readFileSync(fullPath, 'utf8')).forEach(name => packages.add(name))
            }
        }
    };

    walk(rootDir);
    return [...packages].sort()
}

/**
 * @summary Builds the organism's dependency manifest: every scanned bare package pinned to the
 * version the repo declares — under `devDependencies` of EITHER install-tier manifest. The root
 * `package.json` is no longer the whole authority since the tier split: the Brain runtime the
 * organism ships (Memory Core's `better-sqlite3`, the `chromadb` client) is declared in
 * `package.brain.json`, and a scan that cannot see it hard-errors exactly where a broken
 * artifact would otherwise ship. An import with NO declared version in either tier is a hard
 * error: the checkout would have failed too, and silence here would ship a broken artifact.
 * @param {Object} options
 * @param {String[]} options.packages Scanned package names.
 * @param {Object} options.repoPackageJson Parsed repo package.json.
 * @param {Object} [options.brainPackageJson] Parsed repo package.brain.json (Brain-tier authority).
 * @param {String[]} [options.supplemental=SUPPLEMENTAL_DEPENDENCIES]
 * @param {String[]} [options.optionalLazy=OPTIONAL_LAZY_PACKAGES]
 * @returns {Object} `{name, private, dependencies}` — the staged package.json.
 */
export function buildOrganismManifest({packages, repoPackageJson, brainPackageJson = null, supplemental = SUPPLEMENTAL_DEPENDENCIES, optionalLazy = OPTIONAL_LAZY_PACKAGES}) {
    const
        declared     = {...repoPackageJson.dependencies, ...repoPackageJson.devDependencies, ...brainPackageJson?.devDependencies},
        dependencies = {},
        missing      = [];

    for (const name of [...new Set([...packages, ...supplemental])].sort()) {
        if (declared[name]) {
            dependencies[name] = declared[name]
        } else if (!optionalLazy.includes(name)) {
            missing.push(name)
        }
    }

    if (missing.length > 0) {
        throw new Error(`organism manifest: no declared version for imported package(s): ${missing.join(', ')}`)
    }

    return {
        dependencies,
        name   : 'neo-harness-organism',
        private: true,
        type   : 'module',
        version: repoPackageJson.version ?? '0.0.0'
    }
}

/**
 * @summary The `node` PATH shim for shebang children (`#!/usr/bin/env node` — the chroma CLI): a
 * stranger's machine carries no Node, so the shim execs the packaged Electron binary in node mode.
 * The binary path arrives via env at spawn time (`NEO_HARNESS_ELECTRON_BIN`) because the install
 * location is unknowable at pack time.
 * @returns {String} POSIX shell shim source.
 */
export function buildNodeShim() {
    return [
        '#!/bin/sh',
        '# neo-harness organism shim: routes `node` shebangs onto the bundled Electron runtime.',
        ': "${NEO_HARNESS_ELECTRON_BIN:?NEO_HARNESS_ELECTRON_BIN is not set}"',
        'ELECTRON_RUN_AS_NODE=1 exec "$NEO_HARNESS_ELECTRON_BIN" "$@"',
        ''
    ].join('\n')
}

function copyTree(sourceRoot, targetRoot, relative) {
    const source = path.join(sourceRoot, relative);

    if (!fs.existsSync(source)) {
        throw new Error(`pack: staged tree missing in checkout: ${relative}`)
    }

    fs.cpSync(source, path.join(targetRoot, relative), {
        filter: entry => {
            const rel = path.relative(sourceRoot, entry);

            return !TREE_EXCLUDES.some(exclude => rel === exclude || rel.startsWith(exclude + path.sep)) &&
                !isInstanceOverlayPath(sourceRoot, rel) &&
                !/(^|\/)(node_modules|\.git)(\/|$)/.test(rel) &&
                !/(^|\/)\.env(\.|$)/.test(rel) &&
                !rel.endsWith('.DS_Store')
        },
        recursive: true
    })
}

function run(command, args, options = {}) {
    execFileSync(command, args, {stdio: 'inherit', ...options})
}

/**
 * @summary Stages the complete organism: trees + files (allowlist-derived), generated dependency
 * manifest + install, the @electron/rebuild attempt (falsifier-gated arm), the pack-time-fresh
 * instance config, and the node shim. Idempotent: the stage dir is rebuilt from scratch.
 * @param {Object} [options]
 * @param {String} [options.stageDir=STAGE_DIR]
 * @param {String} [options.electronVersion] Version for @electron/rebuild (harness devDep pin).
 * @returns {Object} build info (also written to `<stageDir>/organism-build-info.json`).
 */
export function stageOrganism({stageDir = STAGE_DIR, electronVersion} = {}) {
    if (!electronVersion) {
        throw new Error('pack: electronVersion is required — the staged natives MUST target the bundled runtime ABI.')
    }

    fs.rmSync(stageDir, {force: true, recursive: true});
    fs.mkdirSync(stageDir, {recursive: true});

    // Deterministic asset freshness: the stage copies dist/development/css AS-IS, and a stale
    // build renders the packaged window fully broken while every existence probe stays green
    // (live incident: a theming merge landed after the last local theme build). The artifact
    // never trusts checkout state — it rebuilds.
    console.log('[pack] building dev themes from current SCSS');
    run('node', ['buildScripts/build/themes.mjs', '-f', '-n', '-e', 'dev', '-t', 'all'], {cwd: repoRoot});

    const {files, trees} = deriveCopySpecs();

    for (const tree of trees) {
        copyTree(repoRoot, stageDir, tree)
    }

    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(stageDir, file)), {recursive: true});
        fs.copyFileSync(path.join(repoRoot, file), path.join(stageDir, file))
    }

    // Security stop-line: no checkout instance overlay may exist in the stage BEFORE the fresh
    // template-defaults generation below. Runs pre-install so the walk stays cheap.
    assertNoInstanceOverlays(stageDir);

    const
        repoPackageJson  = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')),
        brainPath        = path.join(repoRoot, 'package.brain.json'),
        brainPackageJson = fs.existsSync(brainPath) ? JSON.parse(fs.readFileSync(brainPath, 'utf8')) : null,
        packages         = [...new Set(trees.flatMap(tree => collectTreeBarePackages({rootDir: path.join(stageDir, tree)})))].sort(),
        manifest         = buildOrganismManifest({packages, repoPackageJson, brainPackageJson});

    fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(manifest, null, 4), 'utf8');

    console.log(`[pack] staged ${trees.length} trees + ${files.length} files; installing ${Object.keys(manifest.dependencies).length} organism dependencies`);
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: stageDir});

    // Mandatory ABI targeting: the staged natives rebuild for the bundled Electron. Failure fails
    // the build — a catch-and-ship here is a silently-broken-artifact vector.
    run('npx', ['@electron/rebuild', '--module-dir', stageDir, '--version', electronVersion], {cwd: harnessDir});

    const buildInfo = {electronVersion, rebuilt: true, stagedAt: new Date().toISOString()};

    // Pack-time-fresh instance config: template-current by construction, so the packaged first
    // boot never needs to WRITE into the (possibly read-only, translocated) resources dir.
    run('node', ['ai/scripts/setup/initServerConfigs.mjs'], {cwd: stageDir});

    const shimsDir = path.join(stageDir, 'shims');

    fs.mkdirSync(shimsDir, {recursive: true});
    fs.writeFileSync(path.join(shimsDir, 'node'), buildNodeShim(), {mode: 0o755});

    fs.writeFileSync(path.join(stageDir, 'organism-build-info.json'), JSON.stringify(buildInfo, null, 4), 'utf8');
    console.log(`[pack] organism staged at ${stageDir} (rebuilt=${buildInfo.rebuilt})`);
    return buildInfo
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    const electronVersion = JSON.parse(fs.readFileSync(path.join(harnessDir, 'package.json'), 'utf8')).devDependencies?.electron?.replace(/^[^0-9]*/, '');

    stageOrganism({electronVersion})
}
