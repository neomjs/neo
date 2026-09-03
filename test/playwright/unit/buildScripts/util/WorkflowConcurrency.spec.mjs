import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

/**
 * Three CI mechanisms decide whether work is spent on a head that still exists, and whether the
 * swarm's merge-eligibility status tells the truth. All three run on every pull request. None of
 * them had unit coverage between `c623b2f63c` and this file.
 *
 * 1. **Rerun isolation.** `test.yml` cancels in progress runs, which is right for a new head and
 *    wrong for a rerun: a rerun of an older attempt would otherwise cancel the run for the head
 *    that superseded it. The concurrency group keys on `github.run_attempt == '1' && github.ref ||
 *    github.run_id` so first attempts share the ref stream and reruns keep their own id.
 *    Losing that ternary produces cancelled runs that read as flakes.
 * 2. **The `jobs.test` head gate.** Re-running failed jobs does not re-run the `changes`
 *    prerequisite, so the test job re-reads the live head itself and gates every expensive step on
 *    `steps.head.outputs.current`. A step added without that gate spends a full runner on a
 *    superseded head and nothing turns red.
 * 3. **The review-admission mergeability controller** (`review-admission-mergeability.yml`), which
 *    publishes the `review-admission/mergeability` commit status that merge readiness is read from.
 *
 * **Why the subjects are reached through YAML rather than imported.** Two of them are not modules.
 * They are strings inside workflow files, evaluated by `actions/github-script` with `github`,
 * `context` and `core` in scope. The only honest way to test them is to read the exact committed
 * string and evaluate it against mocks bound to those three names, which is what
 * {@link executeScript} does. Re-typing the logic here would test a copy, and a copy cannot drift
 * with its original.
 *
 * ---
 *
 * **Restored from `c623b2f63c^`, and NOT verbatim.** This file was deleted at
 * `test/playwright/unit/ai/buildScripts/util/WorkflowConcurrency.spec.mjs` as one of the 804 unit
 * specs swept on the `ai/` path prefix. Its subjects stayed. It returns beside the
 * surviving sibling tree, because the `ai/` prefix is exactly what marked it as extracted substrate
 * and would re-arm the same deletion at the next boundary change.
 *
 * Four of the original nineteen arms do not return, and the two reasons are different enough that
 * collapsing them would hide one:
 *
 * - **Retired as topology (2).** `routes the parity surface to its lane` and `cannot skip the lane
 *   for the booted stack's runtime dependencies` assert `run_integration` and `run_parity`. Those
 *   outputs no longer exist — the `changes` job declares `run_unit`, `run_components` and
 *   `skip_reason`, because the integration and parity suites left with the extraction. A legitimate
 *   change in the subject, not a defect in it.
 * - **Retired as superseded (2).** `admits only the live pull-request head` and `preserves
 *   current-head and push admission` assert the **`scope`** step's stale-head guard, which
 *   `util/WorkflowScopeClassifier.spec.mjs` covers since `8c86f4478f`. Two specs owning one
 *   assertion is not redundancy; it is drift with two homes.
 *
 * The resulting subject split is stated rather than implied: `WorkflowScopeClassifier` owns *which
 * paths admit which suite*; this file owns *head currency, rerun isolation, and the review-admission
 * controller*. `a live-head lookup failure fails closed before path classification` touches the
 * `scope` step and still lives here, because it is a head-currency assertion with no sibling
 * equivalent — relocating it would have been fine, dropping it would have lost coverage.
 *
 * One arm is **strengthened rather than restored**: `failed-job reruns recheck the live head before
 * every expensive step` carried a hardcoded list of eight step names, three of which no longer
 * exist. A name list cannot see a *newly added* ungated step, which is the regression that matters,
 * so the assertion is derived from the workflow instead — every step positioned after `id: head`
 * must reference `steps.head.outputs.current`.
 *
 * Saying all of this out loud is the point: a restored spec that quietly sheds assertions is
 * indistinguishable from one trimmed to make the suite green — which is the argument of the census
 * that found this deletion, one order smaller.
 *
 * @see .github/workflows/test.yml
 * @see .github/workflows/review-admission-mergeability.yml
 * @see test/playwright/unit/buildScripts/util/WorkflowScopeClassifier.spec.mjs (the sibling half)
 */

