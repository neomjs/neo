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
 * Pre-existing sites are grandfathered per-site in `check-fixed-sleeps-baseline.json`. A baseline row
 * whose site no longer matches **also fails**: the baseline may only shrink, and it cannot outlive the
 * sites it grandfathers. Per-site rather than per-file deliberately — these sites tend to CONVERT rather
 * than vanish (a sleep becomes a readiness poll), and a file count would silently absorb a conversion
 * that left the site present.
 */
import fs   from 'node:fs';
import path from 'node:path';

const
    BASELINE_REL   = 'buildScripts/util/check-fixed-sleeps-baseline.json',
    JUSTIFICATIONS = ['wall-clock-under-test:', 'out-waits:'],
    LOOKBEHIND     = 3,
    ROOT_DIR       = process.cwd(),
    SCAN_ROOT      = 'test/playwright/unit',
    SLEEP_RE       = /setTimeout\(\s*[A-Za-z_$][\w$]*\s*,\s*(\d+)\s*\)/,
    THRESHOLD_MS   = 1000;

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
 * @returns {Array<{file: String, line: Number, ms: Number, text: String}>}
 */
export function findUnjustifiedSleeps({rootDir = ROOT_DIR, files} = {}) {
    const
        specs   = files || collectSpecs(path.join(rootDir, SCAN_ROOT)),
        backlog = [],
        found   = [];

    for (const abs of specs) {
        const lines = fs.readFileSync(abs, 'utf8').split('\n');

        lines.forEach((text, index) => {
            const match = SLEEP_RE.exec(text);

            if (!match || Number(match[1]) < THRESHOLD_MS) return;

            const context = lines.slice(Math.max(0, index - LOOKBEHIND), index + 1).join('\n');

            // An `out-waits:` site is DISCHARGED here and simultaneously recorded as backlog. Both
            // are true at once and the distinction is the whole point: the wait is now accounted for,
            // and the constant it names is still hardcoded, so the wall clock is still being paid.
            if (context.includes('out-waits:')) {
                backlog.push({
                    file: path.relative(rootDir, abs).replaceAll('\\', '/'),
                    line: index + 1,
                    ms  : Number(match[1])
                });

                return
            }

            if (JUSTIFICATIONS.some(marker => context.includes(marker))) return;

            found.push({
                file: path.relative(rootDir, abs).replaceAll('\\', '/'),
                line: index + 1,
                ms  : Number(match[1]),
                text: text.trim()
            })
        })
    }

    found.backlog = backlog;

    return found
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
        key      = row => `${row.file}::${row.text}`,
        liveKeys = new Set(found.map(key)),
        rowKeys  = new Set(baseline.map(key));

    return {
        fresh: found.filter(row => !rowKeys.has(key(row))),
        stale: baseline.filter(row => !liveKeys.has(key(row)))
    }
}

const
    baselinePath   = path.join(ROOT_DIR, BASELINE_REL),
    baseline       = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : [],
    found          = findUnjustifiedSleeps({}),
    {fresh, stale} = reconcile({found, baseline});

const backlogMs = (found.backlog || []).reduce((sum, row) => sum + row.ms, 0);

if (fresh.length === 0 && stale.length === 0) {
    console.log(`check-fixed-sleeps: OK — ${found.length} unaccounted site(s) baselined, 0 new, 0 stale.`);

    // TWO numbers, opposite meanings, printed together because a reader consumes the printed line and
    // not the docstring. The baseline measures ANNOTATION DEBT and should reach zero. The backlog
    // measures WALL CLOCK STILL BEING PAID and reaching zero is a different, harder thing: every
    // `out-waits:` site can be annotated truthfully, emptying the baseline, without the suite getting
    // one millisecond faster. A zeroed baseline means every wait is accounted for. It does NOT mean
    // the suite is fast, and anything reading it as a speed metric is reading the wrong number.
    if (found.backlog?.length) {
        console.log(`check-fixed-sleeps: ${found.backlog.length} site(s) carry \`out-waits:\` — ~${(backlogMs / 1000).toFixed(1)}s of wall clock still paid to hardcoded constants.`);
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

    for (const row of stale) console.error(`  ${row.file}  ${row.text}`);

    console.error(`
Remove these rows. A site that was converted (a sleep becoming a readiness poll) or removed leaves its
row behind, and a baseline permitted to outlive its sites stops describing anything.`)
}

process.exit(1)
