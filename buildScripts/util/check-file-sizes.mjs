import {parse}                                   from 'acorn';
import {program}                                 from 'commander';
import fg                                        from 'fast-glob';
import {spawnSync}                               from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path                                      from 'node:path';
import process                                   from 'node:process';
import {fileURLToPath}                           from 'node:url';

const __filename = fileURLToPath(import.meta.url),
      __dirname  = path.dirname(__filename),
      repoRoot   = path.resolve(__dirname, '../..');

export const BASELINE_RELATIVE_PATH = 'buildScripts/util/file-size-baseline.json';
export const DEFAULT_SCAN_ROOTS      = ['src', 'apps', 'examples', 'buildScripts'];
export const DEFAULT_THRESHOLDS      = Object.freeze({target: 1_000, yellow: 1_500, red: 2_000});

/**
 * @summary Reports whether a path belongs to the code-line guard population.
 * @param {String} file Repo-relative path.
 * @param {String[]} roots Guarded directory roots.
 * @returns {Boolean}
 */
export function isInScopePath(file, roots = DEFAULT_SCAN_ROOTS) {
    return typeof file === 'string'
        && file.endsWith('.mjs')
        && roots.some(root => file.startsWith(`${root}/`))
        && !file.split('/').includes('node_modules')
}

/**
 * @summary Adds every nonblank physical line covered by an Acorn location to a set.
 * @param {Set<Number>} target Destination line set.
 * @param {{start: {line: Number}, end: {line: Number}}} location Acorn location.
 * @param {String[]} lines Source lines.
 * @returns {void}
 */
function addLocationLines(target, location, lines) {
    for (let line = location.start.line; line <= location.end.line; line++) {
        if (lines[line - 1]?.trim()) {
            target.add(line)
        }
    }
}

/**
 * @summary Measures code and documentation lines from parser-owned token/comment ranges.
 * @param {String} source Module source.
 * @param {String} file Repo-relative diagnostic path.
 * @returns {{file: String, status: String, codeLines: Number|null, docLines: Number, docPercent: Number, totalLines: Number, error?: String}}
 */
export function measureSource(source, file = '<memory>') {
    source = String(source);

    const lines    = source.split(/\r\n|[\n\r]/u),
          tokens   = [],
          comments = [];

    try {
        parse(source, {
            allowHashBang: true,
            ecmaVersion  : 'latest',
            locations    : true,
            onComment    : comments,
            onToken      : tokens,
            sourceType   : 'module'
        })
    } catch (error) {
        return {
            file,
            status    : 'not-measured',
            codeLines : null,
            docLines  : 0,
            docPercent: 0,
            totalLines: lines.length,
            error     : error.message
        }
    }

    const codeLineSet = new Set(),
          docLineSet  = new Set();

    tokens
        .filter(token => token.type.label !== 'eof')
        .forEach(token => addLocationLines(codeLineSet, token.loc, lines));
    comments.forEach(comment => addLocationLines(docLineSet, comment.loc, lines));

    return {
        file,
        status    : 'measured',
        codeLines : codeLineSet.size,
        docLines  : docLineSet.size,
        docPercent: lines.length === 0 ? 0 : Number((docLineSet.size / lines.length * 100).toFixed(1)),
        totalLines: lines.length
    }
}

/**
 * @summary Reports whether a declaration path is canonical, in-scope, and repository-relative.
 * @param {String} file Candidate path.
 * @returns {Boolean}
 */
function isSafeDeclarationPath(file) {
    return !path.posix.isAbsolute(file)
        && !file.includes('\\')
        && path.posix.normalize(file) === file
        && !file.split('/').includes('..')
        && isInScopePath(file)
}

/**
 * @summary Parses exact per-path growth declarations without grading their prose reason.
 * @param {String} body Pull-request body text.
 * @returns {{declarations: Map<String, String>, malformed: String[], duplicates: String[]}}
 */
export function parseGrowthDeclarations(body) {
    const declarations = new Map(),
          malformed    = [],
          duplicates   = [];

    String(body || '').split(/\r\n|[\n\r]/u).forEach(line => {
        if (!line.trimStart().startsWith('size-guard-growth:')) {
            return
        }

        const match = /^[ \t]*size-guard-growth:[ \t]+(\S+)[ \t]+—[ \t]+(\S(?:.*\S)?)[ \t]*$/u.exec(line);

        if (!match || !isSafeDeclarationPath(match[1])) {
            malformed.push(line);
            return
        }

        const [, file, reason] = match;

        if (declarations.has(file) || duplicates.includes(file)) {
            declarations.delete(file);
            duplicates.includes(file) || duplicates.push(file);
            malformed.push(line);
            return
        }

        declarations.set(file, reason)
    });

    return {declarations, malformed, duplicates}
}

