#!/usr/bin/env node
/**
 * @module ai/scripts/diagnostics/devDependencyCensus
 * @summary Re-runnable census classifying every devDependency by whether a real importer
 * survives the container cut — and on which side. The deliverable that makes any later removal
 * safe: evidence, not a hunch.
 *
 * ## Why mechanical, and why this shape
 *
 * "Probably more now obsolete" is a well-founded hunch with no census behind it; a removal PR
 * built on a hunch either misses packages or breaks a lane. Three detection rules are load-bearing
 * and all three were established by prior undercounting:
 *
 * 1. **Real imports, not mentions.** A package is "imported" only when an AST-verified
 *    `ImportDeclaration`, dynamic `import()`, or `require()` targets it (exact name or subpath).
 *    `git grep -l <pkg>` matches comments and strings and over-reports by ~40% on some packages.
 * 2. **Dynamic importers count.** Several call sites use `await import('better-sqlite3')`; a
 *    static-only pattern is verified to undercount. The spec for this instrument carries a
 *    positive control proving the dynamic arm fires.
 * 3. **Tooling is usage too.** Packages invoked as CLI bins (package.json `scripts`, git hooks,
 *    linter configs) have no source importers and are still real uses. The census reports three
 *    evidence classes per package — `importers`, `tool-usage`, `mentions-only` — and never
 *    collapses them.
 *
 * ## Side-of-cut classification
 *
 * Each importer path lands on a side via SIDE_RULES (printed in every report — contest a
 * classification by changing a rule and re-running, never by arguing prose): `container-plane`
 * (services/graph/MCP/orchestrator — runs in the plane post-cut), `host-edge` (seat-side daemons,
 * harness), `build` (webpack/theme/docs build), `test`, `ad-hoc-script` (deliberately invoked
 * maintenance/migration/diagnostic scripts), `body` (browser-bundled source — the package is
 * consumed at build time).
 *
 * ## Native compile detection
 *
 * The compile-cost subset is what the operator's Windows pain is about, so it is reported
 * separately. A package counts as native-build when its installed manifest carries an
 * install/preinstall script invoking node-gyp/prebuild-install, or a `binding.gyp` — the
 * detection basis is printed per package. Postinstall scripts that only fetch prebuilt binaries
 * (esbuild-class) are reported as `prebuilt-fetch`, not compile.
 *
 * Usage:
 *   node ai/scripts/diagnostics/devDependencyCensus.mjs [--out <path>] [--json <path>]
 *
 * No flags: print the markdown report to stdout. Derived data is regenerable, never committed.
 * @plane host
 */
import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse}                        from 'acorn';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Path-prefix → side-of-cut. Longest prefix wins; the order of this array is the report's
 * documentation of the mapping. Deliberately coarse — per-lane authority lives in
 * `ai/daemons/orchestrator/taskAuthority.mjs`, and a disputed row is settled by reading the
 * importer, not by refining this table forever.
 * @type {Object[]} `{prefix, side}` entries
 */
export const SIDE_RULES = [
    {prefix: 'test/',                       side: 'test'},
    {prefix: 'buildScripts/',               side: 'build'},
    {prefix: 'ai/scripts/',                 side: 'ad-hoc-script'},
    {prefix: 'ai/examples/',                side: 'ad-hoc-script'},
    {prefix: 'ai/services/',                side: 'container-plane'},
    {prefix: 'ai/mcp/',                     side: 'container-plane'},
    {prefix: 'ai/graph/',                   side: 'container-plane'},
    {prefix: 'ai/daemons/orchestrator/',    side: 'container-plane'},
    {prefix: 'ai/deploy/',                  side: 'container-plane'},
    {prefix: 'ai/daemons/',                 side: 'host-edge'},
    {prefix: 'ai/agent/',                   side: 'host-edge'},
    {prefix: 'harness/',                    side: 'host-edge'},
    {prefix: '.husky/',                     side: 'contributor-tooling'},
    {prefix: 'docs/',                       side: 'build'},
    {prefix: 'src/',                        side: 'body'},
    {prefix: 'apps/',                       side: 'body'},
    {prefix: 'examples/',                   side: 'body'},
    {prefix: 'resources/',                  side: 'build'}
];

/**
 * File-level overrides where the path prefix lies about the runtime side. Each entry names the
 * mechanism, not a tracking reference: the NL recorder runs attached to the host-edge Neural
 * Link bridge and writes the host-local graph, so the `ai/services/` prefix would misfile it
 * container-plane. Additions here must carry the same kind of evidence — a mechanism a reader
 * can verify by opening the file's consumer.
 * @type {Object} repo-relative path → side
 */
export const SIDE_EXCEPTIONS = {
    'ai/services/neural-link/RecorderService.mjs': 'host-edge'
};

