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
    await new AsyncFunction('github', 'context', 'core', script)(
        runtime.github,
        runtime.context,
        runtime.core
    );
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
            run_unit       : 'true'
        });
        expect(Object.fromEntries(push.outputs)).toMatchObject({
            run_components : 'true',
            run_integration: 'true',
            run_unit       : 'true'
        });
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
