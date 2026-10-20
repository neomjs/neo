import {execFileSync}                                                  from 'child_process';
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {createRequire}                                                 from 'module';
import {tmpdir}                                                        from 'os';
import {join, relative}                                                from 'path';
import {selectExternalBrainSpecs}                                      from '../../test/playwright/externalBrainSelection.mjs';
import isEntryModule                                                   from './isEntryModule.mjs';

/**
 * @summary The one place that decides which e2e specs the CI tier runs, and the one place that
 * reports what that decision covered.
 *
 * @description Both halves live here on purpose. The workflow previously carried the spec paths in
 * its run step and re-derived the counts in a separate arithmetic reporter, so the two could drift
 * and the summary could describe a selection nobody ran. `--paths` and `--summary` now read the same
 * constants, and {@link assertSelectionFloor} fails the job if the executed population shrinks
 * below what this file declares — a new exclusion has to be written down here to take effect.
 *
 * Three populations are excluded, and they are not the same kind of thing:
 *
 * - **Brain-dependent** — removed by `testIgnore` in `playwright.config.e2e.mjs`, which deselects
 *   rather than skips: no reporter can name them, and a run missing four fifths of the tier still
 *   prints `Skipped: 0`. That invisibility is why this file reports the fraction at all.
 * - **GPU** — specs booting the workstation app, which inherits animated OffscreenCanvas work no
 *   hosted runner can composite.
 * - **Observed failures** — arms that fail for reasons NOT established here. They carry an owner
 *   rather than a diagnosis, because naming an unverified cause is worse than admitting one is
 *   missing.
 *
 * An exclusion's `kind` is about the CAUSE, and it has three values because two were not enough.
 * `cause` and `observed` split "we know why" from "we do not", and both were honest — but an entry
 * marked `cause` was quietly claiming its reason covered EVERY failing arm in that file, and one of
 * them did not: it explained 8 of 11, while 3 arms needing nothing it mentioned failed anyway.
 * `partial` exists so a real-but-incomplete diagnosis cannot present itself as a complete one,
 * which is the same false reassurance as an undeclared exclusion wearing better clothes.
 */

/**
 * Spec paths the CI tier executes, relative to the repository root. Directories expand to every
 * spec beneath them; individual files are named where a sibling in the same directory is excluded.
 * @member {String[]} RUN_PATHS
 */
export const RUN_PATHS = [
    'test/playwright/e2e/colors',
    'test/playwright/e2e/core',
    'test/playwright/e2e/dashboard',
    'test/playwright/e2e/grid',
    'test/playwright/e2e/portal',
    'test/playwright/e2e/realworld',
    'test/playwright/e2e/rendering/DeltaUpdatesChangeNodeName.spec.mjs',
    'test/playwright/e2e/rendering/GraphScene.spec.mjs',
    'test/playwright/e2e/rendering/InputModalityMultiWindow.spec.mjs',
    'test/playwright/e2e/rendering/MountHookIsolation.spec.mjs',
    'test/playwright/e2e/rendering/ViewTransitionReveal.spec.mjs',
    'test/playwright/e2e/table'
];

/**
 * Specs deliberately outside {@link RUN_PATHS}, each with the reason it is out and who owns getting
 * it back. `cause` is stated only where it was verified; `observed` records a failure whose cause is
 * NOT established, which is a different and more honest claim.
 * @member {Object[]} EXCLUSIONS
 */
export const EXCLUSIONS = [{
    path  : 'test/playwright/e2e/rendering/LivePreviewMultiWindow.spec.mjs',
    kind  : 'cause',
    reason: 'parameterised over Dev, Dist Dev and Dist Prod. The 8 Dist arms need built bundles this job does not produce, and that is verified. The 4 Dev arms pass hosted; the 3 that visit `#/learn/benefits/body/FormsEngine` had failed because its code fences waited on a highlight bundle this job did not build',
    owner : 'this tier — the Dist half needs a production build this job does not run'
}];

/**
 * Arms that ARE selected but skip themselves under `NEO_TEST_SKIP_CI`. Declared here as well as at
 * their call site so the job summary can name them: a quarantine that appears only as an anonymous
 * skip in a test log is the silent quarantine this file exists to prevent, and an owner is what
 * separates a debt marker from an abandonment.
 * @member {Object[]} QUARANTINES
 */
