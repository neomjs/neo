import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

/**
 * Unit tests for `.github/workflows/review-admission-mergeability.yml`.
 *
 * The Review Admission Mergeability controller publishes the `review-admission/mergeability` commit
 * status on open `dev`-targeted pull requests. To preserve the organization's shared 20-runner slot
 * pool, the controller runs as a single job (`jobs.publish`) rather than fanning out `1 + N_open_PRs`
 * separate Ubuntu runner VMs across a two-job `discover` -> `publish` matrix.
 */

const __dirname     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot      = path.resolve(__dirname, '../../../../..'),
      workflowsDir  = path.join(repoRoot, '.github/workflows'),
      AsyncFunction = Object.getPrototypeOf(async function() {}).constructor,
      WORKFLOW_NAME = 'review-admission-mergeability.yml';

const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

/**
 * @summary Evaluates an inline `actions/github-script` body against a mocked runtime.
 * @param {String} script
 * @param {Object} runtime
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
 * @summary Builds one live REST pull-request observation for the review-admission workflow.
 * @param {Boolean|null} mergeable GitHub mergeability value.
 * @param {Object} [options]
 * @returns {Object}
 */
const mergeabilityPull = (mergeable, {
    base   = 'dev-head',
    head   = 'pr-head',
    merged = false,
    number = 42,
    state  = 'open'
} = {}) => ({
    number,
    state,
    merged,
    mergeable,
    head: {sha: head},
    base: {sha: base}
});

/**
 * @summary Creates mocked GitHub/core surfaces for single-job discovery and exact-head status publication.
 * @param {Object} [options]
 * @param {Object[]|Error} [options.targets] Open PR rows returned by discovery, or a source failure.
 * @param {(Object|Error)[]} [options.reads] Default ordered live PR reads; the final value repeats on exhaustion.
 * @param {Object<Number,(Object|Error)[]>} [options.readsByPr] Optional per-PR ordered read streams for multi-PR board sweeps.
 * @param {String} [options.eventName] Workflow event name.
 * @param {Number} [options.eventPrNumber] Pull-request number in a `pull_request_target` payload.
 * @param {String} [options.eventAction] Pull-request activity.
 * @param {Boolean} [options.eventMerged] Whether a closed pull request merged.
 * @param {Object} [options.publishedStates] Existing named status by head SHA.
 * @returns {Object}
 */
const createReviewAdmissionRuntime = ({
    targets              = [{number: 42, head: {sha: 'pr-head'}}],
    reads                = [mergeabilityPull(true)],
    readsByPr            = null,
    eventName            = 'push',
    eventPrNumber        = 42,
    eventAction          = 'synchronize',
    eventMerged          = false,
    publishedStates      = {},
    onBeforeCreateStatus = null
} = {}) => {
    const failures      = [],
          errors        = [],
          infos         = [],
          delays        = [],
          statusCalls   = [],
          statusReads   = [],
          listCalls     = [],
          pullReads     = [],
          statusByHead  = new Map(Object.entries(publishedStates)),
          readIndexByPr = new Map();

    let defaultReadIndex  = 0,
        activeGets        = 0,
        maxConcurrentGets = 0;

    const runtime = {
        context: {
            eventName,
            payload: {
                action      : eventAction,
                pull_request: eventPrNumber === null ? undefined : {number: eventPrNumber, merged: eventMerged}
            },
            repo: {owner: 'neomjs', repo: 'neo'}
        },
        core: {
            error    : message => errors.push(message),
            info     : message => infos.push(message),
            setFailed: message => failures.push(message)
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
                        activeGets++;
                        if (activeGets > maxConcurrentGets) {
                            maxConcurrentGets = activeGets;
                        }

                        await Promise.resolve();
                        activeGets--;

                        const prStream = readsByPr?.[args.pull_number];

                        if (Array.isArray(prStream)) {
                            const idx   = readIndexByPr.get(args.pull_number) ?? 0;
                            const value = prStream[Math.min(idx, prStream.length - 1)];

                            readIndexByPr.set(args.pull_number, idx + 1);

                            if (value instanceof Error) throw value;

                            return {data: value};
                        }

                        const value = reads[Math.min(defaultReadIndex++, reads.length - 1)];

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
                        if (typeof onBeforeCreateStatus === 'function') {
                            await onBeforeCreateStatus({args, statusByHead, statusCalls});
                        }
                        statusCalls.push(args);
                        statusByHead.set(args.sha, args.state);
                        return {data: args};
                    }
                }
            }
        },
        errors,
        infos,
        delays,
        failures,
        listCalls,
        pullReads,
        statusByHead,
        statusCalls,
        statusReads,
        get maxConcurrentGets() {
            return maxConcurrentGets;
        },
        setTimeout: (resolve, delay) => {
            delays.push(delay);
            resolve();
        }
    };

    return runtime;
};

