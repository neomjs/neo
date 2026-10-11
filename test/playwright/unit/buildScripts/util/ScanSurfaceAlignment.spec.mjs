import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'fs-extra';
import * as yaml       from 'js-yaml';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {mirroredGuards} from '../../../../../buildScripts/util/check-guard-ci-parity.mjs';

const
    __dirname    = path.dirname(fileURLToPath(import.meta.url)),
    // util -> buildScripts -> unit -> playwright -> test -> repo root
    REPO_ROOT    = path.resolve(__dirname, '../../../../..'),
    WORKFLOW_DIR = path.join(REPO_ROOT, '.github/workflows');

/**
 * @summary The alignment half of hook↔CI parity: a mirror's `paths:` filter must select every tracked file its
 * guard reads.
 *
 * `check-guard-ci-parity` answers whether a guard is mirrored AT ALL, and deliberately credits a workflow carrying
 * a `paths:` allowlist without inspecting it — its own source says why, and defers the alignment question here. A
 * filter narrower than the surface it credits is a false green of the exact class that lint exists to catch, one
 * layer in: the workflow exists, the guard is counted mirrored, and an edit in the uncovered region never re-runs it.
 * `--no-verify` then passes both.
 *
 * The population is imported, never listed. `mirroredGuards()` derives it from `lint-staged` minus the registry's
 * accepted `clientOnly` rows, so a guard that gains a mirror enters these arms in the same edit that mirrors it, and
 * a client-only guard — which has no filter to align — stays out without an exemption anyone has to remember.
 */

/**
 * @summary Does a GitHub `paths:` filter select this file?
 *
 * GitHub evaluates the list IN ORDER and the LAST matching pattern decides, with a leading `!` excluding. Both
 * properties are load-bearing and neither is expressible as set membership: `['src/**', '!src/**']` matches `src/**`
 * first and then un-matches it, so the filter selects nothing, while an unordered "does any pattern match" test
 * credits it completely. That test is the false green this whole spec exists to prevent, so writing it here would
 * have reproduced the defect inside the check for it.
 *
 * A file no pattern matches at all is not selected — the list is an allowlist, so the default is exclusion.
 *
 * @param {String}   file repo-relative path
 * @param {String[]} patterns one mirror's `pull_request.paths`, in the order the workflow declares them
 * @returns {Boolean}
 */
function isSelectedBy(file, patterns) {
    let selected = false;

    patterns.forEach(pattern => {
        const
            negated = pattern.startsWith('!'),
            glob    = negated ? pattern.slice(1) : pattern;

        path.matchesGlob(file, glob) && (selected = !negated)
    });

    return selected
}

/**
 * @summary Which of a guard's tracked files no mirror re-runs on.
 *
 * Each mirror is evaluated SEPARATELY and the results OR'd, because any one of them triggering re-runs the guard.
 * Flattening every mirror's patterns into one list would be wrong in both directions — it lets one workflow's
 * pattern satisfy another's filter, and it drops the ordering each list carries.
 *
 * @param {String[]} files repo-relative tracked paths
 * @param {Array<String[]|null>} filters one entry per mirror; `null` means the mirror watches everything
 * @returns {String[]} the uncovered files, in input order
 */
function uncoveredFiles(files, filters) {
    if (filters.includes(null)) {
        return []
    }

    return files.filter(file => !filters.some(patterns => isSelectedBy(file, patterns)))
}

/**
 * @summary The `pull_request.paths` allowlist of one workflow, or `null` when it watches everything.
 * @param {String} file workflow filename
 * @returns {String[]|null}
 */
