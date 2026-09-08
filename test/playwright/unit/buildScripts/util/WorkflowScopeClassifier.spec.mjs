import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

/**
 * The scope classifier decides whether this repository's test suites run at all.
 *
 * `.github/workflows/classify-test-scope.yml` holds one inline `actions/github-script` step whose
 * outputs gate every expensive job downstream. `neomjs/neo` CI is three projects — `unit`,
 * `components` and the separately-piped `e2e` engine tier — so a classifier that answers `false`
 * too eagerly does not turn anything red. It produces a green run with nothing behind it — a
 * coverage loss indistinguishable from success, which is the one class of regression a test suite
 * cannot report about itself.
 *
 * **One classifier, two callers.** It lived inline in `test.yml`, which is why the e2e tier once
 * ran on every pull request and push: a workflow cannot read another workflow's job outputs, so
 * the separately-piped tier had no gate available to it. It is a reusable workflow now, called by
 * `test.yml` and `test-e2e.yml` alike, so the arms below assert one predicate rather than two
 * copies that could disagree.
 *
 * **Why the subject is reached through YAML rather than imported.** The classifier is not a module.
 * It is a string inside a workflow file, evaluated by `actions/github-script` with `github`,
 * `context` and `core` in scope. The only honest way to test it is to read that exact string from
 * the committed workflow and evaluate it against mocks with those three names — which is what
 * {@link executeScript} does. Re-typing the logic here would test a copy, and a copy cannot drift
 * with its original.
 *
 * ---
 *
 * **Restored from `c623b2f63c^`, and NOT verbatim — the drift is named rather than trimmed.**
 *
 * This file was deleted by `c623b2f63c` at
 * `test/playwright/unit/ai/buildScripts/util/WorkflowScopeClassifier.spec.mjs`, as one of 804 unit
 * specs swept on the `ai/` path prefix. Its subject stayed. It is restored here, beside the
 * surviving sibling tree, because the `ai/` prefix is exactly what marked it as extracted substrate
 * and would re-arm the same deletion at the next boundary change.
 *
 * Seven of the nine deleted arms asserted `run_integration` and `run_parity`. **Those outputs no
 * longer exist**: the classifier declares `run_unit`, `run_components`, `run_e2e` and
 * `skip_reason`, because the integration and parity suites left with the extraction. That is a legitimate topology change
 * in the subject, not a defect in it, so those keys are dropped rather than repaired — and said out
 * loud here, since a restored spec that quietly sheds assertions is indistinguishable from one
 * trimmed to make the suite green.
 *
 * Four arms are NEW, covering the half of the classifier the deleted spec never asserted: the
 * stale-head guard, and the `run_unit` docs/content classification. Both are load-bearing and both
 * were uncovered — `requiresUnitForContent` exists precisely so the corpus gate is not skipped on
 * the PRs it exists to catch, and nothing tested that it fires.
 */

const __dirname     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot      = path.resolve(__dirname, '../../../../..'),
      workflowsDir  = path.join(repoRoot, '.github/workflows'),
      AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

/**
 * The reusable workflow that owns the predicate. Named once so an arm asserting the classifier's
 * SHAPE and an arm executing its SCRIPT cannot end up reading two different files.
 * @type {String}
 */
const CLASSIFIER = 'classify-test-scope.yml';

/**
 * @summary The committed classifier source, read from the workflow on every call.
 *
 * Deliberately re-read rather than cached at module scope: the assertion is about what
 * `classify-test-scope.yml` contains right now, and a cached string would keep passing against a
 * workflow the repository no longer has.
 * @returns {String} The inline script body of the `scope` step.
 */
const scopeScript = () =>
    readWorkflow(CLASSIFIER).jobs.classify.steps.find(step => step.id === 'scope').with.script;