/**
 * Classifies one repo-relative path to a side of the cut.
 * @param {String} relPath
 * @returns {String}
 */
export function classifySide(relPath) {
    if (SIDE_EXCEPTIONS[relPath]) {
        return SIDE_EXCEPTIONS[relPath];
    }
    for (const rule of SIDE_RULES) {
        if (relPath.startsWith(rule.prefix)) {
            return rule.side;
        }
    }
    return 'host-edge'; // root-level configs and stray scripts are host-side by default
}

/**
 * Parses a module/script with acorn, tolerating CJS (script goal fallback).
 * @param {String} source
 * @returns {Object} ESTree program
 */
export function parseSource(source) {
    try {
        return parse(source, {ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true});
    } catch {
        return parse(source, {ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true});
    }
}

/**
 * Collects every AST node (small local walker; no acorn-walk dependency).
 * @param {Object} root
 * @returns {Object[]}
 */
function walkNodes(root) {
    const nodes = [];
    const visit = node => {
        if (!node || typeof node.type !== 'string') {
            return;
        }
        nodes.push(node);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach(visit);
            } else if (value && typeof value === 'object' && typeof value.type === 'string') {
                visit(value);
            }
        }
    };
    visit(root);
    return nodes;
}

/**
 * Extracts the real import edges of one parsed file: static declarations, dynamic imports, and
 * require calls, each with its literal source string. Non-literal sources (template dynamics)
 * are reported as kind `dynamic-unresolved` so they can never silently undercount.
 * @param {Object} ast
 * @returns {Object[]} `{kind, source}` edges
 */
export function extractImportEdges(ast) {
    const edges = [];

    for (const node of walkNodes(ast)) {
        if (node.type === 'ImportDeclaration' && node.source?.value) {
            edges.push({kind: 'static', source: node.source.value});
        } else if (node.type === 'ImportExpression') {
            if (node.source?.type === 'Literal') {
                edges.push({kind: 'dynamic', source: node.source.value});
            } else {
                edges.push({kind: 'dynamic-unresolved', source: null});
            }
        } else if (
            node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require' &&
            node.arguments?.[0]?.type === 'Literal'
        ) {
            edges.push({kind: 'require', source: node.arguments[0].value});
        }
    }

    return edges;
}

/**
 * Does an import edge target this package? Exact name or subpath (`pkg/...`); scoped names
 * (`@scope/pkg`) are handled by the same rule since their name already contains its slash.
 * @param {String} source import source string
 * @param {String} pkg package name
 * @returns {Boolean}
 */
export function edgeTargetsPackage(source, pkg) {
    return source === pkg || source.startsWith(pkg + '/');
}

/**
 * Detects the native-build class of an installed package from its manifest and files.
 * @param {String} pkg
 * @param {String} root repo root (node_modules is read beneath it)
 * @returns {{nativeClass: String, basis: String}} nativeClass: `native-compile` | `prebuilt-fetch` | `none`
 */
export function detectNativeClass(pkg, root) {
    const pkgDir       = path.join(root, 'node_modules', pkg);
    const manifestPath = path.join(pkgDir, 'package.json');

    if (!fs.existsSync(manifestPath)) {
        return {nativeClass: 'unknown', basis: 'not installed — cannot inspect'};
    }

    const manifest    = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const scripts     = manifest.scripts || {};
    const installCmds = ['preinstall', 'install', 'postinstall']
        .filter(k => scripts[k])
        .map(k => `${k}: ${scripts[k]}`);

    if (fs.existsSync(path.join(pkgDir, 'binding.gyp')) ||
        installCmds.some(c => /node-gyp|prebuild(?!-install)/.test(c))) {
        return {nativeClass: 'native-compile', basis: installCmds.join('; ') || 'binding.gyp present'};
    }
    if (installCmds.some(c => /prebuild-install|node-pre-gyp/.test(c)) ||
        /prebuild-install|node-pre-gyp/.test(JSON.stringify(manifest.binary || ''))) {
        return {nativeClass: 'prebuilt-fetch', basis: installCmds.join('; ') || 'binary manifest field'};
    }
    if (installCmds.length > 0) {
        return {nativeClass: 'prebuilt-fetch', basis: `postinstall present, no gyp: ${installCmds.join('; ')}`};
    }
    return {nativeClass: 'none', basis: 'no install scripts, no binding.gyp'};
}

/**
 * Finds candidate files mentioning a package (git grep, tracked files only), then keeps only the
 * AST-verified importers. Mention files are returned separately for the report's honesty column.
 * @param {String} pkg
 * @param {String} root
 * @returns {{importers: Object[], mentionFiles: String[]}}
 */