export const QUARANTINES = [];

/**
 * Brain-gated specs that need a capability a hosted runner may lack. An entry applies only while its
 * variable is unset, the same way the whole tier keys on `NEO_AGENTOS_RUNTIME_ROOT`, so provisioning the
 * capability brings the files back without anyone editing this list.
 * @member {Object[]} BRAIN_CAPABILITIES
 */
export const BRAIN_CAPABILITIES = [{
    requires: 'NEO_MCP_REMOTE_TOKEN',
    paths   : [
        'test/playwright/e2e/dashboard/DemoBDockTransactionsNL.spec.mjs',
        'test/playwright/e2e/neural-link/TransactionArchiveReplay.spec.mjs'
    ],
    reason : 'their transaction archive lives in a Memory Core, whose client refuses to connect without this credential (`archive-store-unavailable`)',
    exit   : 'CI provisions a Memory Core archive and both files pass against it',
    tracker: '#17844'
}];

/**
 * Brain-gated tests that run hosted but fail there for a reason not yet diagnosed. Each is deselected by
 * file and title through Playwright's `--test-list-invert`, so no spec is edited. An entry names who is
 * accountable, what removes it and since when, and every receipt flags one older than
 * {@link QUARANTINE_STALE_DAYS} days: a quarantine without a retirement trigger becomes the permanent
 * exclusion it was meant to avoid.
 * @member {Object[]} BRAIN_QUARANTINES
 */
export const BRAIN_QUARANTINES = [{
    path       : 'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
    titlePath  : ['Workstation — the film tour plays from the toolbar', 'Start film tour runs all scenes; the viewer\'s Continue clicks open every window'],
    reason     : 'hosted: journey hop 4 can refuse the drag while the vessel slot is free and no theme file is in flight (the hop diag), and the film arms take about three minutes of one shard\'s five-minute step',
    accountable: '@neo-opus-grace',
    exit       : '#19919: hop 4 diagnosed and fixed, and the spec fits its shard',
    since      : '2026-10-20'
}, {
    path       : 'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
    titlePath  : ['Workstation — the film tour plays from the toolbar', 'under autoGates the film runs unattended: earlier windows close and the signature matrix stays open'],
    reason     : 'hosted: the same hop-4 refusal as the viewer-driven tour',
    accountable: '@neo-opus-grace',
    exit       : '#19919',
    since      : '2026-10-20'
}];

/**
 * Days a quarantine may stand before every receipt flags it as stale.
 * @member {Number} QUARANTINE_STALE_DAYS
 */
export const QUARANTINE_STALE_DAYS = 7;

/**
 * The Brain-gated tier's one-retry bridge while its intermittent set is diagnosed. It ends on `until` without anyone
 * editing it, the same way a quarantine ages. A retry runs in a fresh worker, so a cross-file leak always heals on
 * it. Every receipt therefore names each test that needed the retry, and a test red on every attempt stays red.
 * @member {Object} BRAIN_RETRY_BRIDGE
 */
export const BRAIN_RETRY_BRIDGE = {
    retries: 1,
    until  : '2026-10-25',
    reason : 'the intermittent set is still being diagnosed',
    tracker: '#19655'
};

/**
 * The Brain-gated files a pull request runs when its change is outside the E2E impact boundary
 * (`classify-test-scope.yml`'s `e2e_brain_tier`). Such a change cannot reach the tier's specs, so what can
 * still break is the pairing with the Brain's `dev` tip: one fast, stable file for each surface the tier covers,
 * none of them capability-gated or quarantined.
 * @member {String[]} BRAIN_SMOKE
 */
export const BRAIN_SMOKE = [
    'test/playwright/e2e/dashboard/DockDragDropNL.spec.mjs',
    'test/playwright/e2e/dashboard/DockTourSmokeNL.spec.mjs',
    'test/playwright/e2e/grid/BigDataNL.spec.mjs',
    'test/playwright/e2e/neural-link/CreateComponentMultiWindow.spec.mjs',
    'test/playwright/e2e/neural-link/Fixture.spec.mjs',
    'test/playwright/e2e/rendering/ContextMenuNL.spec.mjs',
    'test/playwright/e2e/workstation/WindowGeometryRealChromeNL.spec.mjs',
    'test/playwright/e2e/write-guard/MultiWriterNL.spec.mjs'
];