/**
 * @summary A mocked `actions/github-script` environment for one classifier run.
 *
 * Serves `package.json` content at the base and head refs through `repos.getContent`, keyed by
 * REPOSITORY as well as ref — because a fork PR's head SHA exists only in the fork, and a base-repo
 * fetch of it genuinely throws. A mock that ignored the owner would let a fork-blind classifier pass.
 *
 * @param {Object}  [config={}]
 * @param {String[]}[config.files] Changed paths the PR reports.
 * @param {Object}  [config.basePkg] `package.json` content at the base ref.
 * @param {Object}  [config.headPkg] `package.json` content at the head ref.
 * @param {String}  [config.headPkgRaw] Raw head content, to serve unparseable bytes.
 * @param {String}  [config.baseSha] Base ref; an all-zero value is git's "no such ref".
 * @param {String}  [config.getContentError] When set, every content read throws this message.
 * @param {String}  [config.forkOwner] When set, the PR head is a fork owned by this login.
 * @param {Boolean} [config.forkUnreadable] Deleted or private fork — even its own coordinates refuse.
 * @param {String}  [config.liveHead] The head SHA `pulls.get` reports, to drive the stale-head guard.
 * @returns {Object} `{calls, context, core, github, info, outputs}`
 */
const createRuntime = ({
    files           = ['package.json'],
    basePkg         = {dependencies: {leftpad: '1.0.0'}, scripts: {'build:all': 'a'}},
    headPkg         = {dependencies: {leftpad: '1.0.0'}, scripts: {'build:all': 'a', 'ai:new-script': 'b'}},
    headPkgRaw      = null,
    baseSha         = 'base-sha',
    getContentError = null,
    forkOwner       = null,
    forkUnreadable  = false,
    liveHead        = 'head-sha',
    eventName       = 'pull_request'
} = {}) => {
    const outputs = new Map(),
          info    = [],
          notices = [],
          calls   = {getContent: 0, listFiles: 0, pullsGet: 0, contentCalls: []},
          core    = {
              info     : value => info.push(value),
              notice   : value => notices.push(value),
              setOutput: (name, value) => outputs.set(name, value),
              summary  : {
                  addHeading() { return this; },
                  addRaw()     { return this; },
                  async write() {}
              }
          },
          github  = {
              paginate: async() => {
                  calls.listFiles++;
                  return files.map(filename => ({ filename }));
              },
              rest: {
                  pulls: {
                      get: async() => {
                          calls.pullsGet++;
                          return { data: { head: { sha: liveHead } } };
                      }
                  },
                  repos: {
                      getContent: async({ owner, repo, ref }) => {
                          calls.getContent++;
                          calls.contentCalls.push(`${owner}/${repo}@${ref}`);
                          if (getContentError) throw new Error(getContentError);
                          if (ref === baseSha) {
                              const raw = JSON.stringify(basePkg);
                              return { data: { content: Buffer.from(raw).toString('base64') } };
                          }
                          // A fork head SHA is absent from the base repo; a deleted or private
                          // fork refuses the read even at its own coordinates.
                          if (forkOwner && owner !== forkOwner) throw new Error(`Not Found: ${ref}`);
                          if (forkUnreadable) throw new Error(`Not Found: ${owner}/${repo}`);
                          const raw = headPkgRaw ?? JSON.stringify(headPkg);
                          return { data: { content: Buffer.from(raw).toString('base64') } };
                      }
                  }
              }
          },
          context = {
              eventName,
              payload  : {
                  pull_request: {
                      base: { sha: baseSha },
                      head: forkOwner
                          ? { sha: 'head-sha', repo: { fork: true, name: 'neo', owner: { login: forkOwner } } }
                          : { sha: 'head-sha' },
                      number: 16248
                  }
              },
              repo: { owner: 'neomjs', repo: 'neo' }
          };

    return { calls, context, core, github, info, notices, outputs };
};

const executeScript = async(script, runtime) => {
    await new AsyncFunction('github', 'context', 'core', script)(
        runtime.github,
        runtime.context,
        runtime.core
    );
};

const outputsOf = runtime => Object.fromEntries(runtime.outputs);

