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
const SELF       = path.relative(ROOT, __filename).split(path.sep).join('/');

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
 * A string or template literal naming `resources/content` in engine code. A relative path means
 * nothing until something resolves it — `process.cwd()`, a `projectRoot`, `__dirname`, a glob's `cwd`,
 * the page's base path at runtime — so the literal is the derivation, whatever it is joined to later.
 * That rule needs no data flow. A declared root carries no such literal: it arrives as a value.
 *
 * Comments do not count, because the parse drops them: prose about the old layout reads nothing.
 * This module's own detector string is the one exemption.
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
 * @summary The mirror's repository-relative root, as a derivation names it.
 * @type {String}
 */
const MIRROR = 'resources/content';

/**
 * @summary Finds every string and template literal in a module that names the mirror.
 * @param {String} source Module source.
 * @param {String} file Repo-relative path, carried into each finding.
 * @returns {Array<{file: String, line: Number, literal: String}>} One finding per occurrence.
 */
export function findMirrorLiterals(source, file) {
    const ast      = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true}),
          findings = [];

    walkAst(ast, node => {
        const text = node.type === 'Literal'         ? node.value
                   : node.type === 'TemplateElement' ? node.value.cooked
                   : null;

        if (typeof text === 'string' && text.includes(MIRROR)) {
            findings.push({file, line: node.loc.start.line, literal: text})
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
        .filter(file => file.endsWith('.mjs') && file !== SELF);

    const findings            = files.flatMap(file => findMirrorLiterals(readFileSync(path.join(ROOT, file), 'utf8'), file));
    const baseline            = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const {added, burnedDown} = diffAgainstBaseline(findings, baseline);

    if (added.length) {
        const addedKeys = new Set(added.map(literalKey));

        console.error(`\x1b[31mcheck-content-root-derivations: ${added.length} NEW path(s) into resources/content:\x1b[0m`);
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
