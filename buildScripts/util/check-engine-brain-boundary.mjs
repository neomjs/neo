import * as acorn      from 'acorn';
import {execFileSync}  from 'node:child_process';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');
const BASELINE   = path.join(__dirname, 'check-engine-brain-boundary-baseline.json');

/**
 * @module buildScripts/util/check-engine-brain-boundary
 * @summary Enforces the one-way engine → Brain dependency direction, with a burndown baseline.
 *
 * ## The boundary
 *
 * `neomjs/neo` is the **engine** — the framework, its build pipeline, and the published package.
 * `ai/` is the **Brain** — swarm services, MCP servers, daemons. The direction is one-way by design:
 * the Brain may consume the engine; the engine must not consume the Brain.
 *
 * The sharpest consequence is concrete rather than aesthetic: `buildScripts/release/publish.mjs`
 * performs the atomic `dev` → `main` release commit and cannot run without `ai/services.host.mjs`,
 * so releasing the framework requires the agent OS to be present and importable.
 *
 * `src/**` does NOT cross, and `src/ai/**` is the reason that statement needs care rather than a
 * grep. It is the engine's own AI layer — the one sanctioned seam by which the Body connects to the
 * Brain — and it is engine code. An import of `../ai/Client.mjs` from `src/worker/App.mjs` resolves
 * *there*, not to the Brain.
 *
 * ## Two detector defects this guard was built through, both worth keeping visible
 *
 * **Text shape is not resolution.** The first predicate matched `/^(?:\.\.\/)+ai\//` on the specifier
 * alone. `../ai/Client.mjs` resolves to the Brain from `buildScripts/` and to `src/ai/` from
 * `src/worker/` — same text, opposite answers. That produced a confident, wrong finding that the
 * engine runtime crosses. Specifiers are now joined to the importing file's directory and normalised
 * before anything is decided.
 *
 * **`from`-anchored sweeps cannot see a dynamic import.** Three earlier hand-greps missed
 * `buildScripts/devCockpit.mjs` entirely for this reason, which is why this reads
 * `ImportDeclaration` / `ImportExpression` nodes from the parse tree rather than matching text.
 *
 * ## Why a baseline rather than a clean gate
 *
 * Nine crossings across seven files, one of them the release path. Relocating them is multi-step
 * work; a gate failing on all nine from day one is a gate that gets disabled.
 *
 * The baseline exempts known debt — it is NOT the assertion. The check asserts the property: an
 * import from a file the baseline does not cover fails, so a new crossing in a new file cannot pass
 * by leaving the listed ones intact. A snapshot used as the assertion would reproduce the exact
 * failure that made this ticket a case study.
 *
 * The ratchet is deliberately symmetric. A baselined entry that no longer violates must ALSO leave
 * the baseline, or the file becomes a list of things that used to be true: a burndown failing only
 * upward lets the recorded count drift above the real one, and then it is fiction. Both directions
 * fail here, and rows carry `count` so a partial burndown cannot hide behind a surviving key.
 */

/**
 * The trees this guard reads, as the SSOT for its own scan surface. The CI workflow's `paths:`
 * filter and the scan-root parity spec both derive from this export rather than restating it.
 *
 * The invariant is scanned ⊆ watched: a guard whose watched paths drift below its scanned paths
 * runs late and misattributed — present, correct, and never triggered by the change that broke it,
 * then firing on some unrelated PR that happens to touch a watched path.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['buildScripts/**/*.mjs', 'src/**/*.mjs']);

/**
 * The roots {@link SCAN_SURFACE} covers, in the form `git ls-files` takes.
 * @type {String[]}
 */
const SCAN_ROOTS = Object.freeze(['buildScripts', 'src']);