test.describe('Tests scope classifier — the outputs the changes job actually declares', () => {

    test('the job declares exactly the suites this repository runs', () => {
        // Pins the contract this whole file is written against. `neomjs/neo` CI is `unit` +
        // `components` + the `e2e` engine tier; the integration and parity outputs the pre-split
        // spec asserted are gone. If a suite is ever added back, this arm reds FIRST and points at
        // the missing coverage, rather than the arms below silently classifying for a surface
        // nobody asserted.
        const outputs = readWorkflow(CLASSIFIER).jobs.classify.outputs;

        expect(Object.keys(outputs).sort()).toEqual(['run_components', 'run_e2e', 'run_unit', 'skip_reason']);
    });

    test('every job output is re-declared to callers', () => {
        // The failure mode the extraction introduced, and the reason it gets its own arm: a
        // reusable workflow's job outputs are INTERNAL. A caller reads `needs.<job>.outputs.x`
        // only if `on.workflow_call.outputs` re-declares it, and an undeclared one resolves to
        // the empty string rather than erroring. `run_e2e` missing here would gate the e2e tier
        // on `'' == 'true'` — permanently false, permanently green, permanently running nothing.
        const workflow = readWorkflow(CLASSIFIER);

        expect(Object.keys(workflow.on.workflow_call.outputs).sort())
            .toEqual(Object.keys(workflow.jobs.classify.outputs).sort());
    });

    test('both test workflows gate on this classifier rather than their own copy', () => {
        // A second copy of the predicate is the outcome this extraction exists to prevent, and it
        // would be invisible to every other arm in this file: they all read ONE workflow, so a
        // caller that reverted to an inline classifier — or dropped the gate entirely, which is
        // the state the e2e tier was in before it consumed this one — would keep them green.
        for (const [name, job] of [['test.yml', 'changes'], ['test-e2e.yml', 'changes']]) {
            expect(readWorkflow(name).jobs[job].uses, name).toBe(`./.github/workflows/${CLASSIFIER}`);
        }
    });

    test('a custom-selection probe does not claim the tier\'s coverage, and the gate still does', () => {
        // `e2eCiSelection --summary` prints "selected 14 of 105" — true of the TIER, false of a run
        // that executed one named spec. Emitted beside a probe it would manufacture a
        // coverage-that-was-not-run claim inside the honesty guard itself, which is the one place
        // it would be believed. Discriminating on purpose: the gate must still emit it, so a
        // condition that silenced the summary everywhere would pass a one-sided assertion.
        const steps    = readWorkflow('test-e2e.yml').jobs['e2e-engine'].steps,
              coverage = steps.find(step => step.name === 'Report tier coverage'),
              probe    = steps.find(step => step.name === 'Report probe rate');

        expect(coverage, 'the tier coverage step must exist to be conditioned').toBeTruthy();
        expect(probe,    'and the probe reports its own population').toBeTruthy();

        // Suppressed only when a dispatch named its own specs — never for `pull_request` / `push`.
        expect(coverage.if).toContain("github.event_name != 'workflow_dispatch' || inputs.specs == ''");
        expect(probe.if).toContain("github.event_name == 'workflow_dispatch'");
    });

    test('a dispatch is not silently capped by the job bound', () => {
        // A job `timeout-minutes` CAPS a step's: the dispatch test step asks for 30, and under the
        // gate's 12-minute job it would have received 12 — a probe killed by a limit nothing in the
        // log names, reporting a rate that is an artifact of the bound. The job allowance must
        // exceed the step's, and the gate's own numbers must be untouched.
        const job  = readWorkflow('test-e2e.yml').jobs['e2e-engine'],
              step = job.steps.find(s => s.name === 'Run e2e (engine tier)');

        const nums = String(job['timeout-minutes']).match(/\d+/g).map(Number),
              sNum = String(step['timeout-minutes']).match(/\d+/g).map(Number);

        expect(Math.max(...nums), 'the dispatch job allowance').toBeGreaterThan(Math.max(...sNum));
        expect(Math.min(...nums), 'the gate job bound is unchanged').toBe(12);
        expect(Math.min(...sNum), 'the gate test-step ceiling is unchanged').toBe(5);
    });

    test('the e2e job consumes BOTH gates on every step that costs anything', () => {
        // `test.yml` resolves its flag once into `matrix.run`; the single-job e2e pipeline has no
        // matrix to hang it on, so each step carries the conditions itself. An ungated provisioning
        // step would spend the runner these gates exist to stop spending — and would do it quietly,
        // since the job still reports green.
        //
        // Two conditions, not one, and the second is the rerun boundary: the classifier is a
        // PREREQUISITE, and re-running a failed job replays a successful prerequisite's output
        // rather than recomputing it. Without a job-local head check, a rerun can certify a tree
        // the PR has already moved past.
        const steps = readWorkflow('test-e2e.yml').jobs['e2e-engine'].steps,
              // The head probe computes the answer, so it cannot depend on it; the skip step is
              // gated on the inverse and reports the reason. Every OTHER step spends the runner.
              exempt   = ['Verify current pull-request head', 'Skip e2e (engine tier)'],
              expensive = steps.filter(step => !exempt.includes(step.name)),
              ungated  = expensive.filter(step => {
                  const condition = String(step.if || '');

                  return !condition.includes('run_e2e') || !condition.includes('steps.head.outputs.current');
              });

        expect(ungated.map(step => step.name)).toEqual([]);

        // The filters above pass vacuously on an empty job, and `exempt` names steps by string:
        // a rename would silently exempt nothing and shrink `expensive` to zero.
        expect(expensive.length).toBeGreaterThan(10);
        expect(steps.map(step => step.name)).toEqual(expect.arrayContaining(exempt));
    });

});