function pathsOf(file) {
    const
        workflow    = yaml.load(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')) || {},
        pullRequest = (workflow.on ?? workflow[true])?.pull_request;

    return pullRequest && typeof pullRequest === 'object' && Object.hasOwn(pullRequest, 'paths')
        ? [pullRequest.paths].flat()
        : null
}

/**
 * @summary The TRACKED files one surface member selects.
 *
 * `git ls-files` rather than the filesystem, because tracked is the whole question: a workflow filter selects from
 * what CI checks out, so a member matching only gitignored files cannot be watched by any filter that could be
 * written, and the audit would then read files CI never sees.
 *
 * @param {String} member
 * @returns {String[]} repo-relative paths
 */
function trackedFiles(member) {
    const out = execFileSync('git', ['ls-files', '--', `:(glob)${member}`], {
        cwd      : REPO_ROOT,
        encoding : 'utf8',
        maxBuffer: 64 * 1024 * 1024
    }).trim();

    return out ? out.split('\n') : []
}

/**
 * @summary Every mirrored guard with its declared surface and its mirrors' filters, read once.
 * @returns {Promise<Object[]>} `{script, mirrors, surface, filters}`
 */
async function population() {
    const rows = [];

    for (const {script, mirrors} of mirroredGuards()) {
        rows.push({
            script,
            mirrors,
            surface: (await import(path.join(REPO_ROOT, script))).SCAN_SURFACE,
            filters: mirrors.map(pathsOf)
        })
    }

    return rows
}

const rows = await population();

test.describe('scan-surface alignment', () => {
    test('the population is derived and non-empty', () => {
        expect(rows.length, 'mirroredGuards() returned nothing — the arms below would all pass vacuously').toBeGreaterThan(0)
    });

    test('every mirrored guard exports a SCAN_SURFACE', () => {
        const undeclared = rows
            .filter(({surface}) => !Array.isArray(surface) || surface.length === 0)
            .map(({script}) => script);

        expect(undeclared, 'a mirrored guard with no exported SCAN_SURFACE cannot be held to its mirror; export one as globs').toEqual([])
    });

    test('every declared surface member is tracked', () => {
        const untracked = [];

        rows.forEach(({script, surface}) => (surface || []).forEach(
            member => trackedFiles(member).length === 0 && untracked.push(`${script} → ${member}`)
        ));

        expect(untracked, 'a member matching no tracked file is unreachable by any workflow paths filter, so the mirror cannot watch what the guard reads').toEqual([])
    });

    test('every mirror selects every tracked file of its guard\'s surface', () => {
        const gaps = [];

        rows.forEach(({script, mirrors, surface, filters}) => (surface || []).forEach(member => {
            const uncovered = uncoveredFiles(trackedFiles(member), filters);

            // The first few name the shape without pasting hundreds of paths into a failure message
            uncovered.length && gaps.push(
                `${script} → ${member}: ${uncovered.length} tracked file(s) no mirror re-runs on, e.g. ${uncovered.slice(0, 3).join(', ')} (mirrors: ${mirrors.join(', ')})`
            )
        }));

        expect(gaps, 'a mirror whose paths filter misses part of its guard\'s scan surface runs late and misattributed').toEqual([])
    });

    test('RED: a carve-out that re-excludes the surface is reported, not credited', () => {
        // `['src/**', '!src/**']` selects NOTHING. An unordered "does any pattern match" test credits it, because
        // `!src/**` matches nothing on its own and the positive pattern before it wins — the false green this
        // predicate exists to prevent, in the predicate itself.
        const files = ['src/Neo.mjs', 'src/component/Base.mjs'];

        expect(uncoveredFiles(files, [['src/**']])).toEqual([]);
        expect(uncoveredFiles(files, [['src/**', '!src/**']])).toEqual(files);
        expect(uncoveredFiles(files, [['src/**', '!src/component/**']])).toEqual(['src/component/Base.mjs'])
    });

    test('RED: a depth gap is reported', () => {
        // A filter can match the shallow and the deep form and miss the one between, which is exactly what a
        // fixed set of sampled depths cannot see.
        const files = ['examples/a.mjs', 'examples/one/b.mjs', 'examples/one/two/c.mjs'];

        expect(uncoveredFiles(files, [['examples/*.mjs', 'examples/*/*/*.mjs']])).toEqual(['examples/one/b.mjs']);
        expect(uncoveredFiles(files, [['examples/**/*.mjs']])).toEqual([])
    });

    test('the LAST matching pattern decides, and each mirror is evaluated on its own', () => {
        const files = ['src/component/Base.mjs'];

        // Re-included by a later pattern: order is what makes this covered, not membership
        expect(uncoveredFiles(files, [['src/**', '!src/component/**', 'src/component/Base.mjs']])).toEqual([]);

        // Two mirrors, neither sufficient alone, together covering — OR'd across mirrors
        expect(uncoveredFiles(['src/a.mjs', 'test/b.mjs'], [['src/**'], ['test/**']])).toEqual([]);

        // ...but their patterns must not be pooled: one mirror's negation cannot be cancelled by another's pattern
        expect(uncoveredFiles(files, [['src/**', '!src/**'], ['docs/**']])).toEqual(files);

        // A mirror with no `paths:` re-runs on every pull request, so it covers the surface by construction
        expect(uncoveredFiles(files, [null])).toEqual([])
    })
});