/**
 * @summary Does this specifier, resolved from this file, land in the Brain?
 *
 * **Resolution, not text shape.** The first version of this test matched `/^(?:\.\.\/)+ai\//` on the
 * specifier alone, and that is wrong in a way that reads as correct: `../ai/Client.mjs` means
 * completely different things depending on where it is written. From `buildScripts/devCockpit.mjs`
 * it resolves to the Brain at `ai/`. From `src/worker/App.mjs` it resolves to **`src/ai/Client.mjs`**
 * — the engine's own AI layer, the single sanctioned seam by which the Body connects to the Brain,
 * and unambiguously engine code.
 *
 * That false positive convicted `src/worker/App.mjs` and produced a confident, wrong claim that the
 * engine runtime crosses the boundary. A path question answered by a text pattern will keep being
 * wrong at exactly the places where the answer matters, so the specifier is now joined to the
 * importing file's directory and normalised before anything is decided.
 *
 * @param {String} file Repo-relative path of the importing file.
 * @param {String} specifier The module specifier as written.
 * @returns {Boolean} True only when the resolved path lies under the top-level `ai/` tree.
 */
function resolvesIntoBrain(file, specifier) {
    if (!specifier.startsWith('.')) {
        return false
    }

    const resolved = path.normalize(path.join(path.dirname(file), specifier)).split(path.sep).join('/');

    return resolved === 'ai' || resolved.startsWith('ai/')
}

/**
 * @summary Pure predicate: which `(file, specifier)` pairs cross the boundary?
 *
 * Reads **import declarations from the AST**, not text. The first draft of this guard regex-matched
 * `from '…'` over raw source and immediately convicted its own JSDoc, which quotes two specifiers as
 * examples — it only surfaced once the file became tracked and the guard could see itself. Masking
 * comments would have fixed that instance; taking the specifier from the parse tree removes the
 * whole class, because a comment or a prose string is not an `ImportDeclaration`. It also means any
 * future file that *documents* this boundary cannot be convicted for describing it.
 *
 * Covers static `import`, re-export forms (`export … from`, `export * from`), and dynamic
 * `import('…')` with a literal argument. A dynamic import built from a variable is out of reach here
 * and out of scope: it is not a shape any of the six real crossings use.
 *
 * Split from the filesystem walk so the rule is unit-testable against source strings, and so a
 * red-proof can plant a crossing import without writing one into the tree.
 *
 * @param {String} source File contents.
 * @param {String} file Repo-relative path, used only for reporting.
 * @returns {Array<{file: String, specifier: String, line: Number}>}
 */
export function findBrainImports(source, file) {
    let ast;

    try {
        ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true})
    } catch {
        // Unparseable source is not this guard's problem to report — `check-parse` owns that, and
        // failing here would convert one defect into two confusing ones.
        return []
    }

    const findings = [];

    walk(ast, node => {
        const isImportish = node.type === 'ImportDeclaration'     ||
                            node.type === 'ExportNamedDeclaration' ||
                            node.type === 'ExportAllDeclaration'   ||
                            node.type === 'ImportExpression';

        if (!isImportish) {
            return
        }

        const specifier = node.source?.value;

        if (typeof specifier === 'string' && resolvesIntoBrain(file, specifier)) {
            findings.push({file, specifier, line: node.loc.start.line})
        }
    });

    return findings
}

/**
 * Minimal AST walk — every own-enumerable child node, depth-first. Sufficient because the nodes of
 * interest are declarations and expressions, not a narrow subset needing a visitor table.
 * @param {Object} node
 * @param {Function} visit
 */
function walk(node, visit) {
    if (!node || typeof node.type !== 'string') {
        return
    }

    visit(node);

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach(child => walk(child, visit))
        } else if (value && typeof value === 'object') {
            walk(value, visit)
        }
    }
}

/**
 * Identity of a baselined crossing. Deliberately `file` + `specifier` and NOT the line number: a
 * line moves whenever anything above it is edited, which would turn every unrelated edit into a
 * baseline churn commit.
 * @param {Object} entry
 * @returns {String}
 */
const crossingKey = entry => `${entry.file}::${entry.specifier}`;

