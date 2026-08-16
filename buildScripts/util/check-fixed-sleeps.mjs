#!/usr/bin/env node
/**
 * @summary Fails a unit spec that waits a fixed second-scale sleep without saying what it is waiting for.
 *
 * ## The defect this is actually about
 *
 * The visible shape is `await new Promise(r => setTimeout(r, 1000))` in a spec, and the visible cost is
 * wall clock — a suite that crossed 16 CI-minutes with most of it spent asleep. But the bare sleep is a
 * SYMPTOM. In every site censused when this guard was written, the spec was out-waiting a **hardcoded
 * production constant** it had no way to inject: a poll interval, a lock-hold threshold, a token TTL, a
 * spawn startup delay. The test cannot pin what the source does not expose, so it guesses a number
 * larger than the constant and pays it on every run, forever.
 *
 * So the rule is not "no sleeps". It is: **a fixed second-scale wait must name what it is waiting for.**
 * Naming it is the cheap part; the naming is also the census that finds the next non-injectable constant,
 * which is the repair that actually removes the wall clock.
 *
 * ## Deleting a sleep is NOT the sanctioned fix, and this guard must not imply that it is
 *
 * Measured on the wake daemon spec while this guard was being written:
 *
 *     daemon readiness            90 ms actual, against sleeps waiting 1000 ms
 *     sleep -> readiness poll     6.4s -> 6.3s     (no material change)
 *     sleep DELETED entirely      6.4s -> 12.2s    (twice as slow, every assertion still green)
 *
 * The wall clock is quantized by the production poll interval: injecting at 90 ms or at 1000 ms lands
 * before the same boundary, so sub-interval savings are absorbed whole — and deleting the wait pushes
 * injection BEFORE the watermark, costing a full extra cycle. **A naive deletion makes the suite slower
 * while staying green**, which is the worst available outcome because nothing reports it.
 *
 * That is why `wall-clock-under-test:` is a first-class, legitimate answer rather than a confession, and
 * why this guard's failure text never says "remove the sleep". A guard that nudges toward the wrong
 * repair is worse than no guard: it converts a visible cost into an invisible one and prints green.
 *
 * ## What satisfies it
 *
 * Either marker, on the sleep's line or within the three lines above it:
 *
 *     wall-clock-under-test: <why the elapsed time is the thing being asserted>
 *     out-waits: <the production constant this is larger than>
 *
 * `out-waits:` is the one that pays forward — it names a leaf candidate, and a constant named here is a
 * constant somebody can make injectable.
 *
 * Two forms are exempt without a marker, because both already name what the rule asks named. A
 * named-constant delay is injectable by construction, so the wait's name travels with it. And a
 * self-naming failure deadline — `setTimeout(() => reject(new Error('…')), N)` — is not a wait at
 * all: it costs nothing on a green run, fires only to fail a wedged one, and its error text is the
 * naming. The exemption is shape-checked conservatively (`isSelfNamingDeadline`); a form it cannot
 * prove is simply counted.
 *
 * ## The baseline is annotation debt. It is NOT a wall-clock metric.
 *
 * This guard reports two numbers with opposite meanings, and conflating them would defeat it.
 *
 * **Baseline** counts waits nobody has accounted for. It should reach zero.
 *
 * **Backlog** counts `out-waits:` sites — waits that ARE accounted for and are *still being paid*,
 * because the constant they name is still hardcoded. Its rising is a finding, not a failure.
 *
 * The trap, found by the author of the largest affected spec while reviewing this guard: every one of
 * her 83 sites would **truthfully** earn `out-waits: POLL_INTERVAL_MS`. Annotating all of them is the
 * correct local action and it drives the baseline to zero **while recovering zero wall clock**. A
 * burndown that completes without the suite getting one millisecond faster is exactly the
 * metric-moves-goal-doesn't shape this guard exists to prevent, reappearing inside the guard itself.
 *
 * So: a zeroed baseline means every wait is *explained*. It does not mean the suite is fast. Anything
 * reading it as a speed metric is reading the wrong number — which is why both counts print together
 * on success, rather than this paragraph being the only place the distinction lives.
 *
 * ## Baseline mechanics
 *
 * Pre-existing sites are grandfathered in `check-fixed-sleeps-baseline.json` as `{file, text, count}`
 * entries, and reconciliation compares OCCURRENCE COUNTS in both directions: above the allowance is
 * fresh, below it is stale. The baseline may only shrink and cannot outlive the sites it grandfathers.
 *
 * Counting rather than testing membership is load-bearing. These sites are overwhelmingly ONE
 * byte-identical line, `setTimeout(resolve, 1000)`, repeated dozens of times in a single file — so a
 * key of file+text collapses them into a single entry, and removing all but one of them leaves that
 * key still matching, nothing stale, and the guard green. Site granularity was chosen precisely so a
 * conversion (a sleep becoming a readiness poll) could not be absorbed silently; membership keys hand
 * back the very weakness the choice rejected.
 *
 * The live count is deliberately NOT written here. It is in the baseline, which is the one place that
 * has to be right, and a second copy in prose is a second thing to keep true: this comment said 64
 * while the tree held 63 for as long as it took a reviewer to notice, inside the file whose whole
 * subject is counts being accurate. A number worth citing is worth reading from its source.
 *
 * Line numbers stay OUT of the key on purpose: they shift under any edit above them, so keying on them
 * turns every unrelated change into a wall of false staleness — and a guard nobody can keep green gets
 * routed around, which is the failure this ticket is about.
 */
