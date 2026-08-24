import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

const __dirname              = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot               = path.resolve(__dirname, '../../../../../..'),
      workflowsDir           = path.join(repoRoot, '.github/workflows'),
      rerunIsolationContract = "github.run_attempt == '1' && github.ref || github.run_id",
      AsyncFunction          = Object.getPrototypeOf(async function() {}).constructor;

const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

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
                      head  : { sha: eventHead },
                      number: 15588
                  }
              },
              repo: { owner: 'neomjs', repo: 'neo' }
          };

    return { calls, context, core, github, outputs, summary };
};

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
const mergeabilityPull = (mergeable, {head = 'pr-head', base = 'dev-head'} = {}) => ({
    number: 42,
    mergeable,
    head  : {sha: head},
    base  : {sha: base}
});

/**
 * @summary Creates mocked GitHub/core surfaces for discovery and exact-head status publication.
 * @param {Object} [options]
 * @param {Object[]|Error} [options.targets] Open PR rows returned by discovery, or a source failure.
 * @param {(Object|Error)[]} [options.reads] Ordered live PR reads; the final value repeats on exhaustion.
 * @param {String} [options.eventName] Workflow event name.
 * @param {Number} [options.eventPrNumber] Pull-request number in a `pull_request_target` payload.
 * @param {String} [options.eventAction] Pull-request activity.
 * @param {Boolean} [options.eventMerged] Whether a closed pull request merged.
 * @param {Object} [options.publishedStates] Existing named status by head SHA.
 * @returns {Object}
 */