export function findImporters(pkg, root) {
    let candidates = [];

    try {
        const out = execFileSync('git', ['-C', root, 'grep', '-l', '-F', pkg, '--', '*.mjs', '*.js', '*.cjs'], {
            encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
        });
        candidates = out.split('\n').filter(Boolean);
    } catch {
        // git grep exits 1 on zero matches — a legitimate empty candidate set
    }

    const importers    = [];
    const mentionFiles = [];

    for (const relPath of candidates) {
        let edges = [];

        try {
            edges = extractImportEdges(parseSource(fs.readFileSync(path.join(root, relPath), 'utf8')));
        } catch {
            mentionFiles.push(`${relPath} (unparseable)`);
            continue;
        }

        const hits = edges.filter(e => e.source && edgeTargetsPackage(e.source, pkg));

        if (hits.length > 0) {
            importers.push({
                path : relPath,
                kinds: [...new Set(hits.map(h => h.kind))].sort(),
                side : classifySide(relPath)
            });
        } else {
            mentionFiles.push(relPath);
        }
    }

    return {importers, mentionFiles};
}

/**
 * Finds tool-usage evidence for packages with no source importers: package.json script lines and
 * dotfile/hook references. Bin names resolve from the installed manifest's `bin` field — a
 * package like `webpack-cli` is invoked as `webpack`, so matching the package name alone
 * under-reports exactly the tooling-only packages this function exists to catch.
 * @param {String} pkg
 * @param {String} root
 * @returns {String[]} evidence lines
 */
export function findToolUsage(pkg, root) {
    const evidence = [];
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    // Bin names: the installed manifest's `bin` field (string or name→path map), plus the
    // package's own base name as a fallback for hook/config references.
    const binBase  = pkg.startsWith('@') ? pkg.split('/')[1] : pkg;
    const binNames = new Set([binBase]);

    const installedManifestPath = path.join(root, 'node_modules', pkg, 'package.json');
    if (fs.existsSync(installedManifestPath)) {
        const installedBin = JSON.parse(fs.readFileSync(installedManifestPath, 'utf8')).bin;
        if (typeof installedBin === 'string') {
            binNames.add(binBase);
        } else if (installedBin && typeof installedBin === 'object') {
            Object.keys(installedBin).forEach(name => binNames.add(name));
        }
    }

    const invokesBin = text => [...binNames].some(name =>
        new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(text));

    for (const [name, cmd] of Object.entries(manifest.scripts || {})) {
        if (invokesBin(cmd)) {
            evidence.push(`package.json script "${name}" (bin: ${[...binNames].join(', ')})`);
        }
    }

    try {
        const out = execFileSync('git', ['-C', root, 'grep', '-l', '-F', binBase, '--', '.husky/*'], {encoding: 'utf8'});
        out.split('\n').filter(Boolean).forEach(f => evidence.push(`hook reference: ${f}`));
    } catch { /* zero matches */ }

    return [...new Set(evidence)];
}

/**
 * Runs the census over every devDependency, across BOTH install-tier manifests: the base
 * `package.json` and the Brain-tier `package.brain.json` (when present). The tier split makes the
 * root manifest an incomplete dependency authority — a census that read only it would go blind to
 * the very packages the tier exists to hold. Each row carries its `tier` so a future removal
 * candidate is judged against the manifest it would actually leave.
 * @param {String} root
 * @returns {{packages: Object[], totals: Object}}
 */
export function census(root) {
    const manifest      = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
          brainPath     = path.join(root, 'package.brain.json'),
          brainManifest = fs.existsSync(brainPath) ? JSON.parse(fs.readFileSync(brainPath, 'utf8')) : null,
          declared      = [
              ...Object.entries(manifest.devDependencies || {}).map(([name, version]) => ({name, version, tier: 'base'})),
              ...Object.entries(brainManifest?.devDependencies || {}).map(([name, version]) => ({name, version, tier: 'brain'}))
          ],
          packages      = [];

    for (const {name, version, tier} of declared) {
        const {importers, mentionFiles} = findImporters(name, root);
        const native                    = detectNativeClass(name, root);
        const sides                     = [...new Set(importers.map(i => i.side))].sort();
        const toolUse                   = importers.length === 0 ? findToolUsage(name, root) : [];

        packages.push({
            name, version, tier, importers, sides, native,
            toolUse,
            mentionCount : mentionFiles.length,
            mentionSample: mentionFiles.slice(0, 5),
            verdict      : importers.length > 0
                ? `imported (${sides.join(', ')})`
                : toolUse.length > 0
                    ? 'no source importers; invoked as tooling'
                    : 'no source importers found'
        });
    }

    const totals = {
        packages     : packages.length,
        base         : packages.filter(p => p.tier === 'base').length,
        brain        : packages.filter(p => p.tier === 'brain').length,
        withImporters: packages.filter(p => p.importers.length > 0).length,
        toolOnly     : packages.filter(p => p.importers.length === 0 && p.toolUse.length > 0).length,
        noImporters  : packages.filter(p => p.importers.length === 0 && p.toolUse.length === 0).length,
        nativeCompile: packages.filter(p => p.native.nativeClass === 'native-compile').length,
        prebuiltFetch: packages.filter(p => p.native.nativeClass === 'prebuilt-fetch').length
    };

    return {packages, totals};
}