import {parse}         from 'acorn';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    BASELINE_REL   = 'buildScripts/util/check-fixed-sleeps-baseline.json',
    JUSTIFICATIONS = ['wall-clock-under-test:', 'out-waits:'],
    LOOKBEHIND     = 3,
    ROOT_DIR       = process.cwd(),
    SCAN_ROOT      = 'test/playwright/unit',
    THRESHOLD_MS   = 1000,
    // ECMAScript ends a line on four terminators, not one. The parser counts all of them, so a guard
    // that splits on `\n` alone disagrees with the tree it is reading — and the disagreement is not
    // cosmetic: `line` drives the LOOKBEHIND window, so a miscount pulls a justification marker from a
    // logically distant line into a site's context and DISCHARGES a wait nobody accounted for. Found
    // by @neo-gpt with a mixed LF/U+2028 witness where the marker sat six logical lines away.
    ECMA_LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/;

/**
 * @summary Yields every `CallExpression` in an ESTree tree.
 *
 * A generic descent rather than a dependency: the walk needs one node type, and `acorn-walk` would be
 * a second package to keep in step with the parser for that. The tree carries no `loc` metadata to
 * skip — locations are not requested, and the line is derived from `node.start` where it is needed.
 * @param {Object} node Any ESTree node, array of nodes, or leaf.
 * @yields {Object} Each `CallExpression`, in source order.
 */
function* callExpressions(node) {
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
        for (const child of node) yield* callExpressions(child);
        return
    }

    if (node.type === 'CallExpression') yield node;

    for (const key of Object.keys(node)) {
        yield* callExpressions(node[key])
    }
}

