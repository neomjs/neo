import * as acorn      from 'acorn';
import {execFileSync}  from 'node:child_process';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';
import {walkAst}       from './check-derived-domain.mjs';
import isEntryModule   from './isEntryModule.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');
const BASELINE   = path.join(__dirname, 'check-content-root-derivations-baseline.json');

/**
 * @module buildScripts/util/check-content-root-derivations
 * @summary Stops engine code from gaining new paths into the frozen `resources/content` mirror, with
 * the reader census as a burndown baseline.
 *
 * The conversation corpus lives in its own repository, and the engine's `resources/content` is a
 * frozen mirror that is deleted once every reader takes the corpus or a declared root. A reader that
 * still derives the mirror serves stale data without saying so, and breaks when the tree goes.
 *
 * ## What counts
 *
 * A path into `resources/content` spelled from literals in engine code, wherever the literals first
 * form it: one string or template literal, consecutive literal arguments of one call
 * (`path.join(root, 'resources', 'content')`), or consecutive literal operands of one `+` chain. A
 * relative path means nothing until something resolves it — `process.cwd()`, a `projectRoot`,
 * `__dirname`, a glob's `cwd`, the page's base path at runtime — so the spelled path is the derivation,
 * whatever it is joined to later. A declared root carries no such spelling: it arrives as a value.
 *
 * Out of reach, by construction: a path assembled from non-literal values, such as a variable holding
 * one segment. No static scan of literals can see it.
 *
 * Comments do not count, because the parse drops them. The detector is a pattern, not a string, so
 * this module is scanned like every other.
 *
 * ## Why a baseline
 *
 * The census found literals across the portal index generators, the release scripts, the retired
 * sync pipeline and a few path rules. They burn down leaf by leaf, so the baseline records each with
 * its count and ratchets both ways, like `check-engine-brain-boundary`: a literal the baseline does
 * not cover fails, and a baselined literal that is gone fails until its row leaves the baseline.
 */

/**
 * The trees this guard reads, as the SSOT for its own scan surface; `check-guard-ci-parity` holds
 * the CI workflow's `paths:` filter to it.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['apps/**/*.mjs', 'buildScripts/**/*.mjs', 'src/**/*.mjs']);

/**
 * The roots {@link SCAN_SURFACE} covers, in the form `git ls-files` takes.
 * @type {String[]}
 */
const SCAN_ROOTS = Object.freeze(['apps', 'buildScripts', 'src']);

/**
 * @summary The mirror's repository-relative root, as a derivation spells it.
 * @type {RegExp}
 */
const MIRROR = /resources\/content/;

/**
 * @summary The text of a node that is a complete string on its own: a string literal, or a template
 * literal without expressions.
 * @param {Object} node
 * @returns {String|null}
 */
function literalText(node) {
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;

    return null
}

/**
 * @summary Maximal runs of consecutive nodes that are literals, as their texts.
 * @param {Object[]} nodes
 * @returns {Array<{texts: String[], line: Number}>}
 */
function literalRuns(nodes) {
    const runs = [];
    let   run  = null;

    for (const node of nodes) {
        const text = literalText(node);

        if (text === null) {
            run = null
        } else {
            if (!run) {
                run = {texts: [], line: node.loc.start.line};
                runs.push(run)
            }

            run.texts.push(text)
        }
    }

    return runs
}

/**
 * @summary The operands of a `+` chain in source order, following its left spine.
 * @param {Object} node
 * @param {WeakSet} chainNodes Receives every `+` node of the spine, so the walk visits each chain once.
 * @returns {Object[]}
 */
function flattenConcat(node, chainNodes) {
    if (node.type === 'BinaryExpression' && node.operator === '+') {
        chainNodes.add(node);
        return [...flattenConcat(node.left, chainNodes), node.right]
    }

    return [node]
}

/**
 * @summary Finds every path into the mirror a module spells from literals, one finding where the
 * literals first form it.
 * @param {String} source Module source.
 * @param {String} file Repo-relative path, carried into each finding.
 * @returns {Array<{file: String, line: Number, literal: String}>} One finding per occurrence.
 */
