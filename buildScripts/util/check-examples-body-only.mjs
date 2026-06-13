import fs   from 'node:fs';
import path from 'node:path';

/**
 * Pre-Flight (structural fast-path): `buildScripts/util/check-examples-body-only.mjs` matches the
 * sibling pattern of `buildScripts/util/check-shorthand.mjs`, `check-branch-discipline.mjs`, and
 * `check-whitespace.mjs` — all mechanical build-time CI hygiene checks living in `buildScripts/util/`.
 * Sibling-file-lift applies; no novel directory choice.
 *
 * @summary CI guard: top-level `examples/` is Body-only. Fails the merge-gate when a non-Body
 * (AI / harness / vanilla) example is placed under `examples/` — the exact class that breaks
 * `npm run build-all`.
 *
 * Why this guard exists: `build-all` enumerates examples via webpack's `parseFolder`
 * (`buildScripts/webpack/production/webpack.config.appworker.mjs`). It recursively walks `examples/`
 * and treats EVERY directory containing an `app.mjs` as a buildable Neo app, then `createStartingPoint`
 * builds each from its `neo-config.json` + `index.html` (it reads BOTH unconditionally). Two misplacement
 * classes break the build, and both surface only when `build-all` blows up or a human notices in review:
 *   1. A build target (an `app.mjs`-bearing dir) missing `neo-config.json` or `index.html` —
 *      `createStartingPoint` chokes (the vanilla / app-less comparator case).
 *   2. Any example under `examples/` that imports from `ai/` — an AI-domain example that belongs under
 *      `ai/examples/` (which the dev-server's `process.cwd()` static root still serves, so e2e keeps working).
 *
 * AI / harness / non-Body examples belong under `ai/examples/`. This guard converts the recurring
 * "build-all broke again" friction into an unmergeable red gate carrying an actionable, location-correcting message.
 */

// The Neo-app marker files `createStartingPoint` reads for every app.mjs build target — it reads BOTH
// unconditionally, so a missing either is the precise predicate for "build-all will choke on this dir".
const NEO_APP_BUILD_MARKERS = ['neo-config.json', 'index.html'];

const DIR_SKIP = new Set(['node_modules', 'dist', '.git']);

// Matches the specifier of `import … from '…'`, side-effect `import '…'`, `export … from '…'`, and
// dynamic `import('…')`. A guard-level regex is sufficient here; example code does not embed
// import-shaped string literals.
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * @summary Recursively collects every `.mjs` file and every `app.mjs`-bearing directory under `root`.
 * @param {String} root Absolute path to scan.
 * @returns {{mjsFiles: String[], buildTargets: String[]}}
 */
function walkExamples(root) {
    const mjsFiles = [], buildTargets = [];

    const visit = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, {withFileTypes: true});
        } catch (e) {
            return;
        }

        if (entries.some(entry => entry.isFile() && entry.name === 'app.mjs')) {
            buildTargets.push(dir);
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!DIR_SKIP.has(entry.name)) visit(path.join(dir, entry.name));
            } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
                mjsFiles.push(path.join(dir, entry.name));
            }
        }
    };

    visit(root);
    return {mjsFiles, buildTargets};
}

/**
 * @summary Finds Body-only violations under `examplesRoot`. Pure (no process exit) so it stays unit-testable.
 * @param {String} examplesRoot Absolute path to the top-level `examples/` directory.
 * @param {String} repoRoot     Absolute repo root (used to resolve the `ai/` boundary + relativize output).
 * @returns {{malformed: String[], aiImports: Array<{file: String, spec: String}>}}
 */
function findExamplesViolations(examplesRoot, repoRoot) {
    const aiDir                    = path.resolve(repoRoot, 'ai');
    const aiPrefix                 = aiDir + path.sep;
    const {mjsFiles, buildTargets} = walkExamples(examplesRoot);
    const malformed                = [];
    const aiImports                = [];

    for (const dir of buildTargets) {
        const missing = NEO_APP_BUILD_MARKERS.filter(marker => !fs.existsSync(path.join(dir, marker)));
        if (missing.length > 0) {
            malformed.push(`${path.relative(repoRoot, dir)} (missing ${missing.join(' + ')})`);
        }
    }

    for (const file of mjsFiles) {
        const source = fs.readFileSync(file, 'utf8');
        let match;
        IMPORT_SPECIFIER.lastIndex = 0;
        while ((match = IMPORT_SPECIFIER.exec(source)) !== null) {
            const spec = match[1];
            // Only relative specifiers can reach into the repo's ai/ tree; bare specifiers resolve elsewhere.
            if (!spec.startsWith('.')) continue;
            const resolved = path.resolve(path.dirname(file), spec);
            if (resolved === aiDir || resolved.startsWith(aiPrefix)) {
                aiImports.push({file: path.relative(repoRoot, file), spec});
            }
        }
    }

    return {malformed, aiImports};
}

function main() {
    const repoRoot     = process.cwd();
    const examplesRoot = path.join(repoRoot, 'examples');

    if (!fs.existsSync(examplesRoot)) {
        console.log('✅ PASS: no top-level examples/ directory to check.');
        process.exit(0);
    }

    const {malformed, aiImports} = findExamplesViolations(examplesRoot, repoRoot);

    if (malformed.length === 0 && aiImports.length === 0) {
        console.log('✅ PASS: top-level examples/ is Body-only — every app.mjs build target is a valid Neo app, and nothing imports from ai/.');
        process.exit(0);
    }

    console.error('❌ FAIL: top-level examples/ is Body-only — it is built by `npm run build-all` (each subtree with an app.mjs is built as a Neo app).');
    console.error('   AI / harness / non-Body examples belong under ai/examples/ (still served by the dev-server static root, so browser e2e keeps working).\n');

    if (malformed.length > 0) {
        console.error('  ▸ app.mjs build target(s) missing a required Neo-app file (neo-config.json and/or index.html) — build-all will choke on these:');
        malformed.forEach(entry => console.error(`      examples → ${entry}`));
        console.error('');
    }

    if (aiImports.length > 0) {
        console.error('  ▸ example file(s) importing from ai/ — AI-domain examples belong under ai/examples/:');
        aiImports.forEach(({file, spec}) => console.error(`      ${file}  →  ${spec}`));
        console.error('');
    }

    console.error(`Root: ${repoRoot}\n`);
    process.exit(1);
}

main();
