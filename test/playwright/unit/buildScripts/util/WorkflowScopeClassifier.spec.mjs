import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

/**
 * The scope classifier decides whether this repository's test suites run at all.
 *
 * `.github/workflows/test.yml`'s `changes` job holds one inline `actions/github-script` step whose
 * outputs gate every expensive job downstream. `neomjs/neo` CI is exactly two projects — `unit` and
 * `components` — so a classifier that answers `false` too eagerly does not turn anything red. It
 * produces a green run with nothing behind it — a coverage loss indistinguishable from success,
 * which is the one class of regression a test suite cannot report about itself.
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
 * longer exist**: the `changes` job declares `run_unit`, `run_components` and `skip_reason`, because
 * the integration and parity suites left with the extraction. That is a legitimate topology change
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
 * @summary The committed classifier source, read from the workflow on every call.
 *
 * Deliberately re-read rather than cached at module scope: the assertion is about what
 * `test.yml` contains right now, and a cached string would keep passing against a workflow the
 * repository no longer has.
 * @returns {String} The inline script body of the `scope` step.
 */
const scopeScript = () =>
    readWorkflow('test.yml').jobs.changes.steps.find(step => step.id === 'scope').with.script;

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
    liveHead        = 'head-sha'
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
              eventName: 'pull_request',
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
        // `components`; the integration and parity outputs the pre-split spec asserted are gone.
        // If a suite is ever added back, this arm reds FIRST and points at the missing coverage,
        // rather than the arms below silently classifying for a surface nobody asserted.
        const outputs = readWorkflow('test.yml').jobs.changes.outputs;

        expect(Object.keys(outputs).sort()).toEqual(['run_components', 'run_unit', 'skip_reason']);
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
        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true', run_unit: 'true' });
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

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'false', run_unit: 'false' });
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
        // A change to the classifier must run the suites it gates, or a scoping regression ships
        // on the one PR guaranteed not to exercise it.
        const runtime = createRuntime({ files: ['.github/workflows/test.yml'] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({ run_components: 'true', run_unit: 'true' });
    });

});

test.describe('Tests scope classifier — unavailable diffs', () => {

    test('an empty changed-file set runs both suites', async () => {
        const runtime = createRuntime({ files: [] });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components: 'true',
            run_unit      : 'true',
            skip_reason   : 'changed files unavailable'
        });
    });

});