/**
 * @summary Reads a `setTimeout` call's delay in milliseconds, or `NaN` when it is not a fixed wait.
 *
 * The delay comes off the parsed node rather than off text, so every spelling of this threshold —
 * `1_000`, `1e3`, `0x3e8`, `0o1750`, `0b1111101000`, `1000.`, `.1e4`, and `(1000)` — arrives as the
 * same `Literal` value of 1000. That is the whole reason this moved to the AST: the previous matcher
 * was wrong twice in the same direction while enumerating spellings, because the language keeps
 * having more of them, and it was wrong a third time on FORMATTING, which has no bottom at all.
 *
 * A named constant is an `Identifier`, not a `Literal`, so it yields `NaN` and is skipped — the wait
 * names what it waits for, which is exactly what this guard asks of it.
 *
 * The FIRST argument is deliberately free: this guard's subject is the WAIT, not the callback's
 * spelling — an inline `setTimeout(() => {…}, 8000)` blocks the wall clock exactly as long as the
 * Identifier form and names nothing either. The Identifier restriction lived here only because the
 * pre-AST matcher's `[A-Za-z_$][\w$]*` capture group could express nothing else; it was never argued
 * on the merits. What is REFUSED is unchanged: only the delay-literal contract decides that, and a
 * named-constant delay stays out on either arm.
 *
 * One callback form is exempt on the same self-naming principle as the named-constant delay, and
 * {@link isSelfNamingDeadline} owns it: `() => reject(new Error('…'))` is a failure deadline, not a
 * wait — it costs nothing on a green run, fires only to fail a wedged one, and names what it waits
 * for in the error it carries. That is more naming than a marker comment holds, so policing it here
 * would be ceremony, not accounting.
 * @param {Object} node A `CallExpression` node.
 * @returns {Number} Milliseconds, or `NaN` when this is not a fixed-delay `setTimeout`.
 */
function fixedWaitMs(node) {
    if (node.callee?.type !== 'Identifier' || node.callee.name !== 'setTimeout') return NaN;

    if (isSelfNamingDeadline(node.arguments[0])) return NaN;

    const delay = node.arguments[1];

    return delay?.type === 'Literal' && typeof delay.value === 'number' ? delay.value : NaN
}

/**
 * @summary Whether a `setTimeout` callback is a self-naming failure deadline: the single-expression
 * form `() => reject(new Error('…'))`.
 *
 * The exemption is deliberately narrow, because every widening of what this guard SKIPS must fail
 * safe — a form it cannot prove self-naming is simply counted, never waved through:
 *
 * - expression-body arrows only. A block body (`() => { reject(…) }`) is not inspected, because a
 *   block can run anything before the reject; the uniform in-tree idiom is the single-expression
 *   form, and anything else stays visible as a counted site.
 * - the callee must be the bare identifier `reject` — the Promise-executor convention — called with
 * - `new Error('<a string literal>')`: the deadline's name must be statically visible. A variable
 *   message (`reject(new Error(msg))`) or a message-free `reject()` names nothing this guard can
 *   read, so both are still counted.
 * @param {Object} callback The `setTimeout` call's first argument.
 * @returns {Boolean}
 */
function isSelfNamingDeadline(callback) {
    if (callback?.type !== 'ArrowFunctionExpression' && callback?.type !== 'FunctionExpression') return false;

    const body = callback.body;

    return body?.type === 'CallExpression'
        && body.callee?.type === 'Identifier'
        && body.callee.name === 'reject'
        && body.arguments?.[0]?.type === 'NewExpression'
        && body.arguments[0].callee?.type === 'Identifier'
        && body.arguments[0].callee.name === 'Error'
        && body.arguments[0].arguments?.[0]?.type === 'Literal'
        && typeof body.arguments[0].arguments[0].value === 'string'
}

// The workflow-parity SSOT: every glob this guard READS, so the sibling scanned-subset-of-watched
// spec can demand the workflow watch them. The baseline belongs here as much as the specs do — it is
// an INPUT to the verdict, so a run that does not re-trigger on a baseline edit would let a site be
// blessed by editing the record of what exists, with nothing re-reading reality.
export const SCAN_SURFACE = Object.freeze([
    `${SCAN_ROOT}/**/*.mjs`,
    BASELINE_REL
]);

/**
 * @summary Recursively collects `.mjs` files under one directory.
 * @param {String} dir Absolute directory.
 * @param {String[]} [out] Accumulator.
 * @returns {String[]} Absolute file paths.
 */
function collectSpecs(dir, out = []) {
    if (!fs.existsSync(dir)) return out;

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const abs = path.join(dir, entry.name);

        if (entry.isDirectory())            collectSpecs(abs, out);
        else if (entry.name.endsWith('.mjs')) out.push(abs)
    }

    return out
}