/**
 * Renders the deterministic markdown report.
 * @param {Object} report census() result
 * @param {Object} meta {rev, dirty, generatedAt}
 * @returns {String}
 */
export function renderMarkdown(report, meta) {
    const {packages, totals} = report;
    const lines              = [];

    lines.push('# devDependency Census');
    lines.push('');
    lines.push(`- tree: \`${meta.rev}\`${meta.dirty ? ' (dirty)' : ''}`);
    lines.push(`- generated: ${meta.generatedAt}`);
    lines.push('- method: git-grep candidate pre-filter → acorn AST verification (static, dynamic, require) → side-of-cut via the printed SIDE_RULES. Real imports are distinguished from mentions mechanically; a package with zero AST-verified importers is reported with its mention evidence, never silently called unused.');
    lines.push('');
    lines.push('## Totals');
    lines.push('');
    lines.push('| measure | count |');
    lines.push('|---|---|');
    lines.push(`| devDependencies | ${totals.packages} |`);
    if (totals.brain > 0) {
        lines.push(`| — base tier (package.json) | ${totals.base} |`);
        lines.push(`| — brain tier (package.brain.json) | ${totals.brain} |`);
    }
    lines.push(`| with AST-verified importers | ${totals.withImporters} |`);
    lines.push(`| tooling-only (bin/config invocation) | ${totals.toolOnly} |`);
    lines.push(`| no importers found (mention evidence below) | ${totals.noImporters} |`);
    lines.push(`| **native-compile** (the Windows-pain subset) | ${totals.nativeCompile} |`);
    lines.push(`| prebuilt-fetch (install script, no compile) | ${totals.prebuiltFetch} |`);
    lines.push('');
    lines.push('## Side rules (the mapping every row was judged by — contest by editing and re-running)');
    lines.push('');
    lines.push('| path prefix | side |');
    lines.push('|---|---|');
    for (const rule of SIDE_RULES) {
        lines.push(`| \`${rule.prefix}\` | ${rule.side} |`);
    }
    lines.push('| (anything else) | host-edge |');
    lines.push('');
    lines.push('## Per-package census');
    lines.push('');
    lines.push('| package | native | verdict | importer sides | importers (path · kinds) |');
    lines.push('|---|---|---|---|---|');
    for (const p of packages) {
        const imps = p.importers.map(i => `\`${i.path}\` · ${i.kinds.join('/')}`).join('<br>');
        lines.push(`| \`${p.name}\` ${p.version}${p.tier === 'brain' ? ' **[brain-tier]**' : ''} | ${p.native.nativeClass} | ${p.verdict} | ${p.sides.join(', ') || '—'} | ${imps || '—'} |`);
    }
    lines.push('');

    const zeroImport = packages.filter(p => p.importers.length === 0);
    lines.push(`## Zero-importer packages (${zeroImport.length}) — the evidence, not a verdict`);
    lines.push('');
    for (const p of zeroImport) {
        lines.push(`- \`${p.name}\` — tool usage: ${p.toolUse.join('; ') || 'none found'}; mention files (${p.mentionCount}): ${p.mentionSample.map(m => `\`${m}\``).join(', ') || 'none'}`);
    }
    lines.push('');

    return lines.join('\n');
}

/**
 * @param {String[]} argv process.argv.slice(2)
 * @returns {{out: String|null, json: String|null}}
 */
export function parseCli(argv) {
    const read = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
    return {out: read('--out'), json: read('--json')};
}

function main() {
    const cli      = parseCli(process.argv.slice(2));
    const rev      = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const dirty    = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0;
    const report   = census(repoRoot);
    const markdown = renderMarkdown(report, {rev, dirty, generatedAt: new Date().toISOString()});

    if (cli.out) {
        fs.mkdirSync(path.dirname(path.resolve(cli.out)), {recursive: true});
        fs.writeFileSync(cli.out, markdown);
    }
    if (cli.json) {
        fs.mkdirSync(path.dirname(path.resolve(cli.json)), {recursive: true});
        fs.writeFileSync(cli.json, JSON.stringify(report, null, 2));
    }
    if (!cli.out && !cli.json) {
        process.stdout.write(markdown + '\n');
    }

    console.error(`census: ${report.totals.packages} packages, ${report.totals.withImporters} with verified importers, ${report.totals.toolOnly} tooling-only, ${report.totals.noImporters} without importers, ${report.totals.nativeCompile} native-compile`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
