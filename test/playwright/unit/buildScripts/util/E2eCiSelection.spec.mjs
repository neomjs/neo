import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    assertBrainDeclarations,
    assertQuarantinesResolve,
    BRAIN_CAPABILITIES,
    BRAIN_QUARANTINES,
    BRAIN_RETRY_BRIDGE,
    BRAIN_SMOKE,
    BRAIN_TIERS,
    brainPaths,
    brainReceipt,
    brainRetries,
    brainSelection,
    brainTestList,
    EXCLUSIONS,
    flakyTests,
    populations,
    QUARANTINE_STALE_DAYS,
    RUN_PATHS,
    summary
} from '../../../../../buildScripts/util/e2eCiSelection.mjs';

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
        const [entry]   = BRAIN_QUARANTINES,
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
});
