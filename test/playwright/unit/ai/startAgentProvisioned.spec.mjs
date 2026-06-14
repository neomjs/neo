import {test, expect}          from '@playwright/test';
import {startAgentProvisioned} from '../../../../ai/services/fleet/startAgentProvisioned.mjs';

// Pure composer — imported directly with injected stubs (no fs / git / Neo runtime), so the suite has
// no host-runtime side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec /
// ensureAgentRepo.spec. The `ensureRepo` + `cloneRepo` seams stand in for the real provisioning chain;
// the `lifecycleService` stub records every `start` call so the cwd-threading contract is assertable.

/** A recording FleetLifecycleService stub: tracks start() calls + answers isRunning/status/getRegistry. */
function makeLifecycle({agents = {}, running = {}} = {}) {
    const calls = {start: [], status: []};
    return {
        calls,
        isRunning  : id => !!running[id],
        status     : id => { calls.status.push(id); return {id, running: !!running[id], state: running[id] ? 'running' : 'stopped'}; },
        getRegistry: () => ({getAgent: id => agents[id] || null}),
        start      : (id, opts) => { calls.start.push({id, opts}); return {id, running: true, state: 'running', cwd: opts?.cwd}; }
    };
}

/** A recording ensureAgentRepo stub: records its args, returns a fixed repoPath (no fs / git). */
function makeEnsureRepo(repoPath = '/managed/agent/repo') {
    const calls = [];
    const fn    = async args => { calls.push(args); return {repoPath, state: 'absent', action: 'cloned', cloned: true}; };
    fn.calls    = calls;
    return fn;
}

const REPO = {cloneUrl: 'https://github.com/neomjs/neo.git', repoSlug: 'neomjs/neo'};

function repoAgent(id = 'a') {
    return {[id]: {id, githubUsername: id, harnessType: 'codex', metadata: {launch: {command: 'h'}, repo: REPO}}};
}

test.describe('startAgentProvisioned (Fleet Manager spawn-time repo provisioning)', () => {
    test('provisions the repo then starts the harness with cwd pinned to the checkout', async () => {
        const lifecycle  = makeLifecycle({agents: repoAgent('a')}),
              ensureRepo = makeEnsureRepo('/managed/a/neomjs-neo'),
              cloneRepo  = () => {},
              status     = await startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', cloneRepo, ensureRepo});

        // provisioning fed the agent's metadata.repo coordinates + the managed root + the clone seam
        expect(ensureRepo.calls).toHaveLength(1);
        expect(ensureRepo.calls[0]).toMatchObject({managedRoot: '/managed', agentId: 'a', repoSlug: 'neomjs/neo', cloneUrl: REPO.cloneUrl, cloneRepo});
        // the harness was started with cwd === the provisioned repoPath
        expect(lifecycle.calls.start).toHaveLength(1);
        expect(lifecycle.calls.start[0]).toEqual({id: 'a', opts: {cwd: '/managed/a/neomjs-neo'}});
        expect(status.state).toBe('running');
        expect(status.cwd).toBe('/managed/a/neomjs-neo');
    });

    test('an agent with no metadata.repo starts in the inherited cwd (backward-compatible)', async () => {
        const lifecycle  = makeLifecycle({agents: {a: {id: 'a', metadata: {launch: {command: 'h'}}}}}),
              ensureRepo = makeEnsureRepo();

        await startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', ensureRepo});

        // nothing to provision; start called with NO opts (no cwd)
        expect(ensureRepo.calls).toHaveLength(0);
        expect(lifecycle.calls.start).toHaveLength(1);
        expect(lifecycle.calls.start[0].id).toBe('a');
        expect(lifecycle.calls.start[0].opts).toBeUndefined();
    });

    test('a provisioning failure propagates and the harness is NEVER spawned (fail-closed)', async () => {
        const lifecycle = makeLifecycle({agents: repoAgent('a')}),
              boom      = async () => { throw new Error('conflict: foreign occupant'); };

        await expect(startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', ensureRepo: boom}))
            .rejects.toThrow('conflict: foreign occupant');

        expect(lifecycle.calls.start).toHaveLength(0);
    });

    test('an already-running agent short-circuits to status without provisioning or re-spawning', async () => {
        const lifecycle  = makeLifecycle({agents: repoAgent('a'), running: {a: true}}),
              ensureRepo = makeEnsureRepo(),
              status     = await startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', ensureRepo});

        expect(status.running).toBe(true);
        expect(ensureRepo.calls).toHaveLength(0);
        expect(lifecycle.calls.start).toHaveLength(0);
    });

    test('missing lifecycleService / agentId throw clear errors', async () => {
        await expect(startAgentProvisioned({agentId: 'a'})).rejects.toThrow(/lifecycleService/);
        await expect(startAgentProvisioned({lifecycleService: makeLifecycle()})).rejects.toThrow(/agentId/);
    });

    test('a repo-bearing agent with no managedRoot throws and never provisions or starts', async () => {
        const lifecycle  = makeLifecycle({agents: repoAgent('a')}),
              ensureRepo = makeEnsureRepo();

        await expect(startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', ensureRepo}))
            .rejects.toThrow(/managedRoot/);

        expect(ensureRepo.calls).toHaveLength(0);
        expect(lifecycle.calls.start).toHaveLength(0);
    });

    test('an unknown agent throws', async () => {
        const lifecycle = makeLifecycle({agents: {}});

        await expect(startAgentProvisioned({lifecycleService: lifecycle, agentId: 'ghost', managedRoot: '/managed'}))
            .rejects.toThrow(/unknown agent/);
    });
});
