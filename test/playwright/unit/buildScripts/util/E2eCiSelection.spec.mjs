import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    ADAPTER_ELIGIBLE_SPECS,
    selectExternalBrainSpecs
} from '../../../externalBrainSelection.mjs';
import {
    assertSelectionFloor,
    balancedShard,
    ENGINE_DURATIONS,
    engineDurations,
    enginePaths,
    engineSelection,
    EXCLUSIONS,
    FULL_SHARDS,
    populations,
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

/**
 * The specs that need a Brain run only locally: no CI job provisions one. What CI must still guarantee is
 * the engine tier's side of that line, so the adapter-eligible specs this file once checked against the Brain tier
 * are now checked against the engine tier that runs them.
 */
test.describe('e2e CI selection — the engine tier and the local-only specs', () => {
    const root = path.resolve(import.meta.dirname, '../../../../..');

    test('the engine tier runs what it declares, every adapter-eligible spec included', () => {
        const engine = enginePaths(root);

        expect(assertSelectionFloor(root)).toBe(populations(root).executed);
        expect(selectExternalBrainSpecs(path.join(root, 'test/playwright/e2e')).ignore, 'the local-only class')
            .toHaveLength(populations(root).ignored);

        for (const rel of ADAPTER_ELIGIBLE_SPECS) {
            expect(engine, `${rel} runs off-socket in the engine tier`).toContain(`test/playwright/e2e/${rel}`);
            expect(
                RUN_PATHS.some(runPath => `test/playwright/e2e/${rel}` === runPath || `test/playwright/e2e/${rel}`.startsWith(`${runPath}/`)),
                `${rel} is covered by RUN_PATHS`
            ).toBe(true)
        }
    });

    test('the shards split by measured time: every file once, the same split on every shard', () => {
        // By path order and count, two files a shard would run 110 s, 70 s and 30 s
        const durations = {'a.spec.mjs': 60, 'b.spec.mjs': 50, 'c.spec.mjs': 40, 'd.spec.mjs': 30, 'e.spec.mjs': 20, 'f.spec.mjs': 10},
              paths     = Object.keys(durations).toReversed(),
              split     = () => [1, 2, 3].map(index => balancedShard({paths, shard: `${index}/3`, durations}));

        expect(split()).toEqual([
            {paths: ['a.spec.mjs', 'f.spec.mjs'], seconds: 70},
            {paths: ['b.spec.mjs', 'e.spec.mjs'], seconds: 70},
            {paths: ['c.spec.mjs', 'd.spec.mjs'], seconds: 70}
        ]);
        expect(split(), 'every shard computes the same split').toEqual(split());
    });

    test('a file the table does not list yet counts as its median, and a shard that is not N/M is refused', () => {
        const durations = {'a.spec.mjs': 10, 'b.spec.mjs': 20, 'c.spec.mjs': 90};

        expect(balancedShard({paths: ['new.spec.mjs'], shard: '1/1', durations}).seconds).toBe(20);

        for (const shard of ['0/10', '11/10', '1/0', '3', 'a/b', '']) {
            expect(() => balancedShard({paths: [], shard, durations})).toThrow(`Shard '${shard}' is not N/M`);
        }
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
            'buildScripts/tool.mjs'              : '',
            'examples/demo/app.mjs'              : "import './View.mjs';",
            'examples/demo/View.mjs'             : "import '../../src/button/Base.mjs';\nconst load = name => import(`../../src/plugin/${name}.mjs`);",
            'examples/demo/resources/data.json'  : '{}',
            'examples/lonely/app.mjs'            : '',
            'examples/lonely/resources/data.json': '{}',
            'examples/other/app.mjs'             : "import '../../src/form/Field.mjs';",
            'src/button/Base.mjs'                : '',
            'src/core/Base.mjs'                  : '',
            'src/data/table.json'                : '{}',
            'src/form/Field.mjs'                 : '',
            'src/loader/Lazy.mjs'                : "export default {importPath: './Late.mjs'};",
            'src/plugin/Computed.mjs'            : '',
            'src/unused/Orphan.mjs'              : '',
            'test/playwright/fixtures.mjs'       : '',
            'test/playwright/helpers/unused.mjs' : '',
            [bare]                               : '',
            [demo]                               : "import {test} from '../../fixtures.mjs';\nawait page.goto('/examples/demo/index.html');",
            [other]                              : "await page.goto('/examples/other/index.html');"
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

    test('a leaf change selects the specs that reach it and the specs the map cannot place', () => {
        const {full, specs} = selectSpecs({changed: ['src/button/Base.mjs'], root});

        expect(full).toBe(false);
        expect(specs.get(demo)).toBe('reaches src/button/Base.mjs');
        expect(specs.get(bare)).toBe('the map cannot place it');
        expect(specs.has(other)).toBe(false);
        expect(specs.size, 'nothing else rides along').toBe(2)
    });

    test('a file an app fetches selects that app\'s specs', () => {
        const {full, specs} = selectSpecs({changed: ['examples/demo/resources/data.json'], root});

        expect(full).toBe(false);
        expect(specs.get(demo)).toBe('its app fetches examples/demo/resources/data.json');
        expect(specs.has(other)).toBe(false)
    });

    test('a module no static edge names runs the whole population, even one only a computed import loads', () => {
        // `examples/demo/View.mjs` loads `src/plugin/${name}.mjs`, so the map has no edge to the module it loads
        expect(selectSpecs({changed: ['src/plugin/Computed.mjs'], root}))
            .toEqual({full: true, reasons: ['src/plugin/Computed.mjs: no static edge names it'], specs: new Map()});
        expect(selectSpecs({changed: ['src/unused/Orphan.mjs'], root}).reasons).toEqual(['src/unused/Orphan.mjs: no static edge names it'])
    });

    test('a selection no placed spec reaches still runs the specs the map cannot place', () => {
        // An app no spec navigates fetches the file, so no placed spec reaches it
        const {full, specs} = selectSpecs({changed: ['examples/lonely/resources/data.json'], root});

        expect(full).toBe(false);
        expect(specs.get(bare)).toBe('the map cannot place it');
        expect(specs.has(demo) || specs.has(other)).toBe(false)
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

    test('the engine tier runs its selected files on a matrix sized to them, and a local-only spec in no job', () => {
        const engine    = enginePaths(root),
              e2e       = path.join(root, 'test/playwright/e2e'),
              {ignore}  = selectExternalBrainSpecs(e2e),
              localOnly = fs.readdirSync(e2e, {recursive: true}).map(file => path.join('test/playwright/e2e', file))
                  .find(file => file.endsWith('.spec.mjs') && ignore.some(pattern => pattern.test(path.join(root, file))));

        expect(localOnly, 'control: the tree holds a local-only spec').toBeTruthy();
        expect(tierSelection({specs: new Set(engine), root}).engine.shards, 'the whole tier gets the full matrix').toBe(FULL_SHARDS.engine);
        expect(tierSelection({specs: new Set([engine[0], localOnly]), root})).toEqual({engine: {paths: [engine[0]], shards: 1}});
        expect(tierSelection({specs: new Set(), root})).toEqual({engine: {paths: [], shards: 0}});
        // Never more shards than files, even when nothing is measured
        expect(tierSelection({specs: new Set([engine[0]]), root, durations: {engine: {}}}).engine.shards).toBe(1)
    });

    test('an engine selection is sized by its measured seconds, so heavy files get more shards than their count', () => {
        const engine    = enginePaths(root),
              heavy     = engine.slice(0, 10),
              // Ten files carry ten times the rest of the tier: by file count they would share one shard
              durations = {engine: Object.fromEntries(engine.map(file => [file, heavy.includes(file) ? 100 : 1]))};

        expect(Math.ceil(FULL_SHARDS.engine * heavy.length / engine.length), 'control: the file count gives one shard').toBe(1);
        expect(tierSelection({specs: new Set(heavy), root, durations}).engine.shards).toBe(FULL_SHARDS.engine)
    });

    test('the engine tier\'s shards run every file once, none heavier than another by more than its longest file', () => {
        const paths   = engineSelection({named: RUN_PATHS, root}),
              shards  = Array.from({length: FULL_SHARDS.engine}, (_, i) => balancedShard({paths, shard: `${i + 1}/${FULL_SHARDS.engine}`, durations: ENGINE_DURATIONS})),
              times   = shards.map(shard => shard.seconds),
              longest = Math.max(...paths.map(file => ENGINE_DURATIONS[file] ?? 0));

        expect(paths, 'RUN_PATHS expands to the tier\'s files').toEqual(enginePaths(root));
        expect(shards.flatMap(shard => shard.paths).toSorted()).toEqual(paths);
        expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(Math.ceil(longest) + 1)
    });

    test('--engine-paths with SHARD prints that shard\'s files of TIER_PATHS, and the shards print them once', () => {
        const paths    = (named, shard) => execFileSync(process.execPath, ['buildScripts/util/e2eCiSelection.mjs', '--engine-paths'], {
                  cwd: root, env: {...process.env, SHARD: shard, TIER_PATHS: named.join(' ')}
              }).toString().split(' ').filter(Boolean),
              selected = enginePaths(root).filter(file => file.includes('/grid/')),
              sharded  = Array.from({length: 3}, (_, i) => paths(selected, `${i + 1}/3`));

        expect(paths(RUN_PATHS, ''), 'directories expand to the tier\'s files').toEqual(enginePaths(root));
        expect(sharded.every(files => files.length), 'no shard is empty').toBe(true);
        expect(sharded.flat().toSorted()).toEqual(selected)
    });

    test('an engine log rebuilds the table: each test costs the time since its job\'s previous test ended', () => {
        const at  = (job, time, text) => `e2e-engine (${job})\tRun e2e (engine tier)\t2026-11-07T01:${time}Z ${text}`,
              ok  = (n, file, duration) => `  ✓  ${n} [chromium] › test/playwright/e2e/${file}:12:5 › a title › with (parens) (${duration})`,
              log = [
                  at('1/2', '13:17.0000000', 'Running 3 tests using 1 worker, shard 1 of 2'),
                  // 3 ms of test, 15 s since the run started: the file's hooks and fixtures ran first
                  at('1/2', '13:32.0000000', ok(1, 'core/Boot.spec.mjs', '3ms')),
                  at('2/2', '13:20.0000000', 'Running 1 test using 1 worker, shard 2 of 2'),
                  at('1/2', '13:34.5000000', ok(2, 'core/Boot.spec.mjs', '1.2s')),
                  at('2/2', '15:20.0000000', ok(1, 'grid/Heavy.spec.mjs', '1.9m')),
                  at('1/2', '13:35.0000000', '  -  3 [chromium] › test/playwright/e2e/grid/Skipped.spec.mjs:3:5 › skipped')
              ].join('\n');

        expect(engineDurations(log)).toEqual({'test/playwright/e2e/core/Boot.spec.mjs': 17.5, 'test/playwright/e2e/grid/Heavy.spec.mjs': 120});
        // A log without timestamps, such as a local run's, falls back to the printed durations
        expect(engineDurations([ok(1, 'core/Boot.spec.mjs', '3ms'), ok(2, 'core/Boot.spec.mjs', '1.2s'), ok(3, 'grid/Heavy.spec.mjs', '1.9m')].join('\n')))
            .toEqual({'test/playwright/e2e/core/Boot.spec.mjs': 1.2, 'test/playwright/e2e/grid/Heavy.spec.mjs': 114})
    });

    test('the classifier reads a full selection as its reasons, and a selected one as the engine tier\'s files and matrix', () => {
        const full     = selectionOutput({changed: ['src/core/Base.mjs'], root}),
              selected = selectionOutput({changed: ['src/calendar/view/month/Component.mjs'], root}),
              read     = key => new RegExp(`^${key}=(.*)$`, 'm').exec(selected)?.[1],
              [shards] = JSON.parse(read('e2e_engine_shards'));

        expect(full).toMatch(/^e2e_selection=full\ne2e_selection_report<<NEO_E2E_SELECTION\n[\s\S]*src\/core\/Base\.mjs: foundation\nNEO_E2E_SELECTION\n$/);

        expect([read('e2e_selection'), read('run_e2e')]).toEqual(['selected', 'true']);
        expect(JSON.parse(read('e2e_engine_matrix'))).toEqual(Array.from({length: shards}, (_, index) => index + 1));
        expect(read('e2e_engine_paths').split(' ').length).toBeGreaterThanOrEqual(shards);
        expect(selected, 'no output names a Brain tier').not.toMatch(/^e2e_brain_/m)
    });

    test('on this tree, a module no static edge names runs every spec', () => {
        const map     = specReach({root}),
              reached = new Set([...map.specs.values()].flatMap(({reach}) => [...reach])),
              orphan  = [...map.tracked].find(file => /^src\/.+\.mjs$/.test(file) && !reached.has(file) &&
                  !FOUNDATION.some(rule => rule.test(file)) && !RUNTIME_LOADING.test(fs.readFileSync(path.join(root, file), 'utf8'))),
              output  = selectionOutput({changed: [orphan], root});

        expect(orphan, 'control: this tree holds a module no static edge names').toBeTruthy();
        expect(output).toMatch(/^e2e_selection=full$/m);
        expect(output).toContain(`- ${orphan}: no static edge names it`);
        expect(output).not.toMatch(/^run_e2e=/m)
    });

    test('the engine workflow\'s full matrix is FULL_SHARDS', () => {
        const fallback = (file, tier) => [`e2e_${tier}_matrix`, `e2e_${tier}_shards`].map(key =>
                  JSON.parse(new RegExp(`${key} \\|\\| '([^']+)'`).exec(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))[1])),
              matrix   = shards => [Array.from({length: shards}, (_, index) => index + 1), [shards]];

        expect(fallback('test-e2e.yml', 'engine')).toEqual(matrix(FULL_SHARDS.engine))
    });

    test('the engine run step takes its shard\'s files from --engine-paths, never Playwright\'s count split', () => {
        const workflow = fs.readFileSync(path.join(root, '.github/workflows/test-e2e.yml'), 'utf8');

        expect(workflow).toContain('paths=$(node buildScripts/util/e2eCiSelection.mjs --engine-paths)');
        expect(workflow).not.toMatch(/--shard[= ]/)
    });

    test('every historical red in an engine-tier spec runs in full, runs its failing spec, or is a recorded miss', () => {
        const rows   = JSON.parse(fs.readFileSync(path.join(root, 'test/playwright/unit/buildScripts/fixtures/e2eSelectionReplay.json'), 'utf8')),
              map    = specReach({root}),
              engine = new Set(enginePaths(root)),
              // The misses the dry run's receipt records. The change reaches runtime code, but not the failing spec.
              misses = {
                  39582656813: 'DockTabOverflowNL, no cause on record; the change is portal data',
                  40202145032: 'HeaderMenuInteractionNL, no cause on record; the change is the calendar week view',
                  41666963270: 'IssuesShowcase, a read that raced the lazily loaded menu triggers; the change is Carousel',
                  // The map places this engine-tier spec, and its reach has no src/functional module
                  42042806935: 'DockCrossWindowWitnessNL, a harness red (target worker cw-win-a missing); the change is useMemo',
                  42058376779: 'DockCrossWindowWitnessNL, the same harness red on a rerun of that change'
              },
              // A red in a spec no CI job runs any more (a local-only one) is out of reach by decision. So is a
              // row the boundary left out, which could not run any spec, and a spec renamed since, which cannot be asked for
              replayed = rows.map(row => ({...row, failing: row.failing.filter(spec => engine.has(spec))}))
                  .filter(row => row.admitted.length && row.failing.length && row.failing.every(spec => map.specs.has(spec))),
              skipped  = replayed.filter(row => {
                  const {full, specs} = selectSpecs({changed: row.admitted, map, root});

                  return !full && !row.failing.every(spec => specs.has(spec))
              });

        expect(replayed.length, 'control: most rows still replay').toBeGreaterThan(rows.length / 2);
        expect(skipped.map(row => row.run).filter(run => !misses[run]), 'reds the selection now skips').toEqual([])
    });
});