/**
 * @summary Finds unjustified fixed second-scale sleeps across the unit spec tree.
 *
 * A justification is accepted from the sleep's own line or the three lines above it, because the idiom
 * puts the explanation in a comment block over the `await`, not trailing it.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {String[]} [options.files] Absolute spec paths; defaults to the whole unit tree.
 * @returns {{backlog: Array<Object>, sites: Array<{file: String, line: Number, ms: Number, text: String}>}}
 */
export function findUnjustifiedSleeps({rootDir = ROOT_DIR, files} = {}) {
    const
        specs   = files || collectSpecs(path.join(rootDir, SCAN_ROOT)),
        backlog = [],
        found   = [];

    for (const abs of specs) {
        const
            source = fs.readFileSync(abs, 'utf8'),
            lines  = source.split(ECMA_LINE_TERMINATOR);

        // `fixedWaitMs` requires an Identifier callee named `setTimeout`, so the literal token must
        // appear in source: no token, no call, nothing a parse could find. 927 of 1,036 unit specs
        // contain no `setTimeout` at all, and parsing them to learn that cost 7x the pre-AST guard's
        // wall clock and got this process SIGKILLed under lint-staged's concurrent task set.
        //
        // This is a substring test in a guard that moved to an AST precisely because substring tests
        // are unsound, so its soundness argument has to be exact — and my first one was wrong. I wrote
        // that the literal token "must appear in source"; @neo-gpt falsified it with
        // `setTimeout(resolve, 1000)`, which acorn resolves to `callee.name === 'setTimeout'`
        // while the source contains no such substring. The filter is conservative over the token, not
        // over the IdentifierName language acorn actually accepts.
        //
        // So a file is admitted when it carries the token OR any Unicode escape — `\u` covers both
        // `\uXXXX` and `\u{X}` forms, and an escaped identifier cannot exist without one. That keeps
        // the filter cheap (escapes are rare in specs) while making its claim true: a skipped file can
        // contain neither a plain nor an escaped `setTimeout` callee.
        //
        // Widening `fixedWaitMs` beyond a `setTimeout` Identifier callee invalidates this argument
        // again, and the equivalence spec is what will say so.
        //
        // It DOES narrow one thing, and the narrowing is deliberate: a file that fails to parse is no
        // longer reported unless it carries the token, because it is no longer parsed. The verdict is
        // unaffected — no token, no call to miss — but this guard used to surface broken files as a
        // side effect and now does so only for files it would actually have inspected. "Does every
        // file parse" is `check-parse.mjs`, which runs in the same pre-commit set and owns it.
        if (!source.includes('setTimeout') && !source.includes('\\u')) continue;

        let tree;

        // A file the guard cannot read is reported, never skipped. Skipping is the exact failure this
        // guard exists to prevent — an unscanned file is indistinguishable from a clean one, and the
        // difference only surfaces as a wait nobody accounted for.
        //
        // `locations` is deliberately NOT requested: it attaches a `loc` object to every node in the
        // tree, and the guard needs a line number only for the few nodes that match. Deriving it from
        // `node.start` at match time is the same number for a third less memory.
        try {
            tree = parse(source, {ecmaVersion: 'latest', sourceType: 'module'})
        } catch (cause) {
            throw new Error(`check-fixed-sleeps: cannot parse ${path.relative(rootDir, abs)}`, {cause})
        }

        // Candidates come off the PARSE TREE, not off text. The matcher this replaced read one source
        // line at a time, so a call split across lines, a delay in parentheses, and an interposed
        // comment each produced zero candidates — three parser-valid fixed waits, silently green.
        // Formatting has no bottom: every fix to a text pattern invites the next spelling.
        //
        // It also DELETES work rather than adding it. The old path needed a comment-line skip and four
        // quote-balancing tests to keep prose and fixture strings from firing the guard; the parser
        // never hands those over in the first place, because they are not calls.
        for (const node of callExpressions(tree)) {
            const ms = fixedWaitMs(node);

            if (!Number.isFinite(ms) || ms < THRESHOLD_MS) continue;

            const
                // Derived from the offset rather than read off `node.loc`, because requesting
                // locations inflates EVERY node to spare this one lookup — counted with ECMAScript
                // line semantics so it agrees with the parser that produced the offset.
                //
                // `line` does NOT key the baseline; `reconcile` keys `file::text` (an earlier version
                // of this comment claimed otherwise, and @neo-gpt corrected it). It is load-bearing
                // for two other things, and both fail OPEN when it is wrong: it selects the LOOKBEHIND
                // window that decides whether a site is justified, so an off-by-N can import a marker
                // from an unrelated line and discharge an unaccounted wait — and it is the coordinate
                // a human uses to find the site at all.
                index   = source.slice(0, node.start).split(ECMA_LINE_TERMINATOR).length - 1,
                // The site's FIRST line is the baseline key together with `file`, which is what keeps
                // existing rows matching: for a single-line call this is the same string the
                // line-based matcher produced.
                text    = lines[index] ?? '',
                context = lines.slice(Math.max(0, index - LOOKBEHIND), index + 1).join('\n');

            // An `out-waits:` site is DISCHARGED here and simultaneously recorded as backlog. Both
            // are true at once and the distinction is the whole point: the wait is now accounted for,
            // and the constant it names is still hardcoded, so the wall clock is still being paid.
            if (context.includes('out-waits:')) {
                backlog.push({
                    file: path.relative(rootDir, abs).replaceAll('\\', '/'),
                    line: index + 1,
                    ms
                });

                continue
            }

            if (JUSTIFICATIONS.some(marker => context.includes(marker))) continue;

            found.push({
                file: path.relative(rootDir, abs).replaceAll('\\', '/'),
                line: index + 1,
                ms,
                text: text.trim()
            })
        }
    }

    // A plain object, never an array carrying an extra property: `toEqual([])` fails against an array
    // with own properties, so the smuggled field turned a passing assertion into a confusing red.
    return {backlog, sites: found}
}

