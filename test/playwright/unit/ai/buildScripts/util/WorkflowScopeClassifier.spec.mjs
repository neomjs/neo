import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

const __dirname     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot      = path.resolve(__dirname, '../../../../../..'),
      workflowsDir  = path.join(repoRoot, '.github/workflows'),
      AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

const scopeScript = () =>
    readWorkflow('test.yml').jobs.changes.steps.find(step => step.id === 'scope').with.script;

// Runtime harness mirroring WorkflowConcurrency.spec.mjs: the scope step's inline script is
// evaluated with mocked `github` / `context` / `core`, here additionally serving package.json
// content at the base and head refs via repos.getContent — keyed by repo for fork PRs, where the
// head SHA exists only in the fork (a base-repo fetch of it correctly throws).
const createRuntime = ({
    files           = ['package.json'],
    basePkg         = {dependencies: {leftpad: '1.0.0'}, scripts: {'build:all': 'a'}},
    headPkg         = {dependencies: {leftpad: '1.0.0'}, scripts: {'build:all': 'a', 'ai:new-script': 'b'}},
    headPkgRaw      = null,
    baseSha         = 'base-sha',
    getContentError = null,
    forkOwner       = null,
    forkUnreadable  = false
} = {}) => {
    const outputs = new Map(),
          info    = [],
          calls   = {getContent: 0, listFiles: 0, pullsGet: 0, contentCalls: []},
          core    = {
              info     : value => info.push(value),
              notice   : () => {},
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
                          return { data: { head: { sha: 'head-sha' } } };
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

    return { calls, context, core, github, info, outputs };
};

const executeScript = async(script, runtime) => {
    await new AsyncFunction('github', 'context', 'core', script)(
        runtime.github,
        runtime.context,
        runtime.core
    );
};

const outputsOf = runtime => Object.fromEntries(runtime.outputs);

test.describe('Tests scope classifier — package.json change-kind split', () => {

    test('a scripts/metadata-only package.json edit skips the components + integration suites', async () => {
        // The surfacing incident's shape: one added npm script, no dependency-kind change.
        // The suites cannot be affected by a script entry, so spending a browser run is pure
        // false-positive surface (runner minutes + flake lottery), never signal.
        const runtime = createRuntime();

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(2); // base + head, exactly once each
        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'false',
            run_integration: 'false',
            run_parity     : 'false',
            run_unit       : 'true' // non-docs paths still admit unit; the split does not touch it
        });
        expect(runtime.info.join(' ')).toContain('package.json');
    });

    test('dependency-kind package.json edits still run every relevant suite', async () => {
        const variants = [
            ['dependencies version bump', {dependencies: {leftpad: '1.0.1'}, scripts: {'build:all': 'a'}}],
            ['devDependencies addition',  {dependencies: {leftpad: '1.0.0'}, devDependencies: {chalk: '5.0.0'}, scripts: {'build:all': 'a'}}],
            // Resolution-affecting like a dependency edit; classified as dependency-kind by design.
            ['overrides change',            {dependencies: {leftpad: '1.0.0'}, overrides: {leftpad: '1.0.1'}, scripts: {'build:all': 'a'}}]
        ];

        for (const [label, headPkg] of variants) {
            const runtime = createRuntime({ headPkg });

            await executeScript(scopeScript(), runtime);

            expect(outputsOf(runtime), label).toMatchObject({
                run_components : 'true',
                run_integration: 'true',
                run_parity     : 'true' // parity inherits the integration boundary — deps shift the booted stack too
            });
        }
    });

    test('a package-lock.json-only change keeps running the suites untouched by the split', async () => {
        const runtime = createRuntime({ files: ['package-lock.json'] });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(0); // the lock atom needs no content read
        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',
            run_integration: 'true'
        });
    });

    test('an undeterminable package.json diff fails TOWARD running (fetch failure)', async () => {
        // The completeness rule outranks the optimization: a skipped suite is a false negative
        // that ships regressions; a wasted run costs minutes. This test fails if the fallback
        // is ever flipped to skip.
        const runtime = createRuntime({ getContentError: 'getContent unavailable' });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',
            run_integration: 'true'
        });
    });

    test('an undeterminable package.json diff fails TOWARD running (unparseable content)', async () => {
        const runtime = createRuntime({ headPkgRaw: 'not-json{' });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',
            run_integration: 'true'
        });
    });

    test('an undeterminable package.json diff fails TOWARD running (missing base ref)', async () => {
        const runtime = createRuntime({ baseSha: '0000000000000000000000000000000000000000' });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',
            run_integration: 'true'
        });
    });

    test('PRs without package.json pay zero extra API calls and see unchanged behavior', async () => {
        const runtime = createRuntime({ files: ['src/Neo.mjs', 'learn/guides/README.md'] });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(0);
        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',  // src/ still trips components via its own whitelist entry
            run_integration: 'true',
            run_parity     : 'true',
            run_unit       : 'true'
        });
    });

    test('a fork PR with a metadata-only package.json edit skips the suites — head content resolves from the fork', async () => {
        // Fork heads exist only in the fork repo: the head-content read must follow
        // `pull_request.head.repo`, or every fork PR fails open into full suites forever
        // (the mock throws for a base-repo fetch of the fork SHA, exactly like the API).
        const runtime = createRuntime({ forkOwner: 'contributor' });

        await executeScript(scopeScript(), runtime);

        expect(runtime.calls.getContent).toBe(2);
        expect(runtime.calls.contentCalls).toEqual(['neomjs/neo@base-sha', 'contributor/neo@head-sha']);
        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'false',
            run_integration: 'false',
            run_parity     : 'false',
            run_unit       : 'true'
        });
        expect(runtime.info.join(' ')).toContain('contributor/neo'); // the resolved head repo stays legible in the log
    });

    test('a fork PR whose head repo is unreadable fails TOWARD running (deleted or private fork)', async () => {
        // Same completeness rule as the same-repo fallbacks above: a skipped suite is a false
        // negative; a wasted run costs minutes. Deleted forks also arrive as head.repo === null,
        // which takes the same-repo path and fails open on the unknown-SHA fetch identically.
        const runtime = createRuntime({ forkOwner: 'contributor', forkUnreadable: true });

        await executeScript(scopeScript(), runtime);

        expect(outputsOf(runtime)).toMatchObject({
            run_components : 'true',
            run_integration: 'true'
        });
    });
});