/**
 * The populations the Brain-gated tier can run, and why each is chosen.
 * @member {Object} BRAIN_TIERS
 */
export const BRAIN_TIERS = {
    full : 'every Brain-gated file, because the change reaches the E2E impact boundary or this is a `dev` push',
    smoke: `the ${BRAIN_SMOKE.length} smoke files, because the change is outside the E2E impact boundary; a green smoke is not full-tier evidence`
};

/**
 * @summary Walks a directory for spec files.
 * @param {String} dir
 * @returns {String[]}
 */
function walk(dir) {
    return readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name.endsWith('.spec.mjs') ? [join(dir, entry.name)] : [])
}

/**
 * @summary Counts every population the reader needs to tell a partial green from a whole one.
 * @param {String} [root=process.cwd()]
 * @returns {{brainFree: Number, executed: Number, gpu: Number, ignored: Number, total: Number}}
 */
export function populations(root = process.cwd()) {
    const e2e             = join(root, 'test/playwright/e2e'),
          {ignore, total} = selectExternalBrainSpecs(e2e),
          isIgnored       = file => ignore.some(pattern => pattern.test(file)),
          // Only the Brain-FREE workstation specs; the rest are already deselected, and counting
          // them again reports a negative coverage.
          gpu             = walk(join(e2e, 'workstation')).filter(file => !isIgnored(file)).length,
          // Counted through the SAME ignore set Playwright applies, because a directory in
          // RUN_PATHS names Brain-dependent specs the config will deselect. Counting what the paths
          // name rather than what the run selects reported 52 against an expected 14 — two
          // different notions of "selected", which is the defect this file exists to remove.
          executed        = RUN_PATHS.flatMap(path => path.endsWith('.spec.mjs')
              ? [join(root, path)]
              : walk(join(root, path))).filter(file => !isIgnored(file)).length;

    return {brainFree: total - ignore.length, executed, gpu, ignored: ignore.length, total}
}

/**
 * @summary Refuses a run whose executed population is smaller than this file declares.
 * @description Without it, a path typo or a directory rename shrinks coverage silently and the job
 * still reports green — the failure mode a coverage line alone cannot catch, because it would
 * faithfully report the smaller number.
 * @param {String} [root=process.cwd()]
 * @returns {Number} The executed spec-file count.
 * @throws {Error} When fewer specs are selected than declared.
 */
export function assertSelectionFloor(root = process.cwd()) {
    const {brainFree, executed, gpu} = populations(root),
          expected                   = brainFree - gpu - EXCLUSIONS.length;

    if (executed !== expected) {
        throw new Error(`e2e CI selection: expected ${expected} spec files (${brainFree} Brain-free ` +
            `− ${gpu} GPU − ${EXCLUSIONS.length} excluded) but RUN_PATHS resolves ${executed}. ` +
            'Either a path is stale or an exclusion is undeclared; both are silent coverage loss.')
    }

    return executed
}

/**
 * @summary Renders the job-summary markdown.
 * @param {String} [root=process.cwd()]
 * @returns {String}
 */
