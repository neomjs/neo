import {test, expect}  from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    assertBrainDeclarations,
    assertQuarantinesResolve,
    BRAIN_CAPABILITIES,
    BRAIN_DURATIONS,
    BRAIN_QUARANTINES,
    BRAIN_RETRY_BRIDGE,
    BRAIN_SMOKE,
    BRAIN_TIERS,
    brainDurations,
    brainPaths,
    brainReceipt,
    brainRetries,
    brainSelection,
    brainShard,
    brainTestList,
    enginePaths,
    EXCLUSIONS,
    flakyTests,
    FULL_SHARDS,
    populations,
    QUARANTINE_STALE_DAYS,
    RUN_PATHS,
    selectionOutput,
    selectSpecs,
    summary,
    tierSelection
} from '../../../../../buildScripts/util/e2eCiSelection.mjs';
import {FOUNDATION, RUNTIME_LOADING, specReach} from '../../../../../buildScripts/util/e2eSpecReach.mjs';

/**
 * The e2e tier's coverage summary is an honesty guard: `testIgnore` DESELECTS the Brain-dependent
 * specs rather than skipping them, so no reporter can name them and a run missing four fifths of
 * the tier still prints `Skipped: 0`. This summary is the only artifact that says what a green
 * check actually certifies.
 *
 * Which makes its arithmetic load-bearing rather than cosmetic. It shipped stating that
 * `${ignored + gpu}` files were excluded — a sum of two named classes that omitted a third — so the
 * sentence reported 89 while its own header two paragraphs above said 14 of 105. A guard whose one
 * job is accurate counting, contradicting itself in the paragraph a reader trusts most.
 *
 * The arms below assert the numbers RECONCILE rather than pinning any of them. A pinned `14` passes
 * today and rots on the next spec added, which is the failure mode a coverage guard can least
 * afford: it would go on being green while describing a tier that had moved.
 */