/**
 * @summary Maps a measured code-line count to its report band; only target admission gates.
 * @param {Number} codeLines Measured code lines.
 * @param {{target: Number, yellow: Number, red: Number}} thresholds Threshold inputs.
 * @returns {String}
 */
function getBand(codeLines, thresholds) {
    if (codeLines >= thresholds.red) {
        return 'red'
    }
    if (codeLines >= thresholds.yellow) {
        return 'yellow'
    }
    if (codeLines > thresholds.target) {
        return 'over-target'
    }
    return 'green'
}

/**
 * @summary Validates that a baseline is a path-to-positive-integer object in guard scope.
 * @param {Object} baseline Candidate baseline.
 * @param {String} label Diagnostic owner.
 * @returns {String[]} Validation failures.
 */
function validateBaseline(baseline, label) {
    if (!baseline || Array.isArray(baseline) || typeof baseline !== 'object') {
        return [`${label} must be a JSON object keyed by repo-relative .mjs path.`]
    }

    return Object.entries(baseline).flatMap(([file, value]) => {
        const errors = [];

        isInScopePath(file) || errors.push(`${label} contains out-of-scope path ${file}.`);
        Number.isInteger(value) && value > 0 || errors.push(`${label}[${file}] must be a positive integer.`);

        return errors
    })
}

/**
 * @summary Evaluates measurements against immutable base authority and the proposed HEAD baseline.
 * @param {Object} options
 * @param {Object<String, Object>} options.measurements Path-to-measurement map.
 * @param {Object<String, Number>} options.baseBaseline Baseline at the comparison ref.
 * @param {Object<String, Number>} options.headBaseline Baseline in the working tree.
 * @param {{declarations: Map<String, String>, malformed: String[], duplicates: String[]}} options.declarations Parsed PR declarations.
 * @param {Boolean} options.compareBase Whether historical monotonicity is available.
 * @param {Set<String>|null} [options.changedFiles=null] The in-scope source paths this change
 * actually touched. Row demands are waived only where the source is untouched **and** its baseline
 * row is inherited unchanged, because a row that goes stale on the base branch otherwise fails every
 * unrelated pull request until someone repairs a number nobody involved changed. Source membership
 * alone is not sufficient: the changed set holds `.mjs` paths only, so a baseline-only change
 * presents an empty set and could otherwise raise any row unchecked. `null` means no diff scope —
 * the whole-tree audit, where every path is in scope because there is no diff to be outside of.
 *
 * **The deleted-path branch is deliberately NOT scoped**, and the asymmetry is load-bearing:
 * `changedFilesAtRef` runs `--diff-filter=d`, so a deletion never appears in the changed set. Scoping
 * that branch would let a pull request delete a baselined file and silently orphan its row — trading
 * a real guard for a rare transitional block.
 * @param {{target: Number, yellow: Number, red: Number}} options.thresholds Threshold inputs.
 * @returns {{rows: Object[], violations: Object[], unusedDeclarations: String[], malformedDeclarations: String[], monotonicityEvaluated: Boolean}}
 */