const __dirname              = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot               = path.resolve(__dirname, '../../../../..'),
      workflowsDir           = path.join(repoRoot, '.github/workflows'),
      rerunIsolationContract = "github.run_attempt == '1' && github.ref || github.run_id",
      AsyncFunction          = Object.getPrototypeOf(async function() {}).constructor;

/**
 * @summary Parses one committed workflow file.
 *
 * Deliberately re-read on every call rather than cached at module scope: the assertions are about
 * what `.github/workflows/` contains right now, and a cached document would keep passing against a
 * workflow the repository no longer has.
 *
 * @param {String} name File name inside `.github/workflows/`
 * @returns {Object} The parsed workflow document
 */
const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

/**
 * @summary Reads the trigger map, tolerating YAML's `on` key.
 *
 * `on:` is a plain string key under the YAML 1.2 core schema and a boolean under 1.1. The parser
 * shipped here uses the former, but reading through both spellings keeps the arm asserting the
 * workflow rather than the parser version.
 *
 * @param {Object} workflow Parsed workflow document
 * @returns {Object} The trigger map
 */
const triggersOf = workflow => workflow.on ?? workflow[true] ?? {};

/**
 * @summary Evaluates an `actions/github-script` body against mocked runtime globals.
 *
 * The script bodies are authored for the four names `actions/github-script` injects. Building an
 * `AsyncFunction` over exactly those names is what lets the committed string — not a transcription
 * of it — be the subject under test.
 *
 * @param {String} script Inline script body read from the workflow
 * @param {Object} runtime Mock runtime from {@link createRuntime} or {@link createReviewAdmissionRuntime}
 * @returns {Promise<void>}
 */
const executeScript = async(script, runtime) => {
    await new AsyncFunction('github', 'context', 'core', 'setTimeout', script)(
        runtime.github,
        runtime.context,
        runtime.core,
        runtime.setTimeout || globalThis.setTimeout
    );
};

/**
 * @summary Builds a mocked runtime for the `test.yml` head-currency scripts.
 *
 * `eventHead` diverging from `liveHead` is the superseded-attempt case the gates exist for; keeping
 * them equal is the ordinary case. `calls` counts the REST surfaces separately so an arm can assert
 * that classification never ran, which is stronger than asserting its outputs are absent.
 *
 * @param {Object} [options]
 * @param {String} [options.eventHead='stale-head'] Head SHA carried by the workflow event payload
 * @param {String} [options.eventName='pull_request'] Workflow event name
 * @param {String[]} [options.files] Changed files the listing surfaces return
 * @param {String} [options.liveHead='current-head'] Head SHA the live PR read returns
 * @returns {Object} `{calls, context, core, github, outputs, summary}`
 */
const createRuntime = ({
    eventHead = 'stale-head',
    eventName = 'pull_request',
    files     = ['src/Neo.mjs'],
    liveHead  = 'current-head'
} = {}) => {
    const outputs = new Map(),
          summary = [],
          calls   = { compare: 0, listFiles: 0, pullsGet: 0 },
          core    = {
              info     : () => {},
              notice   : () => {},
              setOutput: (name, value) => outputs.set(name, value),
              summary  : {
                  addHeading(value) {
                      summary.push(value);
                      return this;
                  },
                  addRaw(value) {
                      summary.push(value);
                      return this;
                  },
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
                      },
                      listFiles: () => {}
                  },
                  repos: {
                      compareCommitsWithBasehead: async() => {
                          calls.compare++;
                          return { data: { files: files.map(filename => ({ filename })) } };
                      }
                  }
              }
          },
          context = {
              eventName,
              payload: {
                  after       : 'after-sha',
                  before      : 'before-sha',
                  pull_request: {
                      base  : { sha: 'base-sha' },
                      head  : { sha: eventHead },
                      number: 15593
                  }
              },
              repo: { owner: 'neomjs', repo: 'neo' }
          };

    return { calls, context, core, github, outputs, summary };
};