test.describe('e2e CI selection — the coverage summary must add up', () => {
    const root = path.resolve(import.meta.dirname, '../../../../..');

    test('selected plus excluded equals the total, in the prose as well as the header', () => {
        const {executed, total} = populations(root),
              text              = summary(root);

        expect(text).toContain(`**${executed} of ${total}**`);

        // The residual as the prose states it, read back rather than recomputed — the defect was
        // that these two sentences disagreed, so reading one and trusting the other proves nothing.
        const stated = Number(text.match(/while the (\d+) excluded files appear nowhere/)?.[1]);

        expect(stated, 'the prose must state a residual at all').not.toBeNaN();
        expect(stated, 'and it must be the header\'s own complement').toBe(total - executed);
    });

    test('the residual accounts for EVERY class, including any a named sum would omit', () => {
        // The identity the subtraction relies on, asserted directly rather than through today's
        // figures: the complement of the selected count equals the sum of every exclusion class
        // that exists. It holds when `EXCLUSIONS` is empty as readily as when it is not, so this
        // arm does not require the tree to currently carry a third class — a requirement that would
        // make the guard's own coverage depend on the defect still being present.
        const {brainFree, executed, gpu, ignored, total} = populations(root);

        expect(total - executed, 'the complement must account for every class')
            .toBe(ignored + gpu + EXCLUSIONS.length);

        expect(summary(root)).toContain(`${total - executed} excluded files`);

        // Pins the relationship `assertSelectionFloor` also depends on, so the two cannot drift.
        expect(executed).toBe(brainFree - gpu - EXCLUSIONS.length);
    });

    /**
     * Builds a minimal tree `populations()` can walk: every `RUN_PATHS` directory populated, plus the
     * `workstation` directory the GPU count reads. Returns the root and a helper that adds one more
     * engine-only spec anywhere beneath `e2e`.
     * @returns {Object} `{root, addSpec}`
     */
    const makeSelectionTree = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-e2e-populations-')),
              e2e  = path.join(root, 'test/playwright/e2e'),
              add  = relative => {
                  const file = path.join(e2e, relative);

                  fs.mkdirSync(path.dirname(file), {recursive: true});
                  // The body must not name the Brain fixture. The selector greps file CONTENTS, so
                  // a descriptive string saying which fixture is absent marks the file as needing
                  // it — this fixture first read `no neuralLink fixture` and every spec in it was
                  // deselected, giving an executed count of zero.
                  fs.writeFileSync(file, 'engine only')
              };

        fs.mkdirSync(path.join(e2e, 'workstation'), {recursive: true});

        // One spec per entry: the named file itself, or one inside the named directory
        RUN_PATHS.forEach(runPath => {
            const relative = path.relative('test/playwright/e2e', runPath);

            add(relative.endsWith('.spec.mjs') ? relative : path.join(relative, 'Selected.spec.mjs'))
        });

        return {root, addSpec: add}
    };

    test('a NEW exclusion class moves the published complement, on a controlled tree', () => {
        // The discriminator that does not depend on the real tree's current contents. A spec placed
        // outside `RUN_PATHS` is an exclusion by construction — the same shape as a future class
        // nobody has invented yet — so this exercises the property directly rather than through
        // whichever classes happen to exist today.
        //
        // A summing implementation would enumerate the classes it knows and miss this one, leaving
        // the complement stale while the header moved. The subtraction cannot: both operands change
        // together, and the reporter prose is untouched.
        const {root, addSpec} = makeSelectionTree(),
              stated          = text => Number(text.match(/while the (\d+) excluded files appear nowhere/)?.[1]),
              before          = populations(root),
              beforeStated    = stated(summary(root));

        // One spec per `RUN_PATHS` entry, derived rather than a literal so the fixture does not have
        // to be hand-updated alongside it. It is a PRECONDITION for the complement arithmetic below,
        // not a guard on `RUN_PATHS` itself: `assertSelectionFloor` owns that, against the real tree,
        // and is what catches an entry added without a spec — this arm's tree is synthetic.
        expect(before.executed, 'the fixture selects every RUN_PATHS spec').toBe(RUN_PATHS.length);
        expect(beforeStated,    'and reports their complement').toBe(before.total - before.executed);

        addSpec('rendering/Outside.spec.mjs');

        const after = populations(root), afterStated = stated(summary(root));

        expect(after.total - before.total,       'the new spec joins the total').toBe(1);
        expect(after.executed,                   'and is NOT selected — it is outside RUN_PATHS').toBe(before.executed);
        expect(afterStated - beforeStated,       'so the published complement must move with it').toBe(1);
        expect(afterStated,                      'and still equal the header\'s complement').toBe(after.total - after.executed);

        fs.rmSync(root, {recursive: true, force: true})
    });

    test('a class beyond the first two is what a named sum drops — discriminating only when one exists', () => {
        // The conditional discriminator. `ignored + gpu` was correct when written and wrong the
        // moment a third class appeared, so the interesting comparison exists only while one does.
        // Asserted conditionally rather than unconditionally: an arm that REQUIRED the two-class sum
        // to be wrong would fail the day someone legitimately empties `EXCLUSIONS`, which is the
        // outcome this repository is working toward.
        const {executed, gpu, ignored, total} = populations(root);

        if (!EXCLUSIONS.length) {
            expect(ignored + gpu, 'with two classes the sum and the complement coincide')
                .toBe(total - executed);
            return
        }

        expect(ignored + gpu, 'a named two-class sum under-reports by the third')
            .toBe(total - executed - EXCLUSIONS.length);
        expect(summary(root), 'and the under-reporting sum must not be what got published')
            .not.toContain(`${ignored + gpu} excluded files`);
    });

    test('every individually excluded file names a cause and an owner', () => {
        // An exclusion without an owner is a quarantine wearing a different word: the spec stops
        // running and nobody is answerable for it. The summary renders these rows verbatim, so an
        // empty owner would print as a blank in the guard.
        for (const entry of EXCLUSIONS) {
            expect(entry.path, 'path').toMatch(/\.spec\.mjs$/);
            expect(entry.owner, `${entry.path} owner`).toBeTruthy();
            expect(entry.reason, `${entry.path} reason`).toBeTruthy();
            expect(['cause', 'observed', 'partial'], `${entry.path} kind`).toContain(entry.kind);
        }
    });
});

