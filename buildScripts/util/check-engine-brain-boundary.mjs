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
 * ## Why this guard reads the AST, and why that matters to its own premise
 *
 * The widely-held belief when this was written — stated in the originating ticket, in its
 * correction, and by me — was that `src/**` is clean with zero crossings and only build tooling
 * crosses. It is not. `src/worker/App.mjs` reaches `ai/Client.mjs`.
 *
 * Every sweep that concluded otherwise was `from`-anchored, and a DYNAMIC import has no `from`
 * keyword. The count went 3 → 6 → 10 across three sweeps, and each step was a tool limitation rather
 * than carelessness. That is why this guard reads `ImportDeclaration` / `ImportExpression` nodes from
 * the parse tree instead of matching text: the shape it most needs to catch is the one text-matching
 * structurally cannot see. (The runtime crossing is lazy and gated behind the `useAi` config, so the
 * engine does not *unconditionally* require the Brain — but "never crosses" was false.)
 *
 * ## Why a baseline rather than a clean gate
 *
 * Ten crossings across nine files, one of them the release path. Relocating them is multi-step work;
 * a gate failing on all ten from day one is a gate that gets disabled.
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
 * Matches a relative module specifier resolving into the Brain, e.g. `../../ai/services.host.mjs`.
 * Anchored on an `ai/` segment after one or more `../` hops, so `../../apps/ai/neural-link/…` — a
 * real path in this repo — cannot match.
 * @type {RegExp}
 */
const BRAIN_SPECIFIER_RE = /^(?:\.\.\/)+ai\//;

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

        if (typeof specifier === 'string' && BRAIN_SPECIFIER_RE.test(specifier)) {
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
    const files = execFileSync('git', ['ls-files', 'buildScripts', 'src'], {cwd: ROOT, encoding: 'utf8'})
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

    const srcCrossings = findings.filter(entry => entry.file.startsWith('src/')).length;

    console.log(`check-engine-brain-boundary: OK — ${findings.length} crossing(s), all baselined; ${files.length} file(s) scanned. ${srcCrossings} of them in src/** (the runtime), which is the row to burn down first.`)
}