export function summary(root = process.cwd()) {
    const {brainFree, executed, gpu, ignored, total} = populations(root);

    return [
        '### e2e (engine tier) coverage',
        '',
        `This job selected **${executed} of ${total}** e2e spec files.`,
        '',
        `- **${ignored}** need an external \`neo-agent-brain\` checkout. \`testIgnore\` DESELECTS them, so they cannot appear as skips in any report — a run missing them still prints \`Skipped: 0\`.`,
        `- **${gpu}** boot the workstation app, which inherits animated OffscreenCanvas work a hosted runner cannot composite.`,
        ...EXCLUSIONS.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ` +
            ({cause: '', observed: '**cause not established.** ', partial: '**cause covers only part of the failures.** '}[entry.kind]) +
            `${entry.reason}. Owner: ${entry.owner}.`),
        '',
        // Rendered only when the list has entries. An empty heading reads as "nothing to declare
        // here", which is the same reassurance an undeclared quarantine would give.
        ...(QUARANTINES.length ? [
            'Selected but quarantined — these run in the tier and skip themselves, so they appear as skips rather than coverage:',
            ...QUARANTINES.map(entry => `- \`${entry.path.replace('test/playwright/e2e/', '')}\` — ${entry.reason}. Owner: ${entry.owner}.`),
            ''
        ] : ['No arm in this tier is quarantined. Skips still in the log come from `test.fixme` contracts — rows declared but not yet written — which are a spec\'s own debt rather than a failure this job suppressed.', '']),
        // `total - executed`, never a sum of the named classes. The sum was `ignored + gpu`, which
        // omitted EXCLUSIONS and reported 89 where the header two paragraphs above said 14 of 105 —
        // a guard whose only job is accurate counting, contradicting itself. A corrected sum would
        // have the same defect one exclusion class later; a subtraction from the selected count
        // cannot drift, because both operands are the ones the header already stands behind.
        `**Selected is not executed.** This line reports what the job SELECTED; whether those specs ran and passed is the job's own status, because a provisioning failure reaches this summary too. A green check certifies the ${executed} selected files only — any skip inside them is accounted for above, while the ${total - executed} excluded files appear nowhere in the run at all.`
    ].join('\n')
}

/**
 * @summary One line stating what the run covers, for the job LOG rather than the step summary.
 *
 * The summary is the complete account and lives where a reader has to go looking for it. This is the
 * same arithmetic in one line, printed beside the work, so the number a reader meets first is the
 * accurate one. Both come from {@link populations}, so they cannot disagree.
 * @param {String} [root=process.cwd()]
 * @returns {String}
 */
export function coverageLine(root = process.cwd()) {
    const {executed, total} = populations(root);

    return `e2e coverage: ${executed} of ${total} spec files selected, ${total - executed} excluded. ` +
        `Excluded files are DESELECTED, not skipped — no reporter below can name them. ` +
        `The job summary lists every exclusion class and its owner.`
}

/**
 * @summary The Brain-gated spec files, relative to the repository root: every spec the `neuralLink`
 * fixture gates. `test-e2e-brain.yml` runs exactly these, with a Brain provisioned.
 * @param {String} [root=process.cwd()]
 * @returns {String[]}
 */
export function brainPaths(root = process.cwd()) {
    const e2e      = join(root, 'test/playwright/e2e'),
          {ignore} = selectExternalBrainSpecs(e2e);

    return walk(e2e).filter(file => ignore.some(pattern => pattern.test(file))).map(file => relative(root, file)).sort()
}

/**
 * @summary What this environment runs of the Brain-gated tier: the tier's files except those whose
 * capability is unset here.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env]
 * @param {String} [options.root=process.cwd()]
 * @param {String} [options.tier='full'] A {@link BRAIN_TIERS} key
 * @returns {{absent: Object[], gated: String[], paths: String[]}} The capability entries whose variable is
 *          unset, every Brain-gated file, and the files to run.
 * @throws {Error} For a tier that is not a {@link BRAIN_TIERS} key.
 */
export function brainSelection({env = process.env, root = process.cwd(), tier = 'full'} = {}) {
    if (!Object.hasOwn(BRAIN_TIERS, tier)) {
        throw new Error(`Unknown Brain-gated tier '${tier}'; expected ${Object.keys(BRAIN_TIERS).join(' or ')}.`)
    }

    const gated    = brainPaths(root),
          absent   = BRAIN_CAPABILITIES.filter(entry => !env[entry.requires]),
          excluded = absent.flatMap(entry => entry.paths),
          pool     = tier === 'smoke' ? gated.filter(path => BRAIN_SMOKE.includes(path)) : gated;

    return {absent, gated, paths: pool.filter(path => !excluded.includes(path))}
}