test.describe('Tests scope classifier — stale-head guard', () => {

    test('a superseded workflow attempt skips both suites and never lists files', async () => {
        // A rerun of an attempt whose PR has since moved would classify against a diff that is no
        // longer the head's. The guard must short-circuit BEFORE the listFiles call, or the
        // classification is both wrong and paid for.
        const runtime = createRuntime({ liveHead: 'moved-on-sha' });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.listFiles).toBe(0);
        expect(runtime.calls.getContent).toBe(0);
        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'false',
            run_e2e       : 'false',
            run_unit      : 'false'
        });
        expect(outputsOf(runtime).skip_reason).toContain('stale workflow head');
        expect(runtime.notices.join(' ')).toContain('Skipping expensive test suites');
    });

    test('the live head proceeds to classification', async () => {
        const runtime = createRuntime({ files: ['src/Neo.mjs'] });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.pullsGet).toBe(1);
        expect(runtime.calls.listFiles).toBe(1);
        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true', run_e2e: 'true', run_unit: 'true' });
    });

});

test.describe('Tests scope classifier — package.json change-kind split', () => {

    test('a scripts/metadata-only package.json edit skips the components suite', async () => {
        // The surfacing incident's shape: one added npm script, no dependency-kind change.
        // The browser suite cannot be affected by a script entry, so spending a run on it is pure
        // false-positive surface (runner minutes + flake lottery), never signal.
        const runtime = createRuntime();

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(2); // base + head, exactly once each
        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'false',
            run_unit      : 'true' // a non-docs path still admits unit; the split does not touch it
        });
        expect(runtime.info.join(' ')).toContain('package.json');
    });

    test('dependency-kind package.json edits still run the components suite', async () => {
        const variants = [
            ['dependencies version bump', {dependencies: {leftpad: '1.0.1'}, scripts: {'build:all': 'a'}}],
            ['devDependencies addition',  {dependencies: {leftpad: '1.0.0'}, devDependencies: {chalk: '5.0.0'}, scripts: {'build:all': 'a'}}],
            // Resolution-affecting like a dependency edit; classified as dependency-kind by design.
            ['overrides change',          {dependencies: {leftpad: '1.0.0'}, overrides: {leftpad: '1.0.1'}, scripts: {'build:all': 'a'}}]
        ];

        for (const [label, headPkg] of variants) {
            const runtime = createRuntime({ headPkg });

            await executeScript(scopeScript(), runtime);

            expect(outputsOf(runtime), label).toMatchObject({ run_components: 'true' });
        }
    });

    test('a package-lock.json-only change runs components without a content read', async () => {
        const runtime = createRuntime({ files: ['package-lock.json'] });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(0); // the lock atom needs no content read
        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true' });
    });

    test('an undeterminable package.json diff fails TOWARD running (fetch failure)', async () => {
        // The completeness rule outranks the optimization: a skipped suite is a false negative
        // that ships regressions; a wasted run costs minutes. This arm reds if the fallback is
        // ever flipped to skip.
        const runtime = createRuntime({ getContentError: 'getContent unavailable' });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true' });
    });

    test('an undeterminable package.json diff fails TOWARD running (unparseable content)', async () => {
        const runtime = createRuntime({ headPkgRaw: 'not-json{' });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true' });
    });

    test('an undeterminable package.json diff fails TOWARD running (missing base ref)', async () => {
        const runtime = createRuntime({ baseSha: '0'.repeat(40) });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true' });
    });

    test('PRs without package.json pay zero extra API calls', async () => {
        const runtime = createRuntime({ files: ['src/Neo.mjs', 'learn/guides/README.md'] });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(0);
        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'true', // src/ trips components via its own whitelist entry
            run_unit      : 'true'
        });
    });

    test('a fork PR with a metadata-only package.json edit resolves head content from the fork', async () => {
        // Fork heads exist only in the fork repo: the head-content read must follow
        // `pull_request.head.repo`, or every fork PR fails open into full suites forever
        // (the mock throws for a base-repo fetch of the fork SHA, exactly like the API).
        const runtime = createRuntime({ forkOwner: 'contributor' });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(2);
        expect(runtime.calls.contentCalls).toEqual(['neomjs/neo@base-sha', 'contributor/neo@head-sha']);
        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_unit: 'true' });
        expect(runtime.info.join(' ')).toContain('contributor/neo'); // the resolved head repo stays legible
    });

    test('a fork PR whose head repo is unreadable fails TOWARD running', async () => {
        // Same completeness rule as the same-repo fallbacks above. Deleted forks also arrive as
        // head.repo === null, which takes the same-repo path and fails open on the unknown-SHA
        // fetch identically.
        const runtime = createRuntime({ forkOwner: 'contributor', forkUnreadable: true });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true' });
    });

});