export function findMirrorLiterals(source, file) {
    const ast        = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true}),
          chainNodes = new WeakSet(),
          findings   = [];

    // A run forms the path only if no single literal in it already does: that literal is its own finding.
    const checkRuns = (runs, separator) => runs.forEach(({texts, line}) => {
        const joined = texts.join(separator).replace(/\/{2,}/g, '/');

        if (texts.length > 1 && MIRROR.test(joined) && !texts.some(text => MIRROR.test(text))) {
            findings.push({file, line, literal: joined})
        }
    });

    walkAst(ast, node => {
        const text = node.type === 'Literal'         ? node.value
                   : node.type === 'TemplateElement' ? node.value.cooked
                   : null;

        if (typeof text === 'string' && MIRROR.test(text)) {
            findings.push({file, line: node.loc.start.line, literal: text})
        }

        if (node.type === 'CallExpression') {
            checkRuns(literalRuns(node.arguments), '/')
        }

        // The walk is pre-order, so a chain's outermost `+` arrives first and claims its spine.
        if (node.type === 'BinaryExpression' && node.operator === '+' && !chainNodes.has(node)) {
            checkRuns(literalRuns(flattenConcat(node, chainNodes)), '')
        }
    });

    return findings
}

/**
 * Identity of a baselined literal: `file` + `literal`, never the line, so an edit above it churns nothing.
 * @param {Object} entry
 * @returns {String}
 */
const literalKey = entry => `${entry.file}::${entry.literal}`;

/**
 * @summary Collapses findings to one row per file and literal, carrying how often it occurs, so a
 * partial burndown cannot hide behind a surviving key.
 * @param {Array<Object>} findings
 * @returns {Array<{file: String, literal: String, count: Number}>}
 */
export function tallyLiterals(findings) {
    const byKey = new Map();

    for (const entry of findings) {
        const key = literalKey(entry);

        byKey.has(key)
            ? byKey.get(key).count++
            : byKey.set(key, {file: entry.file, literal: entry.literal, count: 1})
    }

    return [...byKey.values()].sort((a, b) => literalKey(a).localeCompare(literalKey(b)))
}

/**
 * @summary Compares live literals against the recorded baseline, in both directions.
 * @param {Array<Object>} findings Live literals, one per occurrence.
 * @param {Array<Object>} baseline Tolerated literals, tallied.
 * @returns {{added: Object[], burnedDown: Object[]}} `added` = a literal the baseline does not cover,
 * or more occurrences than it records. `burnedDown` = a baselined literal that is gone or occurs less.
 */
export function diffAgainstBaseline(findings, baseline) {
    const live      = tallyLiterals(findings),
          baseByKey = new Map(baseline.map(entry => [literalKey(entry), entry])),
          liveByKey = new Map(live.map(entry => [literalKey(entry), entry]));

    return {
        added     : live.filter(entry => entry.count > (baseByKey.get(literalKey(entry))?.count ?? 0)),
        burnedDown: baseline.filter(entry => (liveByKey.get(literalKey(entry))?.count ?? 0) < entry.count)
    }
}

if (isEntryModule(import.meta.url)) {
    const files = execFileSync('git', ['ls-files', ...SCAN_ROOTS], {cwd: ROOT, encoding: 'utf8'})
        .split('\n')
        .filter(file => file.endsWith('.mjs'));

    const findings            = files.flatMap(file => findMirrorLiterals(readFileSync(path.join(ROOT, file), 'utf8'), file));
    const baseline            = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const {added, burnedDown} = diffAgainstBaseline(findings, baseline);

    if (added.length) {
        const addedKeys = new Set(added.map(literalKey));

        console.error(`\x1b[31mcheck-content-root-derivations: ${added.length} NEW path(s) into the frozen content mirror:\x1b[0m`);
        findings.filter(entry => addedKeys.has(literalKey(entry)))
            .forEach(entry => console.error(`  ${entry.file}:${entry.line} '${entry.literal}'`));
        console.error(`
The mirror is frozen and will be deleted. Read the corpus through a declared root — a config value
or an input — rather than a path literal. The baseline records debt being paid down, not a place for
new debt.`)
    }

    if (burnedDown.length) {
        console.error(`\x1b[31mcheck-content-root-derivations: ${burnedDown.length} baselined literal(s) gone or reduced:\x1b[0m`);
        burnedDown.forEach(entry => console.error(`  ${entry.file} '${entry.literal}' (recorded ${entry.count})`));
        console.error(`
The good direction: update check-content-root-derivations-baseline.json in the same commit, or the
baseline turns into a list of things that used to be true.`)
    }

    if (added.length || burnedDown.length) {
        process.exit(1)
    }

    console.log(`check-content-root-derivations: OK — ${findings.length} baselined literal(s) in ${new Set(findings.map(entry => entry.file)).size} file(s); ${files.length} file(s) scanned.`)
}