/**
 * @summary Refuses a declaration whose file is no longer a Brain-gated spec, and a smoke file that is
 * capability-gated or quarantined, naming every such entry.
 * @description A deleted or moved file would otherwise leave an entry naming nothing while every receipt
 * went on listing it. A smoke file runs whole on every pull request, so a smoke receipt has no exclusion to
 * explain. Titles are {@link assertQuarantinesResolve}'s job.
 * @param {Object}   [options]
 * @param {Object[]} [options.capabilities=BRAIN_CAPABILITIES]
 * @param {Object[]} [options.quarantines=BRAIN_QUARANTINES]
 * @param {String[]} [options.smoke=BRAIN_SMOKE]
 * @param {String}   [options.root=process.cwd()]
 * @throws {Error} Naming every stale entry, or every declared smoke file.
 */
export function assertBrainDeclarations({capabilities = BRAIN_CAPABILITIES, quarantines = BRAIN_QUARANTINES, smoke = BRAIN_SMOKE, root = process.cwd()} = {}) {
    const gated    = brainPaths(root),
          declared = [...capabilities.flatMap(entry => entry.paths), ...quarantines.map(entry => entry.path)],
          stale    = [...declared, ...smoke].filter(path => !gated.includes(path)),
          unstable = smoke.filter(path => declared.includes(path));

    if (stale.length) {
        throw new Error(`Brain-gated e2e declarations name files that are not Brain-gated specs:\n- ${stale.join('\n- ')}\n` +
            'Update or remove them in buildScripts/util/e2eCiSelection.mjs.')
    }

    if (unstable.length) {
        throw new Error(`Brain-gated smoke files must run whole, but these are capability-gated or quarantined:\n- ${unstable.join('\n- ')}\n` +
            'Choose other smoke files in buildScripts/util/e2eCiSelection.mjs.')
    }
}

/**
 * @summary One quarantine entry as a Playwright test-list line: `file › describe › test`, the file relative to
 * the e2e `testDir`, which is how Playwright resolves it.
 * @param {Object} entry
 * @returns {String}
 */
function testListLine(entry) {
    return [entry.path.replace('test/playwright/e2e/', ''), ...entry.titlePath].join(' › ')
}

/**
 * @summary The quarantine as a Playwright test list for `--test-list-invert`.
 * @returns {String}
 */
export function brainTestList() {
    return BRAIN_QUARANTINES.map(testListLine).join('\n')
}

/**
 * @summary Asks Playwright which registered tests each quarantine entry selects, through its own `--list`
 * with the entry as the test list. Each entry must select exactly one.
 * @description A renamed title or a new enclosing `describe` leaves an entry selecting nothing while its
 * strings still appear in the source, so only Playwright's own matcher can tell. Listing loads the spec
 * files but no fixture, so any `NEO_AGENTOS_RUNTIME_ROOT` lifts the config's Brain deselection. The unit
 * tier runs this on every pull request, so the change that breaks an entry fails.
 * @param {Object}   [options]
 * @param {Object[]} [options.quarantines=BRAIN_QUARANTINES]
 * @param {String}   [options.root=process.cwd()]
 * @throws {Error} Naming every entry that does not select exactly one test.
 */