const createReviewAdmissionRuntime = ({
    targets       = [],
    reads         = [mergeabilityPull(true)],
    eventName     = 'push',
    eventPrNumber = 42,
    eventAction   = 'synchronize',
    eventMerged   = false,
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
    let   readIndex = 0;
    const runtime   = {
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

    return runtime;
};

/**
 * @summary Executes the workflow publisher with zero-cost polling while restoring process env.
 * @param {String} script Extracted actions/github-script source.
 * @param {Object} runtime Mock runtime.
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

            if (!workflow.on?.pull_request || workflow.concurrency?.['cancel-in-progress'] !== true) {
                continue;
            }

            if (typeof group === 'string' && group.includes(rerunIsolationContract)) {
                protectedWorkflows.push(name);
            } else {
                vulnerableWorkflows.push(name);
            }
        }

        expect(protectedWorkflows).toContain('test.yml');
        expect(vulnerableWorkflows).toEqual([]);
    });

    test('the Tests classifier admits only the live pull-request head', async () => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script,
              runtime  = createRuntime();

        await executeScript(script, runtime);

        expect(runtime.calls).toEqual({ compare: 0, listFiles: 0, pullsGet: 1 });
        expect(Object.fromEntries(runtime.outputs)).toEqual({
            run_integration: 'false',
            run_unit       : 'false',
            run_components : 'false',
            run_parity     : 'false',
            skip_reason    : 'stale workflow head stale-head; live PR head is current-head'
        });
        expect(runtime.summary.join(' ')).toContain('Stale workflow attempt');
        expect(runtime.summary.join(' ')).toContain('stale-head');
        expect(runtime.summary.join(' ')).toContain('current-head');
    });

    test('the Tests classifier preserves current-head and push admission', async () => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script,
              current  = createRuntime({ eventHead: 'current-head' }),
              push     = createRuntime({ eventName: 'push' });

        await executeScript(script, current);
        await executeScript(script, push);

        expect(current.calls).toEqual({ compare: 0, listFiles: 1, pullsGet: 1 });
        expect(push.calls).toEqual({ compare: 1, listFiles: 0, pullsGet: 0 });
        expect(Object.fromEntries(current.outputs)).toMatchObject({
            run_components : 'true',
            run_integration: 'true',
            run_unit       : 'true',
            run_parity     : 'true'
        });
        expect(Object.fromEntries(push.outputs)).toMatchObject({
            run_components : 'true',
            run_integration: 'true',
            run_unit       : 'true',
            run_parity     : 'true'
        });
    });

    test('the Tests classifier routes the parity surface to its lane (and only for those paths)', async () => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script,
              parity   = createRuntime({ eventHead: 'current-head', files: ['ai/deploy/docker-compose.dev.yml'] }),
              docsOnly = createRuntime({ eventHead: 'current-head', files: ['learn/guides/README.md'] });

        await executeScript(script, parity);
        await executeScript(script, docsOnly);

        // The parity lane runs BESIDE the suites its surface already trips (`ai/` also
        // admits integration; non-docs admits unit) — it is an additional witness, never
        // a replacement.
        expect(Object.fromEntries(parity.outputs)).toMatchObject({
            run_integration: 'true',
            run_unit       : 'true',
            run_parity     : 'true'
        });

        // Non-parity PRs stay unaffected: no witness, no runner spent.
        expect(Object.fromEntries(docsOnly.outputs)).toMatchObject({
            run_parity: 'false'
        });
    });

    test('the Tests classifier cannot skip the lane for the booted stack\'s runtime dependencies', async () => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script;

        // The lane boots MC, KB, and the orchestrator. A change to any direct runtime
        // dependency of those processes must trip the witness — a filter that admits
        // `ai/` but skips the engine hemisphere the servers extend (src/core/Base,
        // src/state/Provider) or the shared integration fixture would be a completeness
        // claim the dependency graph falsifies. The lane inherits the integration
        // suite's boundary, so these all admit it.
        const runtimeDependencies = [
            'ai/services/memory-core/MemoryService.mjs',
            'ai/services/knowledge-base/HealthService.mjs',
            'ai/config.mjs',
            'ai/ConfigProvider.mjs',
            'ai/planeConfig.mjs',
            'src/Neo.mjs',
            'src/core/Base.mjs',
            'src/state/Provider.mjs',
            'test/playwright/integration/fixtures/mcpClient.mjs'
        ];

        for (const file of runtimeDependencies) {
            const runtime = createRuntime({ eventHead: 'current-head', files: [file] });

            await executeScript(script, runtime);

            expect(Object.fromEntries(runtime.outputs), `${file} must trip the parity lane — the booted stack imports it`).toMatchObject({
                run_parity: 'true'
            });
        }
    });

    test('failed-job reruns recheck the live head before every expensive step', async () => {
        const workflow   = readWorkflow('test.yml'),
              steps      = workflow.jobs.test.steps,
              headIndex  = steps.findIndex(step => step.id === 'head'),
              headScript = steps[headIndex].with.script,
              runtime    = createRuntime(),
              expensive  = [
                  'Checkout repository',
                  'Setup Node.js',
                  'Skip Knowledge Base download in prepare lifecycle',
                  'Install dependencies',
                  'Bundle parse5',
                  'Install Playwright Chromium',
                  'Run ${{ matrix.suite }} tests',
                  'Upload test artifacts on failure'
              ];

        await executeScript(headScript, runtime);

        expect(headIndex).toBeLessThan(steps.findIndex(step => step.name === 'Checkout repository'));
        expect(runtime.calls.pullsGet).toBe(1);
        expect(Object.fromEntries(runtime.outputs)).toEqual({
            current    : 'false',
            skip_reason: 'stale workflow head stale-head; live PR head is current-head'
        });

        for (const name of expensive) {
            expect(steps.find(step => step.name === name).if).toContain(
                "steps.head.outputs.current == 'true'"
            );
        }

        expect(steps.find(step => step.name === 'Skip ${{ matrix.suite }} tests').if).toContain(
            "steps.head.outputs.current != 'true'"
        );
    });

    test('the failed-job gate preserves current-head and push retries', async () => {
        const workflow   = readWorkflow('test.yml'),
              steps      = workflow.jobs.test.steps,
              headScript = steps.find(step => step.id === 'head').with.script,
              current    = createRuntime({ eventHead: 'current-head' }),
              push       = createRuntime({ eventName: 'push' });

        await executeScript(headScript, current);
        await executeScript(headScript, push);

        expect(current.calls.pullsGet).toBe(1);
        expect(push.calls.pullsGet).toBe(0);
        expect(Object.fromEntries(current.outputs)).toEqual({ current: 'true' });
        expect(Object.fromEntries(push.outputs)).toEqual({ current: 'true' });
    });

    test('a live-head lookup failure fails closed before path classification', async () => {
        const workflow = readWorkflow('test.yml'),
              script   = workflow.jobs.changes.steps.find(step => step.id === 'scope').with.script,
              runtime  = createRuntime();

        runtime.github.rest.pulls.get = async() => {
            throw new Error('live head unavailable');
        };

        await expect(executeScript(script, runtime)).rejects.toThrow('live head unavailable');
        expect(runtime.calls.listFiles).toBe(0);
        expect(runtime.outputs.size).toBe(0);
    });
});

test.describe('review-admission mergeability controller (#17692)', () => {
    const workflowName = 'review-admission-mergeability.yml';

    test('uses conflict-capable trusted triggers, least permissions, and no checkout', () => {
        const workflow = readWorkflow(workflowName),
              dataSync = readWorkflow('data-sync-pipeline.yml'),
              steps    = Object.values(workflow.jobs).flatMap(job => job.steps || []);

        expect(workflow.on.pull_request_target).toMatchObject({
            branches: ['dev'],
            types   : ['opened', 'reopened', 'synchronize', 'ready_for_review', 'closed']
        });
        expect(workflow.on.push).toEqual({branches: ['dev']});
        expect(workflow.on.workflow_run).toEqual({
            workflows: ['Data Sync Pipeline'],
            types    : ['completed']
        });
        expect(dataSync.name).toBe(workflow.on.workflow_run.workflows[0]);
        expect(workflow.on).toHaveProperty('workflow_dispatch');
        expect(workflow.permissions).toEqual({
            'pull-requests': 'read',
            statuses       : 'write'
        });
        expect(steps.some(step => String(step.uses || '').startsWith('actions/checkout@'))).toBe(false);
        expect(workflow.jobs.publish.concurrency).toEqual({
            group               : 'review-admission-mergeability-${{ matrix.pr }}',
            'cancel-in-progress': false
        });
        expect(workflow.jobs.discover.steps.find(step => step.id === 'targets').env)
            .toEqual({OVERFLOW_WRITE_DELAY_MS: '1000'});
    });

    test('pull_request_target evaluates only its event PR; board triggers enumerate', async () => {
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

        expect(Object.fromEntries(prEvent.outputs)).toEqual({prs: '[17692]'});
        expect(prEvent.listCalls).toEqual([]);
        expect(Object.fromEntries(push.outputs)).toEqual({prs: '[1,2]'});
        expect(push.listCalls).toHaveLength(1);
        expect(Object.fromEntries(sync.outputs)).toEqual({prs: '[3]'});
        expect(sync.listCalls).toHaveLength(1);
        expect(Object.fromEntries(merged.outputs)).toEqual({prs: '[4]'});
        expect(merged.listCalls).toHaveLength(1);
        expect(Object.fromEntries(closed.outputs)).toEqual({prs: '[]'});
        expect(closed.listCalls).toEqual([]);
    });

    test('discovers the complete open dev-target set and rejects matrix overflow', async () => {
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
        expect(Object.fromEntries(overflow.outputs)).toEqual({prs: '[]'});
        expect(overflow.failures.join(' ')).toContain('Refusing partial publication');
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

    test('board discovery failure is explicit and emits no partial matrix', async () => {
        const workflow    = readWorkflow(workflowName),
              script      = workflow.jobs.discover.steps.find(step => step.id === 'targets').with.script,
              unavailable = createReviewAdmissionRuntime({targets: new Error('pull list unavailable')});

        await executeScript(script, unavailable);

        expect(Object.fromEntries(unavailable.outputs)).toEqual({prs: '[]'});
        expect(unavailable.failures).toEqual(['Open dev PR discovery failed: pull list unavailable']);
        expect(unavailable.statusCalls).toEqual([]);
    });

    test('conflict publishes failure on the PR head, never the base', async () => {
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

        expect(runtime.statusCalls.map(call => call.state)).toEqual(['failure']);
        expect(runtime.statusCalls.every(call => call.sha === 'conflicting-head')).toBe(true);
        expect(runtime.statusCalls.every(call => call.sha !== 'moved-dev')).toBe(true);
        expect(runtime.statusCalls.every(call => call.context === 'review-admission/mergeability')).toBe(true);
        expect(runtime.failures).toEqual([]);
    });

    test('a later dev movement can turn the same formerly-green head red', async () => {
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

        expect(green.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'success']
        ]);
        expect(red.statusCalls.map(call => [call.sha, call.state])).toEqual([
            ['pr-head', 'failure']
        ]);
    });

    test('null exhaustion becomes error, never success', async () => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({reads: [mergeabilityPull(null)]});

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusCalls.map(call => call.state)).toEqual(['error']);
        expect(runtime.statusCalls.some(call => call.state === 'success')).toBe(false);
        expect(runtime.failures.join(' ')).toContain('stayed null after 4 bounded polls');
    });

    test('head/base movement restarts and cannot publish an obsolete success', async () => {
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

    test('a source-read exception converts the known coordinate to error', async () => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({
                  reads: [mergeabilityPull(null), new Error('mergeability source unavailable')]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusCalls.map(call => call.state)).toEqual(['error']);
        expect(runtime.failures).toEqual(['mergeability source unavailable']);
    });

    test('an initial pull-read failure fabricates no head and names the controller failure', async () => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({reads: [new Error('initial pull unavailable')]});

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.statusReads).toEqual([]);
        expect(runtime.statusCalls).toEqual([]);
        expect(runtime.failures).toEqual(['initial pull unavailable']);
    });

    test('an unchanged terminal verdict performs the live read but appends no duplicate status', async () => {
        const script  = readWorkflow(workflowName).jobs.publish.steps[0].with.script,
              runtime = createReviewAdmissionRuntime({
                  publishedStates: {'pr-head': 'success'},
                  reads          : [mergeabilityPull(true)]
              });

        await executeReviewAdmissionPublisher(script, runtime);

        expect(runtime.pullReads.length).toBeGreaterThanOrEqual(3);
        expect(runtime.statusReads).toHaveLength(1);
        expect(runtime.statusCalls).toEqual([]);
    });
});