test.describe('Tests scope classifier — unit admission on docs and content paths', () => {

    test('a genuinely docs-only change skips both suites', async () => {
        const runtime = createRuntime({ files: ['README.md', 'CONTRIBUTING.md'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_e2e: 'false', run_unit: 'false' });
        expect(outputsOf(runtime).skip_reason).toContain('does not touch relevant paths');
    });

    test('learn/ is docs-only by path but still admits unit', async () => {
        // Guide links are checked against learn/tree.json, so a guide-only edit can introduce a
        // route resolving to no record. Without this exception the corpus gate is skipped on
        // exactly the PRs it exists to catch.
        const runtime = createRuntime({ files: ['learn/guides/Introduction.md'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_unit: 'true' });
    });

    test('the committed-content families that unit guards each admit it', async () => {
        // Each of these is docs-only by path and would be skipped without its own exception.
        // Asserted per-family rather than as one union so a dropped family names itself.
        const families = [
            'resources/content/release-notes/v13.0.0.md',
            'resources/content/discussions/17846.md',
            'apps/portal/resources/data/index.json'
        ];

        for (const file of families) {
            const runtime = createRuntime({ files: [file] });

            await executeScript(scopeScript(), runtime);

            expect(outputsOf(runtime), file).toMatchObject({ run_unit: 'true' });
        }
    });

    test('a content path outside the guarded families stays docs-only', async () => {
        // The discriminator for the arm above: `resources/content/` is docs-only, and only the
        // named subtrees lift it. Without this, a `requiresUnitForContent` that returned true for
        // everything under resources/content/ would pass the family arm and be wrong.
        const runtime = createRuntime({ files: ['resources/content/tickets/17922.md'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_unit: 'false' });
    });

    test('the workflow classifies edits to itself into the components suite', async () => {
        // A change to the runner must run the suites it invokes, or a scoping regression ships on
        // the one PR guaranteed not to exercise it. `test.yml` does not invoke the e2e tier, so it
        // does not admit it — the two runners each answer for their own suites.
        const runtime = createRuntime({ files: ['.github/workflows/test.yml'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true', run_e2e: 'false', run_unit: 'true' });
    });

    test('an edit to the shared classifier admits every suite it gates', async () => {
        // The predicate now lives in a file of its own, and that file decides for all three
        // suites. If it were absent from its own whitelists, the one PR that changes scoping
        // would be the one PR that runs nothing — the same shape as the arm above, with a wider
        // blast radius since a single edit here can silence every suite at once.
        const runtime = createRuntime({ files: [`.github/workflows/${CLASSIFIER}`] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true', run_e2e: 'true', run_unit: 'true' });
    });

});

test.describe('Tests scope classifier — unavailable diffs', () => {

    test('a workflow_dispatch admits every suite, and does so on purpose', async () => {
        // The e2e tier is dispatchable as a measuring instrument, and a dispatch has no diff to
        // classify: `getChangedFiles` returns null for any event that is not a pull request or a
        // push, which lands on the unavailable branch and admits everything. That is the right
        // answer — a probe naming its own specs must not be gated on paths nobody changed — but it
        // arrives by falling through rather than by decision, and an untested fall-through is one
        // refactor from becoming a dispatch that silently runs nothing.
        const runtime = createRuntime({ eventName: 'workflow_dispatch' });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.listFiles, 'a dispatch has no diff to list').toBe(0);
        expect(runtime.calls.pullsGet,  'and no head to compare').toBe(0);
        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'true',
            run_e2e       : 'true',
            run_unit      : 'true',
            skip_reason   : 'changed files unavailable'
        });
    });

    test('an empty changed-file set runs both suites', async () => {
        const runtime = createRuntime({ files: [] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'true',
            run_e2e       : 'true',
            run_unit      : 'true',
            skip_reason   : 'changed files unavailable'
        });
    });

});

test.describe('Tests scope classifier — the e2e engine tier predicate', () => {

    /**
     * The tier's relevant paths, MEASURED against its own runnable selection rather than inferred
     * from where the specs live. Each entry names the spec surface that establishes it, because a
     * predicate atom without a witness is a guess that reads like a decision.
     *
     * Three of these are the ones an `examples/`-plus-config-chain reading omits, which is the
     * reading the tier's own layout invites. Gated on that shorter list it would go quiet on a
     * change to the workstation app, to a component harness app, or to the module that DECIDES
     * which specs the job invokes — and going quiet behind a green check is the failure this
     * whole predicate exists to prevent.
     * @type {Object[]}
     */
    const e2eRelevant = [
        {file: 'src/dashboard/dock/model/Operations.mjs',            why: 'the engine under test; imported by the dock specs directly'},
        {file: 'examples/dashboard/dock/index.html',                 why: 'navigated by the dock specs'},
        {file: 'apps/workstation/index.html',                        why: 'navigated by the workstation specs'},
        {file: 'test/playwright/component/apps/dock-lock/app.mjs',   why: 'a harness app the e2e specs navigate to'},
        {file: 'test/playwright/e2e/grid/RowPinning.spec.mjs',       why: 'the specs themselves'},
        {file: 'test/playwright/fixtures.mjs',                       why: 'imported by the specs'},
        {file: 'test/playwright/playwright.config.e2e.mjs',          why: 'selection and projects'},
        {file: '.github/workflows/test-e2e.yml',                     why: 'the runner that invokes the tier'},
        {file: 'buildScripts/util/e2eCiSelection.mjs',               why: 'decides WHICH specs the job runs'},
        // Every row below is a measured FALSE NEGATIVE of the first version of this predicate,
        // found by executing the committed script against real inputs rather than re-reading it.
        // They are the reason the boundary is now stated as rules over the job's launch chain: each
        // one is consumed by the run, and none of them is a spec, an engine file or a nav target —
        // the three shapes a location list notices.
        {file: 'resources/scss/src/dashboard/Container.scss',        why: 'compiles to the theme the dock paint and geometry arms measure'},
        {file: 'test/playwright/externalBrainSelection.mjs',         why: 'imported by playwright.config.e2e.mjs — it decides the ignored population'},
        {file: 'test/playwright/resolveFreePort.mjs',                why: 'imported by playwright.config.e2e.mjs — it picks the server port'},
        {file: 'test/playwright/util/RmaHelpers.mjs',                why: 'imported by the shared fixtures every spec builds on'},
        {file: 'test/playwright/e2e/globalSetup.mjs',                why: 'the first half of the tier\'s own webServer.command'},
        {file: 'buildScripts/webpack/webpack.server.config.mjs',     why: 'the server `server-start` launches for the tier to drive'},
        {file: 'buildScripts/util/developmentThemeAssets.mjs',       why: 'builds the theme assets the run serves'}
    ];

    for (const {file, why} of e2eRelevant) {
        test(`admits the tier on ${file}`, async () => {
            const runtime = createRuntime({ files: [file] });

            await executeScript(scopeScript(), runtime);

            expect(outputsOf(runtime), why).toMatchObject({ run_e2e: 'true' });
        });
    }

    test('a baseline-pin-only change does NOT run the tier', async () => {
        // The witnessed regression, preserved as an executable arm: a pull request whose entire
        // diff was one `uses:` SHA in `pr-baseline.yml` provisioned a browser and ran the full
        // engine suite. This is the negative the predicate exists to produce.
        const runtime = createRuntime({ files: ['.github/workflows/pr-baseline.yml'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_e2e: 'false' });
        expect(outputsOf(runtime).skip_reason).toContain('does not touch relevant paths');
    });

    test('a unit-only spec change does NOT run the tier', async () => {
        // The discriminating negative. `test/playwright/` is not one surface: the e2e predicate
        // admits the e2e tree and the component HARNESS APPS the e2e specs navigate to, and
        // nothing else under it. Whitelisting the directory wholesale would pass every arm above
        // while making this one red, which is why it is here.
        const runtime = createRuntime({ files: ['test/playwright/unit/core/Base.spec.mjs'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_e2e: 'false', run_unit: 'true' });
    });

    test('an examples-only change runs the tier and NOT the components suite', async () => {
        // The AC's own verification, stated as the classifier sees it: `examples/` is absent from
        // the components whitelist and present in the e2e one, so this diff separates the two
        // predicates rather than merely exercising both at once.
        const runtime = createRuntime({ files: ['examples/grid/bigData/app.mjs'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_e2e: 'true' });
    });

    test('a component spec is NOT e2e-relevant, though its harness app is', async () => {
        // The second counted exclusion under `test/playwright/`. The rule admits that directory
        // broadly — that is what stopped the helper false-negatives — so the two sibling suites'
        // spec trees have to be excluded explicitly, and `component/apps/` re-admitted inside one
        // of them. This arm pins the seam: the spec is out, the harness app it mounts is in.
        const spec = createRuntime({ files: ['test/playwright/component/dock/Rail.spec.mjs'] });

        await executeScript(scopeScript(), spec);
        expect(outputsOf(spec), 'a component spec').toMatchObject({ run_components: 'true', run_e2e: 'false' });

        const harness = createRuntime({ files: ['test/playwright/component/apps/dock-first-mount/app.mjs'] });

        await executeScript(scopeScript(), harness);
        expect(outputsOf(harness), 'the harness app beneath it').toMatchObject({ run_e2e: 'true' });
    });

    test('package.json admits the tier on a dependency move or an INVOKED script, not on an unrelated one', async () => {
        // Three-way, because two of these look identical as a path atom. The tier boots the
        // installed tree, so a dependency move is relevant; it also RUNS named scripts —
        // `bundle-browser-deps` and its children from the workflow, `server-start` from the
        // config's own `webServer.command` — so editing one of those changes what executes just as
        // surely as editing the server config it points at. An unrelated script cannot.
        const dependency = createRuntime({ files: ['package.json'], headPkg: { dependencies: { leftpad: '2.0.0' } } });

        await executeScript(scopeScript(), dependency);
        expect(outputsOf(dependency), 'dependency-kind edit').toMatchObject({ run_e2e: 'true' });

        // Absent at base, present at head: the tier's own webServer command line changing.
        const invoked = createRuntime({
            files  : ['package.json'],
            headPkg: { dependencies: { leftpad: '1.0.0' }, scripts: { 'build:all': 'a', 'server-start': 'webpack serve --port 9000' } }
        });

        await executeScript(scopeScript(), invoked);
        expect(outputsOf(invoked), 'an invoked script changing').toMatchObject({ run_e2e: 'true' });

        // The default head adds `ai:new-script` and moves no dependency — the discriminating
        // negative, and the reason the script comparison is keyed rather than wholesale.
        const unrelated = createRuntime({ files: ['package.json'] });

        await executeScript(scopeScript(), unrelated);
        expect(outputsOf(unrelated), 'an unrelated script').toMatchObject({ run_components: 'false', run_e2e: 'false' });
    });

});