export function assertQuarantinesResolve({quarantines = BRAIN_QUARANTINES, root = process.cwd()} = {}) {
    const cli   = createRequire(import.meta.url).resolve('@playwright/test/cli'),
          dir   = mkdtempSync(join(tmpdir(), 'neo-brain-quarantine-')),
          list  = join(dir, 'entry.txt'),
          count = suite => (suite.specs?.length ?? 0) + (suite.suites ?? []).reduce((sum, child) => sum + count(child), 0),
          stale = [];

    try {
        for (const entry of quarantines) {
            writeFileSync(list, testListLine(entry) + '\n');

            const report = JSON.parse(execFileSync(process.execPath, [
                cli, 'test', '--config', 'test/playwright/playwright.config.e2e.mjs',
                '--list', '--reporter=json', '--test-list', list, entry.path
            ], {
                cwd  : root,
                env  : {...process.env, NEO_AGENTOS_RUNTIME_ROOT: process.env.NEO_AGENTOS_RUNTIME_ROOT || root},
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString());

            count({suites: report.suites}) === 1 || stale.push(testListLine(entry))
        }
    } finally {
        rmSync(dir, {force: true, recursive: true})
    }

    if (stale.length) {
        throw new Error(`Brain-gated e2e quarantines do not select exactly one registered test:\n- ${stale.join('\n- ')}\n` +
            'Update or remove them in buildScripts/util/e2eCiSelection.mjs.')
    }
}

/**
 * @summary How many retries the Brain-gated tier runs with: the bridge's count through its end date, then none.
 * @param {Date} [now=new Date()]
 * @returns {Number}
 */
export function brainRetries(now = new Date()) {
    return now <= new Date(`${BRAIN_RETRY_BRIDGE.until}T23:59:59.999Z`) ? BRAIN_RETRY_BRIDGE.retries : 0
}

/**
 * @summary The first line of an attempt's recorded error, in whichever shape Playwright serialized it.
 * @description A thrown `Error` carries `message`; anything else thrown carries only `value`; and the
 * `errors` envelope can hold an error with no `error` field beside it. The first nonblank line among them
 * wins, so an empty field never hides a populated one. Only when all of them are blank did the attempt
 * record no error.
 * @param {Object|undefined} result One attempt from a Playwright JSON report.
 * @returns {String}
 */
function firstLine(result) {
    const error = result?.error,
          texts = [error?.message, error?.value, ...(result?.errors ?? []).map(entry => entry?.message), error?.stack];

    for (const text of texts) {
        const line = text?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find(line => line.trim());

        if (line) {
            return line
        }
    }

    return 'no error recorded'
}

/**
 * @summary The report's tests that failed an attempt and passed a later one, each with its first attempt's
 * error. A test red on every attempt is Playwright's `unexpected`, so it never appears here.
 * @param {Object} report A Playwright JSON report.
 * @returns {{error: String, file: String, title: String}[]}
 */
export function flakyTests(report) {
    const flaky = [],
          walk  = (suite, titles) => {
              for (const spec of suite.specs ?? []) {
                  for (const test of spec.tests ?? []) {
                      test.status === 'flaky' && flaky.push({
                          error: firstLine(test.results?.[0]),
                          file : spec.file,
                          title: [...titles, spec.title].join(' › ')
                      })
                  }
              }

              (suite.suites ?? []).forEach(child => walk(child, [...titles, child.title]))
          };

    report.suites.forEach(suite => walk(suite, []));

    return flaky
}

/**
 * @summary Renders one Brain-gated tier shard's receipt: the run's identity and tier, its test time against the
 * five-minute ceiling the engine tier keeps, what the tier selected and why anything is out, the retry
 * bridge and every test that needed it, and the files the shard ran with their outcome.
 * @param {Object}      options
 * @param {Object|null} options.report  The shard's Playwright JSON report, `null` when it wrote none.
 * @param {Object}      options.run     `{shard, event, attempt, engineSha, brainSha, tier}`; `tier` defaults to `full`
 * @param {Number|null} options.seconds The test step's wall time, `null` when the step did not finish.
 * @param {Number|null} [options.retries=null] The retry count the run step selected, `null` when it recorded
 *        none. Read from the run, never recomputed: a run that starts before the bridge ends and finishes
 *        after it still retried.
 * @param {Object}      [options.env=process.env]
 * @param {Date}        [options.now=new Date()] What a quarantine's age is measured against.
 * @param {String}      [options.root=process.cwd()]
 * @returns {String}
 */
export function brainReceipt({report, run, seconds, retries = null, env = process.env, now = new Date(), root = process.cwd()}) {
    const {brainFree}            = populations(root),
          tier                   = run.tier ?? 'full',
          {absent, gated, paths} = brainSelection({env, root, tier}),
          // No declaration touches a smoke file (assertBrainDeclarations), so a smoke receipt has none to explain
          capabilities           = tier === 'full' ? BRAIN_CAPABILITIES : [],
          quarantines            = tier === 'full' ? BRAIN_QUARANTINES : [],
          ceiling                = 300,
          days                   = since => Math.floor((now - new Date(since)) / 86400000),
          minutes                = value => `${Math.floor(value / 60)}m ${value % 60}s`,
          short                  = path => `\`${path.replace('test/playwright/e2e/', '')}\``;

    return [
        `### Brain-gated e2e · ${tier} tier · shard ${run.shard}`,
        '',
        `- **Run:** ${run.event}, attempt ${run.attempt}`,
        `- **Tier:** ${tier} — ${BRAIN_TIERS[tier]}.`,
        `- **Engine:** \`${run.engineSha}\` · **Brain \`dev\` tip**, resolved once for every shard: \`${run.brainSha}\``,
        `- **Test time:** ${seconds === null
            ? 'none, because the step did not finish'
            : `${minutes(seconds)} against the ${minutes(ceiling)} ceiling${seconds > ceiling ? ' (**over**)' : ''}`}`,
        `- **Selected:** ${paths.length} of the ${gated.length} Brain-gated spec files, with ${quarantines.length} of their tests quarantined. The ${brainFree} Brain-free files are the engine tier's.`,
        ...capabilities.map(entry => absent.includes(entry)
            ? `- **Excluded while \`${entry.requires}\` is unset:** ${entry.paths.map(short).join(', ')}, because ${entry.reason}. They return when ${entry.exit} (${entry.tracker}).`
            : `- **\`${entry.requires}\` is set,** so ${entry.paths.map(short).join(', ')} are selected.`),
        ...quarantines.map(entry => `- **Quarantined:** ${short(entry.path)} › ${entry.titlePath.at(-1)} — ${entry.reason}. ` +
            `Accountable: ${entry.accountable}. Exit: ${entry.exit}. Since ${entry.since}, ${days(entry.since)} days` +
            `${days(entry.since) > QUARANTINE_STALE_DAYS ? ' (**stale**)' : ''}.`),
        retries === null
            ? '- **Retries:** unknown, because the run step recorded none.'
            : retries
                ? `- **Retries:** ${retries} for this run, from the bridge through ${BRAIN_RETRY_BRIDGE.until} (${BRAIN_RETRY_BRIDGE.tracker}), because ${BRAIN_RETRY_BRIDGE.reason}. A test red on every attempt stays red.`
                : `- **Retries:** none for this run. The bridge's last day is ${BRAIN_RETRY_BRIDGE.until}.`,
        // Without a report the shard's files are unknown, which is not the same as zero
        ...report ? [
            `- **This shard:** ${report.suites.length} files · ${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.flaky} flaky, ${report.stats.skipped} skipped`,
            ...flakyTests(report).map(test => `- **Needed the retry:** \`${test.file}\` › ${test.title} — first attempt: ${test.error}`),
            '',
            ...report.suites.map(suite => `- \`${suite.file}\``)
        ] : ['- **This shard:** unknown, because the run wrote no Playwright report']
    ].join('\n')
}

if (isEntryModule(import.meta.url)) {
    const mode = process.argv[2];

    if (mode === '--coverage-line') {
        console.log(coverageLine());
        process.exit(0)
    }

    if (mode === '--paths') {
        assertSelectionFloor();
        process.stdout.write(RUN_PATHS.join(' '))
    } else if (mode === '--summary') {
        process.stdout.write(summary() + '\n')
    } else if (mode === '--brain-paths') {
        assertBrainDeclarations();
        process.stdout.write(brainSelection({tier: process.env.TIER || 'full'}).paths.join(' '))
    } else if (mode === '--brain-test-list') {
        process.stdout.write(brainTestList() + '\n')
    } else if (mode === '--brain-retries') {
        process.stdout.write(String(brainRetries()))
    } else if (mode === '--brain-receipt') {
        const {ATTEMPT, BRAIN_SHA, ENGINE_SHA, EVENT, REPORT, RETRIES, SHARD, TEST_SECONDS, TIER} = process.env;
        let   report                                                                              = null;

        try {
            report = JSON.parse(readFileSync(REPORT, 'utf8'))
        } catch {}

        process.stdout.write(brainReceipt({
            report,
            run    : {shard: SHARD, event: EVENT, attempt: ATTEMPT, engineSha: ENGINE_SHA, brainSha: BRAIN_SHA, tier: TIER || 'full'},
            retries: RETRIES ? Number(RETRIES) : null,
            seconds: TEST_SECONDS ? Number(TEST_SECONDS) : null
        }) + '\n')
    } else {
        console.error('usage: e2eCiSelection.mjs --paths | --summary | --brain-paths | --brain-test-list | --brain-retries | --brain-receipt');
        process.exit(2)
    }
}