/**
 * @summary Builds one live REST pull-request observation for the review-admission controller.
 * @param {Boolean|null} mergeable GitHub mergeability value; `null` is "still computing"
 * @param {Object} [options]
 * @param {String} [options.head='pr-head'] Head SHA
 * @param {String} [options.base='dev-head'] Base SHA
 * @returns {Object}
 */
const mergeabilityPull = (mergeable, {head = 'pr-head', base = 'dev-head'} = {}) => ({
    number: 42,
    mergeable,
    head  : {sha: head},
    base  : {sha: base}
});

/**
 * @summary Creates mocked GitHub/core surfaces for discovery and exact-head status publication.
 *
 * `reads` is an ordered script of live PR observations whose final value repeats once exhausted,
 * which is what lets an arm express "null, then null, then true" without counting the controller's
 * internal poll structure. Published statuses are held in a map keyed by head SHA so the
 * append-only duplicate suppression can be observed rather than assumed.
 *
 * @param {Object} [options]
 * @param {Object[]|Error} [options.targets] Open PR rows returned by discovery, or a source failure
 * @param {(Object|Error)[]} [options.reads] Ordered live PR reads
 * @param {String} [options.eventName='push'] Workflow event name
 * @param {Number} [options.eventPrNumber=42] Pull-request number in a `pull_request_target` payload
 * @param {String} [options.eventAction='synchronize'] Pull-request activity
 * @param {Boolean} [options.eventMerged=false] Whether a closed pull request merged
 * @param {Object} [options.publishedStates] Existing named status keyed by head SHA
 * @returns {Object}
 */
const createReviewAdmissionRuntime = ({
    targets         = [],
    reads           = [mergeabilityPull(true)],
    eventName       = 'push',
    eventPrNumber   = 42,
    eventAction     = 'synchronize',
    eventMerged     = false,
    publishedStates = {}
} = {}) => {
    const failures     = [],
          errors       = [],
          delays       = [],
          outputs      = new Map(),
          statusCalls  = [],
          statusReads  = [],
          listCalls    = [],
          pullReads    = [],
          statusByHead = new Map(Object.entries(publishedStates));

    let readIndex = 0;

    return {
        context: {
            eventName,
            payload: {
                action      : eventAction,
                pull_request: {number: eventPrNumber, merged: eventMerged}
            },
            repo   : {owner: 'neomjs', repo: 'neo'}
        },
        core   : {
            error    : message => errors.push(message),
            info     : () => {},
            setFailed: message => failures.push(message),
            setOutput: (name, value) => outputs.set(name, value)
        },
        github: {
            paginate: async(method, args) => {
                listCalls.push({method, args});

                if (targets instanceof Error) throw targets;

                return targets;
            },
            rest: {
                pulls: {
                    list: () => {},
                    get : async args => {
                        pullReads.push(args);

                        const value = reads[Math.min(readIndex++, reads.length - 1)];

                        if (value instanceof Error) throw value;

                        return {data: value};
                    }
                },
                repos: {
                    getCombinedStatusForRef: async args => {
                        statusReads.push(args);

                        const state = statusByHead.get(args.ref);

                        return {data: {statuses: state ? [{
                            context: 'review-admission/mergeability',
                            state
                        }] : []}};
                    },
                    createCommitStatus: async args => {
                        statusCalls.push(args);
                        statusByHead.set(args.sha, args.state);
                        return {data: args};
                    }
                }
            }
        },
        errors,
        delays,
        failures,
        listCalls,
        outputs,
        pullReads,
        statusCalls,
        statusReads,
        setTimeout: (resolve, delay) => {
            delays.push(delay);
            resolve();
        }
    };
};

/**
 * @summary Executes the publish script with zero-cost polling while restoring process env.
 *
 * The controller reads its bounds from the environment, so the arms would otherwise depend on
 * whatever the runner happens to export. The delay is forced to zero because the assertions are
 * about the verdict sequence, never about wall-clock pacing.
 *
 * @param {String} script Extracted `actions/github-script` source
 * @param {Object} runtime Mock runtime from {@link createReviewAdmissionRuntime}
 * @returns {Promise<void>}
 */