/**
 * @summary Reconciles live findings against the baseline in both directions.
 * @param {Object} options
 * @param {Array<Object>} options.found Live findings.
 * @param {Array<Object>} options.baseline Baseline rows.
 * @returns {{fresh: Array<Object>, stale: Array<Object>}}
 */
export function reconcile({found, baseline}) {
    const
        key   = row => `${row.file}::${row.text}`,
        tally = rows => rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) || 0) + (row.count || 1)), new Map()),
        live  = tally(found),
        rowed = tally(baseline),
        fresh = [],
        stale = [];

    // COUNTS, not membership. Most of these sites are ONE byte-identical line, `setTimeout(resolve,
    // 1000)`, repeated dozens of times in a single file, so a Set keyed on file+text collapses them to
    // ONE entry — and removing all but one would leave the key still matching, nothing stale, and the
    // guard green. That is weaker than the per-file count the baseline was chosen OVER, wearing
    // per-site clothes. Counting occurrences restores site granularity without keying on line numbers,
    // which shift under any edit above them and would turn every unrelated change into false staleness.
    for (const [id, count] of live) {
        const allowed = rowed.get(id) || 0;

        if (count > allowed) fresh.push({...found.find(row => key(row) === id), count: count - allowed})
    }

    // `remaining` rides along because the surplus alone cannot tell a row that lost every site from one
    // that lost some, and those take OPPOSITE remedies: the first is deleted, the second is reduced to
    // the survivors. Deleting a partially-converted row un-accounts the sites it still legitimately
    // grandfathers, which re-reports them as `fresh` — the guard fails from the other side, and the
    // author reads a conversion they just made as a regression they just introduced.
    for (const [id, count] of rowed) {
        const actual = live.get(id) || 0;

        if (actual < count) stale.push({...baseline.find(row => key(row) === id), count: count - actual, remaining: actual})
    }

    return {fresh, stale}
}