test.describe('e2e CI selection — the Brain-gated tier', () => {
    const root = path.resolve(import.meta.dirname, '../../../../..'),
          run  = {shard: '2/6', event: 'push', attempt: '1', engineSha: 'e'.repeat(40), brainSha: 'b'.repeat(40)};

    test('selects exactly the specs the neuralLink fixture gates', () => {
        const paths = brainPaths(root);

        expect(paths).toHaveLength(populations(root).ignored);

        for (const file of paths) {
            expect(fs.readFileSync(path.join(root, file), 'utf8'), file).toMatch(/\bneuralLink\b/)
        }
    });

    test('every declaration names a Brain-gated spec, and every quarantine selects exactly one registered test', () => {
        // The tier asserts its declarations only after checking out a Brain, and never resolves quarantine
        // titles; this arm fails either kind of stale entry in the unit tier every pull request already runs.
        expect(() => assertBrainDeclarations({root})).not.toThrow();
        expect(() => assertQuarantinesResolve({root})).not.toThrow();
    });

    test('a quarantine whose strings are all in the source but which is not a registered path fails', () => {
        // Each title below exists verbatim in the file, so a check of the source text passes all three.
        // Only the path Playwright registers tells them apart: a dropped describe, a new enclosing one.
        // The entry is a literal, so the test outlives an empty quarantine list.
        const entry = {
                  path     : 'test/playwright/e2e/workstation/WorkstationFilmTourNL.spec.mjs',
                  titlePath: ['Workstation — the film tour plays from the toolbar', 'Start film tour runs all scenes; the viewer\'s Continue clicks open every window']
              },
              [, title] = entry.titlePath,
              dropped   = {...entry, titlePath: [title]},
              wrapped   = {...entry, titlePath: ['hosted profile', ...entry.titlePath]};

        expect(() => assertQuarantinesResolve({quarantines: [entry], root}), 'control: the real entry').not.toThrow();
        expect(() => assertQuarantinesResolve({quarantines: [dropped, wrapped], root}))
            .toThrow(new RegExp(`spec\\.mjs › ${title.slice(0, 20)}[\\s\\S]*› hosted profile ›`));
    });

    test('a declaration naming a file that is not Brain-gated fails, and names it', () => {
        const tmp  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-brain-declarations-')),
              file = 'test/playwright/e2e/grid/GatedNL.spec.mjs';

        fs.mkdirSync(path.join(tmp, 'test/playwright/e2e/grid'), {recursive: true});
        fs.writeFileSync(path.join(tmp, file), "test('sorts', async ({neuralLink}) => {})");

        expect(() => assertBrainDeclarations({capabilities: [{paths: [file]}], quarantines: [{path: file}], smoke: [], root: tmp}), 'control')
            .not.toThrow();
        expect(() => assertBrainDeclarations({capabilities: [{paths: ['test/playwright/e2e/grid/Gone.spec.mjs']}], quarantines: [], smoke: [], root: tmp}))
            .toThrow('test/playwright/e2e/grid/Gone.spec.mjs');
        expect(() => assertBrainDeclarations({capabilities: [], quarantines: [{path: 'test/playwright/e2e/grid/Moved.spec.mjs'}], smoke: [], root: tmp}))
            .toThrow('test/playwright/e2e/grid/Moved.spec.mjs');
        expect(() => assertBrainDeclarations({capabilities: [], quarantines: [], smoke: ['test/playwright/e2e/grid/Renamed.spec.mjs'], root: tmp}))
            .toThrow('test/playwright/e2e/grid/Renamed.spec.mjs');

        fs.rmSync(tmp, {recursive: true, force: true})
    });

    test('a smoke file is refused while a capability or a quarantine touches it, and named', () => {
        const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-brain-smoke-')),
              file   = 'test/playwright/e2e/grid/GatedNL.spec.mjs',
              assert = declarations => assertBrainDeclarations({capabilities: [], quarantines: [], smoke: [file], root: tmp, ...declarations});

        fs.mkdirSync(path.join(tmp, 'test/playwright/e2e/grid'), {recursive: true});
        fs.writeFileSync(path.join(tmp, file), "test('sorts', async ({neuralLink}) => {})");

        expect(() => assert({}), 'control').not.toThrow();
        expect(() => assert({quarantines: [{path: file}]})).toThrow(`capability-gated or quarantined:\n- ${file}`);
        expect(() => assert({capabilities: [{paths: [file]}]})).toThrow(`capability-gated or quarantined:\n- ${file}`);

        fs.rmSync(tmp, {recursive: true, force: true})
    });

    test('the smoke tier selects exactly its declared files, and an unknown tier is refused', () => {
        expect(brainSelection({env: {}, root, tier: 'smoke'}).paths.toSorted()).toEqual(BRAIN_SMOKE.toSorted());
        expect(brainSelection({env: {}, root}).paths, 'the default tier is full').toEqual(brainSelection({env: {}, root, tier: 'full'}).paths);
        expect(() => brainSelection({env: {}, root, tier: 'smok'})).toThrow("Unknown Brain-gated tier 'smok'");
    });

    test('the selected tier runs the Brain-gated files of a selection, and nothing else', () => {
        const [gated] = brainSelection({env: {}, root}).paths,
              [other] = enginePaths(root);

        expect(brainSelection({env: {}, root, selected: [gated, other], tier: 'selected'}).paths).toEqual([gated]);
        expect(brainSelection({env: {}, root, tier: 'selected'}).paths, 'an empty selection runs nothing').toEqual([]);
    });

    test('a capability excludes its files only while its variable is unset', () => {
        const unset = brainSelection({env: {}, root}),
              set   = brainSelection({env: Object.fromEntries(BRAIN_CAPABILITIES.map(entry => [entry.requires, 'provisioned'])), root});

        for (const file of BRAIN_CAPABILITIES.flatMap(entry => entry.paths)) {
            expect(unset.paths, `${file} is out while its capability is unset`).not.toContain(file);
        }

        expect(unset.paths).toHaveLength(unset.gated.length - BRAIN_CAPABILITIES.flatMap(entry => entry.paths).length);
        expect(set.paths, 'and the whole tier returns once every capability is provisioned').toEqual(set.gated);
    });

    test('the quarantine list names its files the way Playwright resolves them, relative to the e2e testDir', () => {
        const lines = brainTestList().split('\n').filter(Boolean);

        expect(lines).toHaveLength(BRAIN_QUARANTINES.length);

        for (const line of lines) {
            expect(fs.existsSync(path.join(root, 'test/playwright/e2e', line.split(' › ')[0])), line).toBe(true);
        }
    });

    test('a receipt states the run, both SHAs, the time against the ceiling, the selection and the outcome', () => {
        const report         = {suites: [{file: 'core/A.spec.mjs'}, {file: 'grid/B.spec.mjs'}], stats: {expected: 5, unexpected: 1, flaky: 0, skipped: 2}},
              text           = brainReceipt({report, run, seconds: 312, env: {}, root}),
              {gated, paths} = brainSelection({env: {}, root});

        expect(text).toContain('shard 2/6');
        expect(text).toContain('push, attempt 1');
        expect(text).toContain(run.engineSha);
        expect(text).toContain(run.brainSha);
        expect(text).toContain('5m 12s against the 5m 0s ceiling (**over**)');
        expect(text).toContain(`${paths.length} of the ${gated.length} Brain-gated spec files, with ${BRAIN_QUARANTINES.length} of their tests quarantined`);
        expect(text).toContain('2 files · 5 passed, 1 failed, 0 flaky, 2 skipped');
        expect(text).toContain('- `grid/B.spec.mjs`');
        expect(brainReceipt({report, run, seconds: 300, env: {}, root})).not.toContain('**over**');
    });

    test('a receipt names its tier, and a run that names none is the full tier', () => {
        const receipt = tier => brainReceipt({report: null, run: {...run, tier}, seconds: null, env: {}, root});

        expect(receipt(undefined)).toContain('### Brain-gated e2e · full tier · shard 2/6');
        expect(receipt(undefined)).toContain(`- **Tier:** full — ${BRAIN_TIERS.full}.`);
        expect(receipt('smoke')).toContain('### Brain-gated e2e · smoke tier · shard 2/6');
        expect(receipt('smoke')).toContain(`- **Tier:** smoke — ${BRAIN_TIERS.smoke}.`);
    });

    test('a smoke receipt counts only the smoke files, with no declaration to explain', () => {
        const text    = brainReceipt({report: null, run: {...run, tier: 'smoke'}, seconds: null, env: {}, root}),
              {gated} = brainSelection({env: {}, root});

        expect(text).toContain(`${BRAIN_SMOKE.length} of the ${gated.length} Brain-gated spec files, with 0 of their tests quarantined`);
        expect(text).not.toContain('**Quarantined:**');
        expect(text).not.toContain('**Excluded while');
    });

    test('every full-tier receipt prints each declaration: an unset capability with its exit, a quarantine with its owner', () => {
        const text = brainReceipt({report: null, run, seconds: null, env: {}, root});

        for (const entry of BRAIN_CAPABILITIES) {
            expect(text).toContain(`Excluded while \`${entry.requires}\` is unset`);
            expect(text).toContain(`${entry.exit} (${entry.tracker})`);
        }

        for (const entry of BRAIN_QUARANTINES) {
            expect(text).toContain(`${entry.titlePath.at(-1)} — ${entry.reason}. Accountable: ${entry.accountable}. Exit: ${entry.exit}.`);
        }
    });

    test('a quarantine older than a week is flagged stale on every receipt', () => {
        // Aged against the oldest entry rather than a fixed date, so a later entry cannot move the boundary
        if (!BRAIN_QUARANTINES.length) {
            return
        }

        const oldest  = Math.min(...BRAIN_QUARANTINES.map(entry => Date.parse(entry.since))),
              receipt = days => brainReceipt({report: null, run, seconds: null, env: {}, now: new Date(oldest + days * 86400000), root});

        expect(receipt(QUARANTINE_STALE_DAYS)).not.toContain('(**stale**)');
        expect(receipt(QUARANTINE_STALE_DAYS + 1)).toContain(`${QUARANTINE_STALE_DAYS + 1} days (**stale**)`);
    });

    test('the retry bridge retries through its end date and not a moment after', () => {
        const until = BRAIN_RETRY_BRIDGE.until;

        expect(brainRetries(new Date(`${until}T00:00:00Z`))).toBe(BRAIN_RETRY_BRIDGE.retries);
        expect(brainRetries(new Date(`${until}T23:59:59.999Z`)), 'the last millisecond of its day').toBe(BRAIN_RETRY_BRIDGE.retries);
        expect(brainRetries(new Date(Date.parse(`${until}T23:59:59.999Z`) + 1)), 'the day after').toBe(0);
    });

    test('every receipt names each test that needed the retry, with its first attempt\'s error', () => {
        // Playwright marks a test `flaky` when an attempt failed and a later one passed, and `unexpected`
        // when every attempt failed. Only the first kind needed the retry; the second stays a failure.
        const attempt = (status, message) => ({status, ...message ? {error: {message: `\u001b[31m${message}\u001b[39m\nstack`}} : {}}),
              report  = {
                  stats : {expected: 1, unexpected: 1, flaky: 1, skipped: 0},
                  suites: [{file: 'grid/A.spec.mjs', specs: [], suites: [{title: 'Grid', specs: [
                      {file: 'grid/A.spec.mjs', title: 'heals on retry',  tests: [{status: 'flaky',      results: [attempt('failed', 'Request timed out'), attempt('passed')]}]},
                      {file: 'grid/A.spec.mjs', title: 'red every time',  tests: [{status: 'unexpected', results: [attempt('failed', 'boom'), attempt('failed', 'boom')]}]},
                      {file: 'grid/A.spec.mjs', title: 'green first time', tests: [{status: 'expected',  results: [attempt('passed')]}]}
                  ]}]}]
              },
              text    = brainReceipt({report, run, seconds: 120, retries: 1, env: {}, root});

        expect(flakyTests(report)).toEqual([{error: 'Request timed out', file: 'grid/A.spec.mjs', title: 'Grid › heals on retry'}]);
        expect(text).toContain('**Needed the retry:** `grid/A.spec.mjs` › Grid › heals on retry — first attempt: Request timed out');
        expect(text, 'a test red on every attempt is a failure, not a retry').not.toContain('red every time');
    });

    test('the first attempt\'s error is read from every shape Playwright serializes', () => {
        // A thrown Error carries `message`, anything else thrown only `value`, and the `errors` envelope can
        // carry an error with no `error` field beside it. A blank field must not hide a populated one.
        const flaky  = result => ({status: 'flaky', results: [{status: 'failed', ...result}, {status: 'passed'}]}),
              spec   = (title, result) => ({file: 'grid/A.spec.mjs', title, tests: [flaky(result)]}),
              report = {stats: {expected: 0, unexpected: 0, flaky: 7, skipped: 0}, suites: [{file: 'grid/A.spec.mjs', specs: [
                  spec('an Error',                   {error: {message: 'thrown Error', stack: 'Error: thrown Error\n    at x'}}),
                  spec('a thrown value',             {error: {value: 'a string was thrown'}}),
                  spec('only the envelope',          {errors: [{message: 'from the errors envelope'}]}),
                  spec('an empty message, stack',    {error: {message: '', stack: 'Error\n    at x'}}),
                  spec('an empty message, envelope', {error: {message: ''}, errors: [{message: 'recorded envelope'}]}),
                  spec('a blank first line',         {error: {message: '\u001b[31m\u001b[39m\nafter a blank line'}}),
                  spec('nothing recorded',           {})
              ]}]};

        expect(flakyTests(report).map(test => test.error)).toEqual([
            'thrown Error', 'a string was thrown', 'from the errors envelope', 'Error', 'recorded envelope', 'after a blank line',
            'no error recorded'
        ]);
    });

    test('the receipt reports the retry count the run selected, not one recomputed at its end', () => {
        // A run that starts on the bridge's last day and finishes after midnight still retried
        const after = new Date(Date.parse(`${BRAIN_RETRY_BRIDGE.until}T23:59:59.999Z`) + 1),
              text  = retries => brainReceipt({report: null, run, seconds: null, retries, env: {}, now: after, root});

        expect(text(1)).toContain(`**Retries:** 1 for this run, from the bridge through ${BRAIN_RETRY_BRIDGE.until}`);
        expect(brainRetries(after), 'a run started after the bridge ends selects none').toBe(0);
        expect(text(0)).toContain('**Retries:** none for this run');
        expect(text(null)).toContain('**Retries:** unknown, because the run step recorded none');
    });

    test('a step that never finished and a run without a report say so, rather than reading as zero', () => {
        const text = brainReceipt({report: null, run, seconds: null, env: {}, root});

        expect(text).toContain('none, because the step did not finish');
        expect(text).toContain('**This shard:** unknown, because the run wrote no Playwright report');
    });

    test('the shards split by measured time: every file once, the same split on every shard', () => {
        // By path order and count, two files a shard would run 110 s, 70 s and 30 s
        const durations = {'a.spec.mjs': 60, 'b.spec.mjs': 50, 'c.spec.mjs': 40, 'd.spec.mjs': 30, 'e.spec.mjs': 20, 'f.spec.mjs': 10},
              paths     = Object.keys(durations).toReversed(),
              split     = () => [1, 2, 3].map(index => brainShard({paths, shard: `${index}/3`, durations}));

        expect(split()).toEqual([
            {paths: ['a.spec.mjs', 'f.spec.mjs'], seconds: 70},
            {paths: ['b.spec.mjs', 'e.spec.mjs'], seconds: 70},
            {paths: ['c.spec.mjs', 'd.spec.mjs'], seconds: 70}
        ]);
        expect(split(), 'every shard computes the same split').toEqual(split());
    });

    test('a file the table does not list yet counts as its median, and a shard that is not N/M is refused', () => {
        const durations = {'a.spec.mjs': 10, 'b.spec.mjs': 20, 'c.spec.mjs': 90};

        expect(brainShard({paths: ['new.spec.mjs'], shard: '1/1', durations}).seconds).toBe(20);

        for (const shard of ['0/10', '11/10', '1/0', '3', 'a/b', '']) {
            expect(() => brainShard({paths: [], shard, durations})).toThrow(`Shard '${shard}' is not N/M`);
        }
    });

    test('the tier\'s ten shards run every selected file once, none heavier than another by more than its longest file', () => {
        const {paths} = brainSelection({env: {}, root}),
              shards  = Array.from({length: 10}, (_, i) => brainShard({paths, shard: `${i + 1}/10`})),
              times   = shards.map(shard => shard.seconds),
              longest = Math.max(...paths.map(file => BRAIN_DURATIONS[file] ?? 0));

        expect(shards.flatMap(shard => shard.paths).toSorted()).toEqual(paths.toSorted());
        expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(Math.ceil(longest) + 1);
    });

    test('--brain-paths with SHARD prints that shard\'s files, and the shards together print the selection once', () => {
        const paths = shard => execFileSync(process.execPath, ['buildScripts/util/e2eCiSelection.mjs', '--brain-paths'], {
                  cwd: root, env: {...process.env, SHARD: shard, TIER: 'full'}
              }).toString().split(' ').filter(Boolean),
              all     = paths(''),
              sharded = Array.from({length: 10}, (_, i) => paths(`${i + 1}/10`));

        expect(sharded.every(files => files.length), 'no shard is empty').toBe(true);
        expect(sharded.flat().toSorted()).toEqual(all.toSorted());
    });

    test('a receipt prints the table\'s prediction and each file\'s measured seconds, which rebuild the table', () => {
        const attempt   = duration => ({duration}),
              report    = {stats: {expected: 1, unexpected: 0, flaky: 1, skipped: 0}, suites: [
                  {file: 'grid/A.spec.mjs', specs: [{tests: [{results: [attempt(1250), attempt(1300)]}]}], suites: [{specs: [{tests: [{results: [attempt(500)]}]}]}]},
                  {file: 'core/B.spec.mjs', specs: []}
              ]},
              text      = brainReceipt({report, run, seconds: 120, env: {}, root}),
              predicted = brainShard({paths: brainSelection({env: {}, root}).paths, shard: run.shard}).seconds,
              // GitHub's run log puts the job, the step and a timestamp before every line
              log       = text.split('\n').map(line => `e2e-brain (2/6)\tRun\t2026-10-23T18:43:59.7Z ${line}`).join('\n');

        expect(text).toContain(`- **Predicted:** ${Math.floor(predicted / 60)}m ${predicted % 60}s by the duration table`);
        expect(text, 'every attempt counts, retries and nested describes included').toContain('- `grid/A.spec.mjs` · 3.1 s');
        expect(text).toContain('- `core/B.spec.mjs` · 0 s');
        expect(brainDurations(log)).toEqual({'test/playwright/e2e/core/B.spec.mjs': 0, 'test/playwright/e2e/grid/A.spec.mjs': 3.1});
    });
});