const executeReviewAdmissionPublisher = async(script, runtime) => {
    const keys = {
        PR_NUMBER                 : '42',
        MERGEABILITY_POLL_ATTEMPTS: '4',
        MERGEABILITY_POLL_DELAY_MS: '0',
        MERGEABILITY_MAX_RESTARTS : '3',
        GITHUB_SERVER_URL         : 'https://github.com',
        GITHUB_RUN_ID             : '32700000000'
    };
    const previous = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));

    Object.assign(process.env, keys);

    try {
        await executeScript(script, runtime);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            value === undefined ? delete process.env[key] : process.env[key] = value;
        }
    }
};

test.describe('GitHub workflow concurrency (#15593)', () => {
    test('every canceling pull-request workflow isolates reruns from the initial ref stream', () => {
        const protectedWorkflows  = [],
              vulnerableWorkflows = [];

        for (const name of fs.readdirSync(workflowsDir).filter(name => name.endsWith('.yml'))) {
            const workflow = readWorkflow(name),
                  group    = workflow.concurrency?.group;

            if (!triggersOf(workflow).pull_request || workflow.concurrency?.['cancel-in-progress'] !== true) {
                continue;
            }

            if (typeof group === 'string' && group.includes(rerunIsolationContract)) {
                protectedWorkflows.push(name);
            } else {
                vulnerableWorkflows.push(name);
            }
        }

        // The census is only meaningful if it found the workflow the contract was written for.
        expect(protectedWorkflows).toContain('test.yml');
        expect(vulnerableWorkflows).toEqual([]);
    });

    test('a live-head lookup failure fails closed before path classification', async() => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script,
              runtime  = createRuntime();

        runtime.github.rest.pulls.get = async() => {
            throw new Error('live head unavailable');
        };

        await expect(executeScript(script, runtime)).rejects.toThrow('live head unavailable');

        // Failing closed means no classification happened and no admission was published. An
        // unreadable head that still emitted `run_unit=true` would be the classifier guessing.
        expect(runtime.calls.listFiles).toBe(0);
        expect(runtime.outputs.size).toBe(0);
    });

    test('every step after the head gate is gated on it', () => {
        const steps     = readWorkflow('test.yml').jobs.test.steps,
              headIndex = steps.findIndex(step => step.id === 'head');

        expect(headIndex).toBeGreaterThanOrEqual(0);

        // Derived rather than enumerated: a hardcoded list of step names passes by coincidence and
        // is blind to a NEW expensive step added without the gate, which is the regression that
        // costs a runner on a head that no longer exists.
        const ungated = steps
            .slice(headIndex + 1)
            .filter(step => !String(step.if || '').includes('steps.head.outputs.current'));

        expect(ungated.map(step => step.name)).toEqual([]);

        // The gate must precede checkout, or the cost it avoids has already been paid.
        expect(headIndex).toBeLessThan(steps.findIndex(step => step.name === 'Checkout repository'));

        // And the skip notice is the one step that must run on the negative arm.
        expect(steps.find(step => step.name === 'Skip ${{ matrix.suite }} tests').if)
            .toContain("steps.head.outputs.current != 'true'");
    });

    test('the failed-job gate skips a superseded head and preserves current-head and push retries', async() => {
        const steps      = readWorkflow('test.yml').jobs.test.steps,
              headScript = steps.find(step => step.id === 'head').with.script,
              stale      = createRuntime(),
              current    = createRuntime({ eventHead: 'current-head' }),
              push       = createRuntime({ eventName: 'push' });

        await executeScript(headScript, stale);
        await executeScript(headScript, current);
        await executeScript(headScript, push);

        expect(stale.calls.pullsGet).toBe(1);
        expect(Object.fromEntries(stale.outputs)).toEqual({
            current    : 'false',
            skip_reason: 'stale workflow head stale-head; live PR head is current-head'
        });
        expect(stale.summary.join(' ')).toContain('Stale workflow attempt');

        // A live head and a push both proceed; only the pull-request arm pays the REST read.
        expect(current.calls.pullsGet).toBe(1);
        expect(push.calls.pullsGet).toBe(0);
        expect(Object.fromEntries(current.outputs)).toEqual({ current: 'true' });
        expect(Object.fromEntries(push.outputs)).toEqual({ current: 'true' });
    });
});