/**
 * @summary Runs the guard as a CLI and exits with its verdict.
 *
 * Guarded on direct invocation, and that guard is load-bearing rather than tidy. This module EXPORTS
 * its scan surface so the workflow-parity spec can import it as authority instead of hand-copying
 * globs — and an unguarded top-level body then runs the entire lint, including `process.exit()`,
 * inside every process that imports it. Inside a Playwright worker that exit kills the worker with no
 * failure message: the suite reports NOTHING rather than reporting red, which is strictly worse than
 * a normal failure because nobody can see it.
 * @returns {void}
 */
function main() {
    const
        baselinePath     = path.join(ROOT_DIR, BASELINE_REL),
        baseline         = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : [],
        {backlog, sites} = findUnjustifiedSleeps({}),
        {fresh, stale}   = reconcile({baseline, found: sites});

    const backlogMs = backlog.reduce((sum, row) => sum + row.ms, 0);

    if (fresh.length === 0 && stale.length === 0) {
        console.log(`check-fixed-sleeps: OK — ${sites.length} unaccounted site(s) baselined, 0 new, 0 stale.`);

        // TWO numbers, opposite meanings, printed together because a reader consumes the printed line and
        // not the docstring. The baseline measures ANNOTATION DEBT and should reach zero. The backlog
        // measures WALL CLOCK STILL BEING PAID and reaching zero is a different, harder thing: every
        // `out-waits:` site can be annotated truthfully, emptying the baseline, without the suite getting
        // one millisecond faster. A zeroed baseline means every wait is accounted for. It does NOT mean
        // the suite is fast, and anything reading it as a speed metric is reading the wrong number.
        if (backlog.length) {
            console.log(`check-fixed-sleeps: ${backlog.length} site(s) carry \`out-waits:\` — ~${(backlogMs / 1000).toFixed(1)}s of wall clock still paid to hardcoded constants.`);
            console.log('  This is a LEAF-CANDIDATE BACKLOG, not a failure. It rising is a finding; it falling means a constant became injectable.')
        }

        process.exit(0)
    }

    if (fresh.length) {
        console.error(`check-fixed-sleeps: ${fresh.length} fixed sleep(s) >= ${THRESHOLD_MS}ms with nothing said about what they wait for:\n`);

        for (const row of fresh) {
            console.error(`  ${row.file}:${row.line}  (${row.ms}ms)`);
            console.error(`    ${row.text}`)
        }

        console.error(`
    Say what the wait is FOR. Either marker, on the line or within ${LOOKBEHIND} lines above it:

      // out-waits: <the production constant this is larger than>
      // wall-clock-under-test: <why elapsed time is the thing being asserted>

    Both are legitimate outcomes. \`out-waits:\` is the one that pays forward — a named constant is a
    constant somebody can make injectable, which is the repair that actually removes the wall clock.

    Do NOT reach for deleting the wait. Where the surrounding code polls on a fixed interval, removing a
    sleep pushes injection before the next watermark and costs a WHOLE extra cycle: one measured spec went
    6.4s -> 12.2s on deletion, with every assertion still passing. A sleep you cannot explain is a finding;
    a sleep you delete without measuring is a slower suite that reports green.`)
    }

    if (stale.length) {
        console.error(`\ncheck-fixed-sleeps: ${stale.length} baseline row(s) no longer match a live site — the baseline may only shrink:\n`);

        for (const row of stale) console.error(row.remaining
            ? `  ${row.file}  ${row.text}\n      ${row.count} of these are gone — set "count" to ${row.remaining}, do NOT delete the row.`
            : `  ${row.file}  ${row.text}\n      every site is gone — delete the row.`);

        console.error(`
    A site that was converted (a sleep becoming a readiness poll) or removed leaves its row behind, and a
    baseline permitted to outlive its sites stops describing anything. Reduce the count to the survivors;
    delete only a row that has none. Deleting a row that still has live sites un-accounts them, and they
    come straight back as NEW unaccounted waits — the conversion you just made, reported as a regression.`)
    }

    process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