/**
 * @summary Executes the single-job workflow publisher with deterministic env overrides.
 * @param {String} script Extracted actions/github-script source.
 * @param {Object} runtime Mock runtime.
 * @param {Object} [envOverrides] Optional environment overrides.
 * @returns {Promise<void>}
 */
const executeReviewAdmissionPublisher = async(script, runtime, envOverrides = {}) => {
    const keys = {
        OVERFLOW_WRITE_DELAY_MS   : '1000',
        MERGEABILITY_CONCURRENCY  : '4',
        MERGEABILITY_POLL_ATTEMPTS: '4',
        MERGEABILITY_POLL_DELAY_MS: '0',
        MERGEABILITY_MAX_RESTARTS : '3',
        GITHUB_SERVER_URL         : 'https://github.com',
        GITHUB_RUN_ID             : '32700000000',
        ...envOverrides
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

const publishStep = () => readWorkflow(WORKFLOW_NAME).jobs.publish.steps.find(step => String(step.uses || '').startsWith('actions/github-script@'));

test.describe('review-admission mergeability controller (#17692, #20061, #20344)', () => {
    test('runs in a single job without matrix VM fan-out and configures retries: 3 on actions/github-script', () => {
        const workflow = readWorkflow(WORKFLOW_NAME),
              jobKeys  = Object.keys(workflow.jobs),
              job      = workflow.jobs.publish,
              step     = publishStep();

        expect(jobKeys).toEqual(['publish']);
        expect(job.strategy).toBeUndefined();
        expect(job.needs).toBeUndefined();

        expect(workflow.on.pull_request_target).toEqual({
            branches: ['dev'],
            types   : ['opened', 'reopened', 'synchronize', 'ready_for_review']
        });
        expect(workflow.on.push).toEqual({branches: ['dev']});
        expect(workflow.on.workflow_run).toEqual({
            workflows: ['Data Sync Pipeline'],
            types    : ['completed']
        });
        expect(workflow.on).toHaveProperty('workflow_dispatch');
        expect(workflow.permissions).toEqual({
            'pull-requests': 'read',
            statuses       : 'write'
        });

        expect(job.steps.some(s => String(s.uses || '').startsWith('actions/checkout@'))).toBe(false);
        expect(job.concurrency).toEqual({
            group               : "review-admission-mergeability-${{ github.event_name == 'pull_request_target' && format('pr-{0}', github.event.pull_request.number) || 'board' }}",
            'cancel-in-progress': false
        });

        expect(step.uses).toBe('actions/github-script@v9');
        expect(step.with.retries).toBe(3);
        expect(step.env).toEqual({
            OVERFLOW_WRITE_DELAY_MS   : '1000',
            MERGEABILITY_CONCURRENCY  : '4',
            MERGEABILITY_POLL_ATTEMPTS: '4',
            MERGEABILITY_POLL_DELAY_MS: '250',
            MERGEABILITY_MAX_RESTARTS : '3'
        });
    });

    test('pull_request_target evaluates only its event PR; board triggers enumerate and evaluate all open dev PRs in one job', async () => {
        const script  = publishStep().with.script,
              prEvent = createReviewAdmissionRuntime({
                  eventName    : 'pull_request_target',
                  eventPrNumber: 17692,
                  targets      : [{number: 1}, {number: 2}],
                  readsByPr    : {
                      17692: [mergeabilityPull(true, {number: 17692, head: 'head-17692'})]
                  }
              }),
              push    = createReviewAdmissionRuntime({
                  eventName: 'push',
                  targets  : [
                      {number: 9, head: {sha: 'head-9'}},
                      {number: 1, head: {sha: 'head-1'}},
                      {number: 5, head: {sha: 'head-5'}},
                      {number: 2, head: {sha: 'head-2'}},
                      {number: 6, head: {sha: 'head-6'}},
                      {number: 3, head: {sha: 'head-3'}}
                  ],
                  readsByPr: {
                      1: [mergeabilityPull(true,  {number: 1, head: 'head-1'})],
                      2: [mergeabilityPull(false, {number: 2, head: 'head-2'})],
                      3: [mergeabilityPull(true,  {number: 3, head: 'head-3'})],
                      5: [mergeabilityPull(true,  {number: 5, head: 'head-5'})],
                      6: [mergeabilityPull(false, {number: 6, head: 'head-6'})],
                      9: [mergeabilityPull(true,  {number: 9, head: 'head-9'})]
                  }
              });

        await executeReviewAdmissionPublisher(script, prEvent);
        await executeReviewAdmissionPublisher(script, push, {MERGEABILITY_CONCURRENCY: '2'});

        expect(prEvent.listCalls).toEqual([]);
        expect(prEvent.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['head-17692', 'success']
        ]);

        expect(push.listCalls).toHaveLength(1);
        expect(push.maxConcurrentGets).toBeLessThanOrEqual(2);
        expect(push.statusCalls.map(call => [call.sha, call.state]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
            ['head-1', 'success'],
            ['head-2', 'failure'],
            ['head-3', 'success'],
            ['head-5', 'success'],
            ['head-6', 'failure'],
            ['head-9', 'success']
        ]);
        expect(push.failures).toEqual([]);
    });

    test('discovers the complete open dev-target set and rejects overflow above 32 PRs without partial certification', async () => {
        const script   = publishStep().with.script,
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

        await executeReviewAdmissionPublisher(script, overflow);

        expect(overflow.failures.join(' ')).toContain('Refusing partial publication');
        expect(overflow.pullReads).toEqual([]);
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

    test('board discovery failure and missing pull_request_target number fail closed without partial publication', async () => {
        const script      = publishStep().with.script,
              unavailable = createReviewAdmissionRuntime({targets: new Error('pull list unavailable')}),
              missingPr   = createReviewAdmissionRuntime({
                  eventName    : 'pull_request_target',
                  eventPrNumber: null
              });

        await executeReviewAdmissionPublisher(script, unavailable);
        await executeReviewAdmissionPublisher(script, missingPr);

        expect(unavailable.failures).toEqual(['Open dev PR discovery failed: pull list unavailable']);
        expect(unavailable.statusCalls).toEqual([]);

        expect(missingPr.failures).toEqual(['pull_request_target payload omitted the pull-request number.']);
        expect(missingPr.statusCalls).toEqual([]);
    });

    test('conflict publishes failure on the PR head, never the base', async () => {
        const script  = publishStep().with.script,
              runtime = createReviewAdmissionRuntime({
                  reads: [
                      mergeabilityPull(null,  {head: 'conflicting-head', base: 'moved-dev'}),
                      mergeabilityPull(false, {head: 'conflicting-head', base: 'moved-dev'}),
                      mergeabilityPull(false, {head: 'conflicting-head', base: 'moved-dev'})
                  ]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusCalls.map(call => call.state)).toEqual(['failure']);
        expect(runtime.statusCalls.every(call => call.sha === 'conflicting-head')).toBe(true);
        expect(runtime.statusCalls.every(call => call.sha !== 'moved-dev')).toBe(true);
        expect(runtime.statusCalls.every(call => call.context === 'review-admission/mergeability')).toBe(true);
        expect(runtime.failures).toEqual([]);
    });

    test('a later dev movement can turn the same formerly-green head red', async () => {
        const script = publishStep().with.script,
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

        expect(green.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'success']
        ]);
        expect(red.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'failure']
        ]);
    });

    test('null exhaustion, head/base restart movement, closed PR skip, and per-PR error isolation work across a batch', async () => {
        const script      = publishStep().with.script,
              nullExhaust = createReviewAdmissionRuntime({reads: [mergeabilityPull(null)]}),
              restarted   = createReviewAdmissionRuntime({
                  reads: [
                      mergeabilityPull(null, {head: 'old-head', base: 'old-dev'}),
                      mergeabilityPull(null, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(null, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(true, {head: 'new-head', base: 'new-dev'}),
                      mergeabilityPull(true, {head: 'new-head', base: 'new-dev'})
                  ]
              }),
              batch       = createReviewAdmissionRuntime({
                  targets: [
                      {number: 10, head: {sha: 'head-10'}},
                      {number: 11, head: {sha: 'head-11'}},
                      {number: 12, head: {sha: 'head-12'}}
                  ],
                  readsByPr: {
                      10: [mergeabilityPull(null, {number: 10, head: 'head-10'}), new Error('source unavailable on #10')],
                      11: [mergeabilityPull(null, {number: 11, head: 'head-11', state: 'closed', merged: true})],
                      12: [mergeabilityPull(true, {number: 12, head: 'head-12'})]
                  }
              }),
              unchanged   = createReviewAdmissionRuntime({
                  publishedStates: {'pr-head': 'success'},
                  reads          : [mergeabilityPull(true)]
              });

        await executeReviewAdmissionPublisher(script, nullExhaust);
        await executeReviewAdmissionPublisher(script, restarted);
        await executeReviewAdmissionPublisher(script, batch);
        await executeReviewAdmissionPublisher(script, unchanged);

        expect(nullExhaust.statusCalls.map(call => call.state)).toEqual(['error']);
        expect(nullExhaust.failures.join(' ')).toContain('stayed null after 4 bounded polls');

        expect(restarted.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['new-head', 'success']
        ]);

        // In a multi-target batch, one target failing and another already merged must not prevent healthy targets from publishing success.
        expect(batch.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['head-10', 'error'],
            ['head-12', 'success']
        ]);
        expect(batch.failures).toEqual(['source unavailable on #10']);
        expect(batch.infos.some(msg => msg.includes('PR #11 is merged; no mergeability status after close.'))).toBe(true);

        expect(unchanged.pullReads.length).toBeGreaterThanOrEqual(4);
        expect(unchanged.statusReads).toHaveLength(1);
        expect(unchanged.statusCalls).toEqual([]);
    });

    test('re-reads after a terminal write and restarts when a concurrent board sweep wrote against a newer base', async () => {
        const script           = publishStep().with.script;
        let   boardInterleaved = false;

        // Stage the cross-trigger race between a PR event run and a base-movement board sweep:
        // 1. This `pull_request_target` run (group `pr-42`) reads seed, observed, and verified against B1 (`mergeable: true`).
        // 2. Between its verified read and its `createCommitStatus('success')` write, a concurrent `dev` merge
        //    advances the base to B2 and a board sweep (group `board`) writes `failure` on `pr-head`.
        // 3. This run's `success` write lands after the board sweep's `failure` write.
        // 4. The post-write re-read catches `(pr-head, dev-b2)`, restarts on B2, and writes `failure` last.
        const runtime = createReviewAdmissionRuntime({
            eventName    : 'pull_request_target',
            eventPrNumber: 42,
            reads        : [
                mergeabilityPull(true,  {number: 42, head: 'pr-head', base: 'dev-b1'}),
                mergeabilityPull(true,  {number: 42, head: 'pr-head', base: 'dev-b1'}),
                mergeabilityPull(true,  {number: 42, head: 'pr-head', base: 'dev-b1'}),
                mergeabilityPull(false, {number: 42, head: 'pr-head', base: 'dev-b2'}),
                mergeabilityPull(false, {number: 42, head: 'pr-head', base: 'dev-b2'}),
                mergeabilityPull(false, {number: 42, head: 'pr-head', base: 'dev-b2'}),
                mergeabilityPull(false, {number: 42, head: 'pr-head', base: 'dev-b2'}),
                mergeabilityPull(false, {number: 42, head: 'pr-head', base: 'dev-b2'})
            ],
            onBeforeCreateStatus: ({args, statusByHead, statusCalls}) => {
                if (!boardInterleaved && args.state === 'success') {
                    boardInterleaved = true;
                    statusCalls.push({
                        owner      : 'neomjs',
                        repo       : 'neo',
                        sha        : 'pr-head',
                        state      : 'failure',
                        context    : 'review-admission/mergeability',
                        description: 'Conflicts with current dev base; author rebase required',
                        actor      : 'concurrent-board-sweep'
                    });
                    statusByHead.set('pr-head', 'failure');
                }
            }
        });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.failures).toEqual([]);
        expect(runtime.statusCalls.map(call => call.state)).toEqual([
            'failure',
            'success',
            'failure'
        ]);
        expect(runtime.statusByHead.get('pr-head')).toBe('failure');
    });
});