test.describe('review-admission mergeability controller (#17692)', () => {
    const workflowName = 'review-admission-mergeability.yml';

    test('uses conflict-capable trusted triggers, least permissions, and no checkout', () => {
        const workflow = readWorkflow(workflowName),
              triggers = triggersOf(workflow),
              dataSync = readWorkflow('data-sync-pipeline.yml'),
              steps    = Object.values(workflow.jobs).flatMap(job => job.steps || []);

        // Ordinary `pull_request` workflows do not run on a conflicted PR, which is the state this
        // controller exists to report. `pull_request_target` runs trusted `dev` code instead — so
        // the least-permission set and the absence of a checkout are load-bearing, not hygiene.
        expect(triggers.pull_request_target).toMatchObject({
            branches: ['dev'],
            types   : ['opened', 'reopened', 'synchronize', 'ready_for_review', 'closed']
        });
        expect(triggers.push).toEqual({branches: ['dev']});
        expect(triggers.workflow_run).toEqual({
            workflows: ['Data Sync Pipeline'],
            types    : ['completed']
        });
        // The trigger names a workflow by title; a rename there would silently unhook this one.
        expect(dataSync.name).toBe(triggers.workflow_run.workflows[0]);
        expect(triggers).toHaveProperty('workflow_dispatch');
        expect(workflow.permissions).toEqual({
            'pull-requests': 'read',
            statuses       : 'write'
        });
        expect(steps.some(step => String(step.uses || '').startsWith('actions/checkout@'))).toBe(false);

        // Cancellation is not a write fence: an in-flight old status POST can land after a newer
        // job. Serialization per PR is what makes the newest run the last writer.
        expect(workflow.jobs.publish.concurrency).toEqual({
            group               : 'review-admission-mergeability-${{ matrix.pr }}',
            'cancel-in-progress': false
        });
        expect(workflow.jobs.discover.steps.find(step => step.id === 'targets').env)
            .toEqual({OVERFLOW_WRITE_DELAY_MS: '1000'});
    });

    test('pull_request_target evaluates only its event PR; board triggers enumerate', async() => {
        const workflow = readWorkflow(workflowName),
              script   = workflow.jobs.discover.steps.find(step => step.id === 'targets').with.script,
              prEvent  = createReviewAdmissionRuntime({
                  eventName    : 'pull_request_target',
                  eventPrNumber: 17692,
                  targets      : [{number: 1}, {number: 2}]
              }),
              push     = createReviewAdmissionRuntime({targets: [
                  {number: 1, head: {sha: 'head-1'}},
                  {number: 2, head: {sha: 'head-2'}}
              ]}),
              sync     = createReviewAdmissionRuntime({
                  eventName: 'workflow_run',
                  targets  : [{number: 3, head: {sha: 'head-3'}}]
              }),
              merged   = createReviewAdmissionRuntime({
                  eventName  : 'pull_request_target',
                  eventAction: 'closed',
                  eventMerged: true,
                  targets    : [{number: 4, head: {sha: 'head-4'}}]
              }),
              closed   = createReviewAdmissionRuntime({
                  eventName  : 'pull_request_target',
                  eventAction: 'closed',
                  eventMerged: false,
                  targets    : [{number: 5, head: {sha: 'head-5'}}]
              });

        await executeScript(script, prEvent);
        await executeScript(script, push);
        await executeScript(script, sync);
        await executeScript(script, merged);
        await executeScript(script, closed);

        // Author-head movement needs one evaluation; enumerating the board on every synchronize
        // multiplies status writes by open-PR count.
        expect(Object.fromEntries(prEvent.outputs)).toEqual({prs: '[17692]'});
        expect(prEvent.listCalls).toEqual([]);

        // Base movement invalidates every open head, so these three must enumerate.
        expect(Object.fromEntries(push.outputs)).toEqual({prs: '[1,2]'});
        expect(push.listCalls).toHaveLength(1);
        expect(Object.fromEntries(sync.outputs)).toEqual({prs: '[3]'});
        expect(sync.listCalls).toHaveLength(1);
        expect(Object.fromEntries(merged.outputs)).toEqual({prs: '[4]'});
        expect(merged.listCalls).toHaveLength(1);

        // Closing without merging does not move `dev`, and the closed PR must get no fresh status.
        expect(Object.fromEntries(closed.outputs)).toEqual({prs: '[]'});
        expect(closed.listCalls).toEqual([]);
    });

    test('discovers the complete open dev-target set and rejects matrix overflow', async() => {
        const workflow = readWorkflow(workflowName),
              script   = workflow.jobs.discover.steps.find(step => step.id === 'targets').with.script,
              normal   = createReviewAdmissionRuntime({targets: [
                  {number: 9, head: {sha: 'head-9'}},
                  {number: 3, head: {sha: 'head-3'}},
                  {number: 9, head: {sha: 'head-9'}}
              ]}),
              overflow = createReviewAdmissionRuntime({
                  publishedStates: {
                      'overflow-head-1': 'error',
                      'overflow-head-2': 'error'
                  },
                  targets: Array.from({length: 33}, (_, index) => ({
                      number: index + 1,
                      head  : {sha: `overflow-head-${index + 1}`}
                  }))
              });

        const previousDelay = process.env.OVERFLOW_WRITE_DELAY_MS;

        process.env.OVERFLOW_WRITE_DELAY_MS = '1000';

        try {
            await executeScript(script, normal);
            await executeScript(script, overflow);
        } finally {
            previousDelay === undefined
                ? delete process.env.OVERFLOW_WRITE_DELAY_MS
                : process.env.OVERFLOW_WRITE_DELAY_MS = previousDelay;
        }

        expect(normal.listCalls[0].args).toMatchObject({state: 'open', base: 'dev', per_page: 100});
        expect(Object.fromEntries(normal.outputs)).toEqual({prs: '[3,9]'});
        expect(normal.failures).toEqual([]);

        // Over the cap the controller certifies nothing and says so, rather than certifying a
        // subset — a partial matrix would leave the unlisted PRs reading as untested green.
        expect(Object.fromEntries(overflow.outputs)).toEqual({prs: '[]'});
        expect(overflow.failures.join(' ')).toContain('Refusing partial publication');

        // 33 targets, two of which already publish `error`: 31 transitions, paced between writes.
        expect(overflow.statusCalls).toHaveLength(31);
        expect(overflow.statusCalls.every(call =>
            call.state === 'error' && call.context === 'review-admission/mergeability'
        )).toBe(true);
        expect(overflow.statusCalls.map(call => call.sha)).toContain('overflow-head-33');
        expect(overflow.statusCalls.map(call => call.sha)).not.toContain('overflow-head-1');
        expect(overflow.statusCalls.map(call => call.sha)).not.toContain('overflow-head-2');
        expect(overflow.delays).toHaveLength(30);
        expect(overflow.delays.every(delay => delay === 1000)).toBe(true);
    });

    test('board discovery failure is explicit and emits no partial matrix', async() => {
        const workflow    = readWorkflow(workflowName),
              script      = workflow.jobs.discover.steps.find(step => step.id === 'targets').with.script,
              unavailable = createReviewAdmissionRuntime({targets: new Error('pull list unavailable')});

        await executeScript(script, unavailable);

        expect(Object.fromEntries(unavailable.outputs)).toEqual({prs: '[]'});
        expect(unavailable.failures).toEqual(['Open dev PR discovery failed: pull list unavailable']);
        expect(unavailable.statusCalls).toEqual([]);
    });

    test('conflict publishes failure on the PR head, never the base', async() => {
        const workflow = readWorkflow(workflowName),
              script   = workflow.jobs.publish.steps[0].with.script,
              runtime  = createReviewAdmissionRuntime({
                  reads: [
                      mergeabilityPull(null,  {head: 'conflicting-head', base: 'moved-dev'}),
                      mergeabilityPull(false, {head: 'conflicting-head', base: 'moved-dev'}),
                      mergeabilityPull(false, {head: 'conflicting-head', base: 'moved-dev'})
                  ]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        // A status on the base SHA would mark `dev` itself, not the PR, and the PR would stay
        // unreported while looking evaluated.
        expect(runtime.statusCalls.map(call => call.state)).toEqual(['failure']);
        expect(runtime.statusCalls.every(call => call.sha === 'conflicting-head')).toBe(true);
        expect(runtime.statusCalls.every(call => call.sha !== 'moved-dev')).toBe(true);
        expect(runtime.statusCalls.every(call => call.context === 'review-admission/mergeability')).toBe(true);
        expect(runtime.failures).toEqual([]);
    });

    test('a later dev movement can turn the same formerly-green head red', async() => {
        const script = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              green  = createReviewAdmissionRuntime({
                  reads: [mergeabilityPull(true), mergeabilityPull(true), mergeabilityPull(true)]
              }),
              red    = createReviewAdmissionRuntime({
                  publishedStates: {'pr-head': 'success'},
                  reads          : [
                      mergeabilityPull(false, {base: 'next-dev'}),
                      mergeabilityPull(false, {base: 'next-dev'}),
                      mergeabilityPull(false, {base: 'next-dev'})
                  ]
              });

        await executeReviewAdmissionPublisher(script, green);
        await executeReviewAdmissionPublisher(script, red);

        // Mergeability is a head+base relation: an unchanged head can stop being mergeable.
        expect(green.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'success']
        ]);
        expect(red.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'failure']
        ]);
    });

    test('null exhaustion becomes error, never success', async() => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({reads: [mergeabilityPull(null)]});

        await executeReviewAdmissionPublisher(script, runtime);

        // `null` means GitHub has not computed it. Resolving that to `success` would admit an
        // unmeasured PR to review; `error` holds it.
        expect(runtime.statusCalls.map(call => call.state)).toEqual(['error']);
        expect(runtime.statusCalls.some(call => call.state === 'success')).toBe(false);
        expect(runtime.failures.join(' ')).toContain('stayed null after 4 bounded polls');
    });

    test('head/base movement observed before publication restarts on the new coordinate', async() => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({
                  reads: [
                      mergeabilityPull(null, {head: 'old-head', base: 'old-dev'}),
                      mergeabilityPull(null, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(null, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(true, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(true, {head: 'new-head', base: 'new-dev'})
                  ]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['new-head', 'success']
        ]);
        expect(runtime.statusCalls).not.toContainEqual(expect.objectContaining({
            sha  : 'old-head',
            state: 'success'
        }));
    });

    test('a source-read exception converts the known coordinate to error', async() => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({
                  reads: [mergeabilityPull(null), new Error('mergeability source unavailable')]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusCalls.map(call => call.state)).toEqual(['error']);
        expect(runtime.failures).toEqual(['mergeability source unavailable']);
    });

    test('an initial pull-read failure fabricates no head and names the controller failure', async() => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({reads: [new Error('initial pull unavailable')]});

        await executeReviewAdmissionPublisher(script, runtime);

        // No coordinate was ever read, so there is no SHA to mark. Writing one would be invention.
        expect(runtime.statusReads).toEqual([]);
        expect(runtime.statusCalls).toEqual([]);
        expect(runtime.failures).toEqual(['initial pull unavailable']);
    });

    test('an unchanged terminal verdict performs the live read but appends no duplicate status', async() => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({
                  publishedStates: {'pr-head': 'success'},
                  reads          : [mergeabilityPull(true)]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        // Commit statuses are append-only and hard-fail past 1,000 per SHA/context. The live source
        // read still happens on every event; only the redundant write is suppressed.
        expect(runtime.pullReads.length).toBeGreaterThanOrEqual(3);
        expect(runtime.statusReads).toHaveLength(1);
        expect(runtime.statusCalls).toEqual([]);
    });
});