export function evaluateMeasurements({
    measurements,
    baseBaseline = {},
    changedFiles = null,
    headBaseline = {},
    declarations = parseGrowthDeclarations(''),
    compareBase  = true,
    thresholds   = DEFAULT_THRESHOLDS
}) {
    const parsedDeclarations = declarations instanceof Map
              ? {declarations, malformed: [], duplicates: []}
              : declarations,
          declared          = parsedDeclarations.declarations || new Map(),
          usedDeclarations  = new Set(),
          violations        = validateBaseline(headBaseline, 'HEAD baseline')
              .map(reason => ({file: BASELINE_RELATIVE_PATH, reason})),
          rows              = [],
          files             = [...new Set([
              ...Object.keys(measurements || {}),
              ...Object.keys(headBaseline || {}),
              ...(compareBase ? Object.keys(baseBaseline || {}) : [])
          ])].sort();

    if (compareBase) {
        validateBaseline(baseBaseline, 'base baseline')
            .forEach(reason => violations.push({file: BASELINE_RELATIVE_PATH, reason}))
    }

    const fail = (file, reason) => violations.push({file, reason});

    files.forEach(file => {
        const measurement = measurements[file],
              baseValue   = baseBaseline[file],
              headValue   = headBaseline[file];

        if (!measurement) {
            const row = {file, band: 'deleted', codeLines: null, docLines: 0, docPercent: 0, verdict: 'pass'};

            if (headValue !== undefined) {
                row.verdict = 'fail';
                fail(file, `remove the HEAD baseline entry for deleted path ${file}.`)
            }

            rows.push(row);
            return
        }

        const row = {
            file,
            band      : measurement.status === 'measured' ? getBand(measurement.codeLines, thresholds) : 'not-measured',
            codeLines : measurement.codeLines,
            docLines  : measurement.docLines,
            docPercent: measurement.docPercent,
            verdict   : 'pass'
        };

        rows.push(row);

        if (measurement.status !== 'measured') {
            row.verdict = 'fail';
            fail(file, `not-measured: ${measurement.error || 'parser did not return a measurement'}.`);
            return
        }

        // A change is accountable for what it actually altered. Where BOTH the source and its
        // baseline row are inherited untouched, the row is REPORTED and never gated — otherwise a
        // row that went stale on the base branch fails every unrelated pull request, a dependency
        // bot's included, until a human repairs a number nobody involved changed.
        //
        // **Both halves are required, and the second is the one that is easy to miss.** The changed
        // set is built from in-scope `.mjs` paths, so the baseline JSON can never appear in it: a
        // baseline-only change presents an EMPTY source set. Waiving on source membership alone
        // therefore let a change raise any row unchecked, and a later change could then grow that
        // source under the inflated ceiling and read as a shrink — no declaration required. Two
        // steps, no source edit in the first, and the growth gate defeated. Requiring the row to be
        // inherited (`headValue === baseValue`) is what makes "untouched" mean untouched.
        //
        // A measurement failure is never waived: it is decided above, so an unparsable inherited
        // file still fails rather than reporting `not-measured` and exiting 0.
        //
        // `changedFiles === null` means no diff scope was supplied (the whole-tree audit), and then
        // every path is in scope because there is no diff to be outside of.
        if (changedFiles && !changedFiles.has(file) && headValue === baseValue) {
            return
        }

        const current = measurement.codeLines;

        if (current <= thresholds.target) {
            if (headValue !== undefined) {
                row.verdict = 'fail';
                fail(file, `remove the HEAD baseline entry: ${file} is at or below the ${thresholds.target}-line target.`)
            }
            return
        }

        if (!compareBase) {
            if (headValue !== current) {
                row.verdict = 'fail';
                fail(file, `HEAD baseline must equal the measured count ${current} for ${file}.`)
            }
            return
        }

        if (baseValue === undefined) {
            if (headValue !== current) {
                row.verdict = 'fail';
                fail(file, `enroll ${file} in the HEAD baseline at its measured count ${current}.`)
            }
            if (!declared.has(file)) {
                row.verdict = 'fail';
                fail(file, `${file} needs an exact size-guard-growth declaration for new enrollment.`)
            } else {
                usedDeclarations.add(file)
            }
            return
        }

        if (current < baseValue) {
            if (headValue !== current) {
                row.verdict = 'fail';
                fail(file, `lower the HEAD baseline for ${file} from ${baseValue} to the measured count ${current}.`)
            }
            return
        }

        if (headValue !== current) {
            row.verdict = 'fail';
            fail(file, `HEAD baseline must equal the measured count ${current} for ${file}.`)
        }

        if (current > baseValue) {
            if (!declared.has(file)) {
                row.verdict = 'fail';
                fail(file, `${file} grew from ${baseValue} to ${current}; add size-guard-growth: ${file} — <reason>.`)
            } else {
                usedDeclarations.add(file)
            }
        }
    });

    return {
        rows,
        violations,
        unusedDeclarations   : [...declared.keys()].filter(file => !usedDeclarations.has(file)).sort(),
        malformedDeclarations: parsedDeclarations.malformed || [],
        monotonicityEvaluated: compareBase
    }
}

/**
 * @summary Produces the canonical sorted HEAD baseline from measured over-target files.
 * @param {Object} options
 * @param {Object<String, Object>} options.measurements Path-to-measurement map.
 * @param {{target: Number}} options.thresholds Threshold inputs.
 * @returns {Object<String, Number>}
 */