/**
 * @summary Collapses findings to one row per crossing, carrying how many times it occurs.
 *
 * The count is load-bearing, not decoration. `buildScripts/devCockpit.mjs` imports
 * `ai/mcp/server/shared/helpers/localBearer.mjs` at two separate lines, so a set keyed on
 * file+specifier alone represents both with one member — and removing one of the two would leave the
 * key present and the diff silent. That is the measured failure mode behind a sibling baseline in
 * this repo, where 83 rows collapsed to 9 keys and deleting 63 of 64 occurrences still reported
 * green. Counting is what makes a partial burndown visible.
 *
 * @param {Array<Object>} entries
 * @returns {Array<{file: String, specifier: String, count: Number}>}
 */
export function tallyCrossings(entries) {
    const byKey = new Map();

    for (const entry of entries) {
        const key = crossingKey(entry);

        byKey.has(key)
            ? byKey.get(key).count++
            : byKey.set(key, {file: entry.file, specifier: entry.specifier, count: 1})
    }

    return [...byKey.values()].sort((a, b) => crossingKey(a).localeCompare(crossingKey(b)))
}

/**
 * @summary Compares live crossings against the recorded baseline, in both directions.
 *
 * @param {Array<Object>} findings Live boundary crossings (raw, one per occurrence).
 * @param {Array<Object>} baseline Recorded, tolerated crossings (tallied, carrying `count`).
 * @returns {{added: Object[], burnedDown: Object[]}} `added` = a crossing the baseline does not
 *          cover, or more occurrences than it records (fail up). `burnedDown` = a baselined crossing
 *          that is gone, or has fewer occurrences than recorded (fail down — update the baseline).
 */
export function diffAgainstBaseline(findings, baseline) {
    const live      = tallyCrossings(findings),
          baseByKey = new Map(baseline.map(entry => [crossingKey(entry), entry])),
          liveByKey = new Map(live.map(entry => [crossingKey(entry), entry]));

    const added = live.filter(entry => {
        const recorded = baseByKey.get(crossingKey(entry));

        return !recorded || entry.count > (recorded.count ?? 1)
    });

    const burnedDown = baseline.filter(entry => {
        const observed = liveByKey.get(crossingKey(entry));

        return !observed || observed.count < (entry.count ?? 1)
    });

    return {added, burnedDown}
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const files = execFileSync('git', ['ls-files', ...SCAN_ROOTS], {cwd: ROOT, encoding: 'utf8'})
        .split('\n')
        .filter(file => file.endsWith('.mjs'));

    const findings            = files.flatMap(file => findBrainImports(readFileSync(path.join(ROOT, file), 'utf8'), file));
    const baseline            = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const {added, burnedDown} = diffAgainstBaseline(findings, baseline);

    if (added.length) {
        console.error(`\x1b[31mcheck-engine-brain-boundary: ${added.length} NEW engine → Brain import(s):\x1b[0m`);
        added.forEach(entry => console.error(`  ${entry.file}:${entry.line} imports ${entry.specifier}`));
        console.error(`
The engine must not consume the Brain. An import here makes the framework's build pipeline depend on
the agent OS being present — which is what makes releasing the framework require \`ai/\` to exist.

Move the concern to the Brain side rather than adding a baseline entry: the baseline records debt
that is being paid down, not a place to put new debt.`)
    }

    if (burnedDown.length) {
        console.error(`\x1b[31mcheck-engine-brain-boundary: ${burnedDown.length} baselined entr(ies) no longer present:\x1b[0m`);
        burnedDown.forEach(entry => console.error(`  ${entry.file} no longer imports ${entry.specifier}`));
        console.error(`
This is the good direction — remove them from check-engine-brain-boundary-baseline.json in the same
commit that fixed them. A burndown baseline that only fails upward drifts above the real count, and
then it is a list of things that used to be true rather than a measurement.`)
    }

    if (added.length || burnedDown.length) {
        process.exit(1)
    }

    const srcCrossings = findings.filter(entry => entry.file.startsWith('src/')).length,
          srcNote      = srcCrossings === 0
              ? 'src/** clean, as it has always been — src/ai/** is the engine\'s own AI layer, not a crossing'
              : `${srcCrossings} in src/** — the RUNTIME crosses, which is a different and worse problem than tooling`;

    console.log(`check-engine-brain-boundary: OK — ${findings.length} crossing(s), all baselined; ${files.length} file(s) scanned. ${srcNote}.`)
}