/**
 * A selective run is only as safe as its fallbacks. Each arm below names one change the static map cannot follow and
 * pins that it runs the whole population, beside the leaf changes that may select.
 */
test.describe('e2e CI selection — what a pull request\'s change selects', () => {
    const demo  = 'test/playwright/e2e/demo/Demo.spec.mjs',
          other = 'test/playwright/e2e/demo/Other.spec.mjs',
          bare  = 'test/playwright/e2e/demo/Bare.spec.mjs';

    let root;

    test.beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-e2e-select-'));

        const tree = {
            'buildScripts/tool.mjs'             : '',
            'examples/demo/app.mjs'             : "import './View.mjs';",
            'examples/demo/View.mjs'            : "import '../../src/button/Base.mjs';",
            'examples/demo/resources/data.json' : '{}',
            'examples/other/app.mjs'            : "import '../../src/form/Field.mjs';",
            'src/button/Base.mjs'               : '',
            'src/core/Base.mjs'                 : '',
            'src/data/table.json'               : '{}',
            'src/form/Field.mjs'                : '',
            'src/loader/Lazy.mjs'               : "export default {importPath: './Late.mjs'};",
            'src/unused/Orphan.mjs'             : '',
            'test/playwright/fixtures.mjs'      : '',
            'test/playwright/helpers/unused.mjs': '',
            [bare]                              : '',
            [demo]                              : "import {test} from '../../fixtures.mjs';\nawait page.goto('/examples/demo/index.html');",
            [other]                             : "await page.goto('/examples/other/index.html');"
        };

        for (const [file, text] of Object.entries(tree)) {
            fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), text)
        }

        execFileSync('git', ['init', '-q'], {cwd: root});
        execFileSync('git', ['add', '.'], {cwd: root})
    });

    test.afterAll(() => {
        fs.rmSync(root, {recursive: true, force: true})
    });

    test('a leaf change selects the specs that reach it, the specs the map cannot place, and the smoke files', () => {
        const {full, specs} = selectSpecs({changed: ['src/button/Base.mjs'], root});

        expect(full).toBe(false);
        expect(specs.get(demo)).toBe('reaches src/button/Base.mjs');
        expect(specs.get(bare)).toBe('the map cannot place it');
        expect(specs.has(other)).toBe(false);
        BRAIN_SMOKE.forEach(spec => expect(specs.get(spec), spec).toBe('BRAIN_SMOKE'))
    });

    test('a file an app fetches selects that app\'s specs', () => {
        const {full, specs} = selectSpecs({changed: ['examples/demo/resources/data.json'], root});

        expect(full).toBe(false);
        expect(specs.get(demo)).toBe('its app fetches examples/demo/resources/data.json');
        expect(specs.has(other)).toBe(false)
    });

    test('a module no spec reaches selects none', () => {
        expect(selectSpecs({changed: ['src/unused/Orphan.mjs'], root})).toEqual({full: false, reasons: [], specs: new Map()})
    });

    test('a change the map cannot follow runs the whole population', () => {
        [
            ['src/core/Base.mjs',                  'src/core/Base.mjs: foundation'],
            ['src/loader/Lazy.mjs',                'src/loader/Lazy.mjs: loads modules at runtime'],
            ['src/gone/Deleted.mjs',               'src/gone/Deleted.mjs: not in the tree'],
            ['src/data/table.json',                'src/data/table.json: unmapped'],
            ['buildScripts/tool.mjs',              'buildScripts/tool.mjs: unmapped'],
            ['test/playwright/helpers/unused.mjs', 'test/playwright/helpers/unused.mjs: e2e support no spec imports']
        ].forEach(([file, reason]) => {
            // Beside a leaf file that would select on its own, so the full trigger has to win
            expect(selectSpecs({changed: ['src/button/Base.mjs', file], root}), file).toEqual({full: true, reasons: [reason], specs: new Map()})
        })
    });

    test('a change whose files are all e2e specs runs the whole population; a spec beside other files selects', () => {
        expect(selectSpecs({changed: [demo, other], root}).reasons).toEqual(['every changed file is an e2e spec']);

        const {full, specs} = selectSpecs({changed: [demo, 'src/form/Field.mjs'], root});

        expect(full).toBe(false);
        expect(specs.get(demo)).toBe('changed spec');
        expect(specs.get(other)).toBe('reaches src/form/Field.mjs')
    });
});