export function reconcileBaseline({measurements, thresholds = DEFAULT_THRESHOLDS}) {
    return Object.fromEntries(Object.entries(measurements)
        .filter(([, measurement]) => measurement?.status === 'measured' && measurement.codeLines > thresholds.target)
        .map(([file, measurement]) => [file, measurement.codeLines])
        .sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * @summary Reads and validates a JSON baseline from disk.
 * @param {String} absolutePath Absolute file path.
 * @param {String} label Diagnostic owner.
 * @returns {Object<String, Number>}
 */
function readBaselineFile(absolutePath, label) {
    let baseline;

    try {
        baseline = JSON.parse(readFileSync(absolutePath, 'utf8'))
    } catch (error) {
        throw new Error(`Could not read ${label} at ${absolutePath}: ${error.message}`)
    }

    const errors = validateBaseline(baseline, label);

    if (errors.length > 0) {
        throw new Error(errors.join('\n'))
    }

    return baseline
}

/**
 * @summary Reads a baseline blob from a git ref without checking it out.
 * @param {String} ref Git comparison ref.
 * @param {String} relativePath Repo-relative baseline path.
 * @returns {{baseline: Object<String, Number>, exists: Boolean}}
 */
function readBaselineAtRef(ref, relativePath) {
    const refResult = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
        cwd     : repoRoot,
        encoding: 'utf8'
    });

    if (refResult.status !== 0) {
        throw new Error(`Could not resolve base ref ${ref}: ${refResult.stderr.trim()}`)
    }

    const result = spawnSync('git', ['show', `${ref}:${relativePath}`], {
        cwd     : repoRoot,
        encoding: 'utf8'
    });

    if (result.status !== 0) {
        const treeResult = spawnSync('git', ['ls-tree', '-r', '--name-only', ref, '--', relativePath], {
            cwd     : repoRoot,
            encoding: 'utf8'
        });

        if (treeResult.status !== 0) {
            throw new Error(`Could not inspect base tree ${ref}: ${treeResult.stderr.trim()}`)
        }

        if (!treeResult.stdout.trim()) {
            return {baseline: {}, exists: false}
        }

        throw new Error(`Could not read base baseline ${relativePath} at ${ref}: ${result.stderr.trim()}`)
    }

    let baseline;

    try {
        baseline = JSON.parse(result.stdout)
    } catch (error) {
        throw new Error(`Base baseline at ${ref}:${relativePath} is invalid JSON: ${error.message}`)
    }

    const errors = validateBaseline(baseline, 'base baseline');

    if (errors.length > 0) {
        throw new Error(errors.join('\n'))
    }

    return {baseline, exists: true}
}

/**
 * @summary Selects in-scope files changed against a git base.
 * @param {String} ref Git comparison ref.
 * @returns {String[]}
 */
function changedFilesAtRef(ref) {
    const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=d', `${ref}...HEAD`], {
        cwd     : repoRoot,
        encoding: 'utf8'
    });

    if (result.status !== 0) {
        throw new Error(`Could not diff ${ref}...HEAD: ${result.stderr.trim()}`)
    }

    return result.stdout.split('\n').map(file => file.trim()).filter(file => isInScopePath(file))
}

/**
 * @summary Measures selected existing files and preserves explicit missing paths for deletion checks.
 * @param {String[]} files Repo-relative paths.
 * @returns {Object<String, Object>}
 */
function measureFiles(files) {
    return Object.fromEntries(files.flatMap(file => {
        const absolutePath = path.resolve(repoRoot, file);

        if (!existsSync(absolutePath)) {
            return []
        }

        let source;

        try {
            source = readFileSync(absolutePath, 'utf8')
        } catch (error) {
            return [[file, {
                file,
                status    : 'not-measured',
                codeLines : null,
                docLines  : 0,
                docPercent: 0,
                totalLines: 0,
                error     : error.message
            }]]
        }

        return [[file, measureSource(source, file)]]
    }))
}

/**
 * @summary Formats one deterministic console row with code and documentation measures.
 * @param {Object} row Evaluation row.
 * @returns {String}
 */
function formatRow(row) {
    if (row.band === 'deleted') {
        return `${row.verdict.toUpperCase().padEnd(4)} deleted       ${row.file}`
    }

    if (row.band === 'not-measured') {
        return `FAIL not-measured  ${row.file}`
    }

    return `${row.verdict.toUpperCase().padEnd(4)} ${row.band.padEnd(11)} ${String(row.codeLines).padStart(5)} code | ${String(row.docLines).padStart(5)} doc (${row.docPercent.toFixed(1)}%)  ${row.file}`
}

/**
 * @summary Runs the code-line audit CLI and exits non-zero on measurement or ratchet violations.
 * @returns {Promise<void>}
 */
async function main() {
    program
        .name('check-file-sizes')
        .description('Measure .mjs code lines and enforce a base-to-HEAD shrinking baseline.')
        .argument('[files...]', 'Specific repo-relative .mjs files. Omitted means changed-vs-base or the whole guarded tree.')
        .option('-b, --base <ref>', 'Compare the HEAD baseline and changed files against this git ref.')
        .option('--baseline <path>', 'Repo-relative HEAD baseline path.', BASELINE_RELATIVE_PATH)
        .option('--pr-body-file <path>', 'File containing the current pull-request body. Omitted means no growth hatch.')
        .option('--fix', 'Rewrite the HEAD baseline to measured over-target counts.', false)
        .option('--target <lines>', 'Target code-line ceiling.', value => Number(value), DEFAULT_THRESHOLDS.target)
        .option('--yellow <lines>', 'Yellow report threshold.', value => Number(value), DEFAULT_THRESHOLDS.yellow)
        .option('--red <lines>', 'Red report threshold.', value => Number(value), DEFAULT_THRESHOLDS.red)
        .showHelpAfterError();

    program.parse(process.argv);

    const options      = program.opts(),
          thresholds   = {target: options.target, yellow: options.yellow, red: options.red},
          baselinePath = path.resolve(repoRoot, options.baseline);

    if (![thresholds.target, thresholds.yellow, thresholds.red].every(Number.isInteger)
        || thresholds.target < 1 || thresholds.yellow <= thresholds.target || thresholds.red <= thresholds.yellow) {
        console.error('check-file-sizes: thresholds must be positive integers ordered target < yellow < red.');
        process.exit(1)
    }

    try {
        let headBaseline = readBaselineFile(baselinePath, 'HEAD baseline'),
            baseBaseline = {},
            changedFiles = null,
            compareBase  = false,
            selected;

        if (options.base) {
            const baseState = readBaselineAtRef(options.base, options.baseline);

            baseBaseline = baseState.baseline;
            compareBase  = baseState.exists;
            // Captured before the union below folds the baselines in: after that, `selected` is the
            // measurement population and no longer says which paths this change actually touched.
            changedFiles = compareBase ? new Set(changedFilesAtRef(options.base)) : null;
            selected     = compareBase
                ? changedFilesAtRef(options.base)
                : await fg(DEFAULT_SCAN_ROOTS.map(root => `${root}/**/*.mjs`), {
                    absolute : false,
                    cwd      : repoRoot,
                    dot      : false,
                    onlyFiles: true,
                    unique   : true,
                    ignore   : ['**/node_modules/**']
                })
        } else if (program.args.length > 0) {
            selected = program.args.filter(file => isInScopePath(file))
        } else {
            selected = await fg(DEFAULT_SCAN_ROOTS.map(root => `${root}/**/*.mjs`), {
                absolute : false,
                cwd      : repoRoot,
                dot      : false,
                onlyFiles: true,
                unique   : true,
                ignore   : ['**/node_modules/**']
            })
        }

        selected = [...new Set([
            ...selected,
            ...Object.keys(headBaseline),
            ...(compareBase ? Object.keys(baseBaseline) : [])
        ])].sort();

        const measurements = measureFiles(selected),
              body         = options.prBodyFile ? readFileSync(path.resolve(repoRoot, options.prBodyFile), 'utf8') : '',
              declarations = parseGrowthDeclarations(body);

        if (options.fix) {
            headBaseline = reconcileBaseline({measurements, thresholds});
            writeFileSync(baselinePath, JSON.stringify(headBaseline, null, 4) + '\n')
        }

        const result = evaluateMeasurements({
            measurements,
            baseBaseline,
            changedFiles,
            headBaseline,
            declarations,
            compareBase,
            thresholds
        }),
              explicitFiles = new Set(program.args.filter(file => isInScopePath(file))),
              reportRows    = result.rows.filter(row => row.verdict === 'fail'
                  || (row.codeLines ?? 0) > thresholds.target
                  || explicitFiles.has(row.file));

        reportRows.forEach(row => console.log(formatRow(row)));

        declarations.malformed.forEach(line => console.warn(`IGNORED malformed growth declaration: ${line}`));
        result.unusedDeclarations.forEach(file => console.warn(`IGNORED unused growth declaration: ${file}`));

        if (!result.monotonicityEvaluated) {
            console.log(options.base
                ? `NOTE ${options.baseline} is absent at ${options.base}; this is the one-time baseline bootstrap and the whole guarded tree was measured.`
                : 'NOTE historical monotonicity was not evaluated; pass --base <ref> for the base-to-HEAD ratchet.')
        }

        if (result.violations.length > 0) {
            console.error(`\ncheck-file-sizes: ${result.violations.length} violation(s).`);
            result.violations.forEach(({file, reason}) => console.error(`  ${file}: ${reason}`));
            process.exit(1)
        }

        console.log(`\ncheck-file-sizes: ${result.rows.length} path(s) evaluated, ${reportRows.length} reported, 0 violations.`)
    } catch (error) {
        console.error(`check-file-sizes: ${error.message}`);
        process.exit(1)
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    await main()
}