/**
 * The selection on this tree: how it splits into the tiers, what the classifier reads, and the historical reds it
 * replays.
 *
 * The replay fixture is the dry run's corpus: every red e2e run among the pull requests merged into `dev` from
 * 2026-10-13 to 2026-11-05, with its failing spec files and the changed files the E2E impact boundary admitted. A map
 * that narrows turns one of its caught or full rows into a miss, and the arm names that run.
 */
test.describe('e2e CI selection — the selection on this tree', () => {
    const root = path.resolve(import.meta.dirname, '../../../../..');

    test('each tier runs its own selected files, on a matrix sized to them', () => {
        const engine  = enginePaths(root),
              [brain] = brainSelection({env: {}, root}).paths,
              all     = tierSelection({specs: new Set([...engine, ...brainPaths(root)]), root});

        expect([all.engine.shards, all.brain.shards], 'a whole tier gets the full matrix').toEqual([FULL_SHARDS.engine, FULL_SHARDS.brain]);
        expect(tierSelection({specs: new Set([engine[0], brain]), root})).toEqual({brain: {paths: [brain], shards: 1}, engine: {paths: [engine[0]], shards: 1}});
        expect(tierSelection({specs: new Set(), root})).toEqual({brain: {paths: [], shards: 0}, engine: {paths: [], shards: 0}});
        // Never more shards than files, even when nothing is measured
        expect(tierSelection({specs: new Set([brain]), root, durations: {}}).brain.shards).toBe(1)
    });

    test('the classifier reads a full selection as its reasons, and a selected one as each tier\'s files and matrix', () => {
        const full     = selectionOutput({changed: ['src/core/Base.mjs'], root}),
              selected = selectionOutput({changed: ['src/calendar/view/month/Component.mjs'], root}),
              read     = key => new RegExp(`^${key}=(.*)$`, 'm').exec(selected)?.[1];

        expect(full).toMatch(/^e2e_selection=full\ne2e_selection_report<<NEO_E2E_SELECTION\n[\s\S]*src\/core\/Base\.mjs: foundation\nNEO_E2E_SELECTION\n$/);

        expect([read('e2e_selection'), read('run_e2e'), read('e2e_brain_tier')]).toEqual(['selected', 'true', 'selected']);

        for (const tier of ['engine', 'brain']) {
            const [shards] = JSON.parse(read(`e2e_${tier}_shards`));

            expect(JSON.parse(read(`e2e_${tier}_matrix`)), tier).toEqual(Array.from({length: shards}, (_, index) => index + 1));
            expect(read(`e2e_${tier}_paths`).split(' ').length, tier).toBeGreaterThanOrEqual(shards)
        }
    });

    test('a change that reaches no spec rules both tiers out, and says why', () => {
        const map     = specReach({root}),
              reached = new Set([...map.specs.values()].flatMap(({reach}) => [...reach])),
              orphan  = [...map.tracked].find(file => /^src\/.+\.mjs$/.test(file) && !reached.has(file) &&
                  !FOUNDATION.some(rule => rule.test(file)) && !RUNTIME_LOADING.test(fs.readFileSync(path.join(root, file), 'utf8'))),
              output  = selectionOutput({changed: [orphan], root});

        expect(orphan, 'control: this tree holds a module no spec reaches').toBeTruthy();
        expect(output).toMatch(/^run_e2e=false$/m);
        expect(output).toMatch(/^e2e_brain_tier=none$/m);
        expect(output).toMatch(/^skip_reason=no spec in this tier can reach the change/m)
    });

    test('each workflow\'s full matrix is FULL_SHARDS', () => {
        const fallback = (file, tier) => [`e2e_${tier}_matrix`, `e2e_${tier}_shards`].map(key =>
                  JSON.parse(new RegExp(`${key} \\|\\| '([^']+)'`).exec(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))[1])),
              matrix   = shards => [Array.from({length: shards}, (_, index) => index + 1), [shards]];

        expect(fallback('test-e2e.yml', 'engine')).toEqual(matrix(FULL_SHARDS.engine));
        expect(fallback('test-e2e-brain.yml', 'brain')).toEqual(matrix(FULL_SHARDS.brain))
    });

    test('every historical red runs in full, runs its failing spec, or is a recorded miss', () => {
        const rows   = JSON.parse(fs.readFileSync(path.join(root, 'test/playwright/unit/buildScripts/fixtures/e2eSelectionReplay.json'), 'utf8')),
              map    = specReach({root}),
              // The misses the dry run's receipt records. The change reaches runtime code, but not the failing spec.
              misses = {
                  39582656813: 'DockTabOverflowNL, no cause on record; the change is portal data',
                  40202145032: 'HeaderMenuInteractionNL, no cause on record; the change is the calendar week view',
                  41666963270: 'IssuesShowcase, a read that raced the lazily loaded menu triggers; the change is Carousel',
                  42042806935: 'DockCrossWindowWitnessNL, a chronic flaker; the change is src/functional',
                  42058376779: 'DockCrossWindowWitnessNL, a chronic flaker; the change is src/functional'
              },
              // A row the boundary left out could not run any spec, and a spec renamed since cannot be asked for
              replayed = rows.filter(row => row.admitted.length && row.failing.every(spec => map.specs.has(spec))),
              skipped  = replayed.filter(row => {
                  const {full, specs} = selectSpecs({changed: row.admitted, map, root});

                  return !full && !row.failing.every(spec => specs.has(spec))
              });

        expect(replayed.length, 'control: most rows still replay').toBeGreaterThan(rows.length / 2);
        expect(skipped.map(row => row.run).filter(run => !misses[run]), 'reds the selection now skips').toEqual([])
    });
});
