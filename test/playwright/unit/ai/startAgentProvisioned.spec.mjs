import {test, expect}          from '@playwright/test';
import {startAgentProvisioned} from '../../../../ai/services/fleet/startAgentProvisioned.mjs';

// Pure composer — imported directly with injected stubs (no fs / git / Neo runtime), so the suite has
// no host-runtime side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec /
// ensureAgentRepo.spec. The `ensureRepo` + `cloneRepo` seams stand in for the real provisioning chain;
// the `lifecycleService` stub records every `start` call so the cwd-threading contract is assertable.

/** A recording FleetLifecycleService stub: tracks start() calls + answers isRunning/status/getRegistry. */
function makeLifecycle({agents = {}, definitions = agents, running = {}, events} = {}) {
    const calls = {start: [], status: []};
    return {
        calls,
        isRunning  : id => !!running[id],
        status     : id => { calls.status.push(id); return {id, running: !!running[id], state: running[id] ? 'running' : 'stopped'}; },
        getRegistry: () => ({
            getAgent     : id => agents[id] || null,
            getDefinition: id => definitions[id] || null
        }),
        getInstanceRoot: () => '/instances',
        start          : (id, opts) => { events?.push('start'); calls.start.push({id, opts}); return {id, running: true, state: 'running', cwd: opts?.cwd}; }
    };
}

/** A recording ensureAgentRepo stub: records its args, returns a fixed repoPath (no fs / git). */
function makeEnsureRepo(repoPath = '/managed/agent/repo', events) {
    const calls = [];
    const fn    = async args => { events?.push('ensure'); calls.push(args); return {repoPath, state: 'absent', action: 'cloned', cloned: true}; };
    fn.calls    = calls;
    return fn;
}

/** Recording post-provisioning workspace/home preparation seam. */
function makePrepareWorkspace(events) {
    const calls = [];
    const fn    = async args => { events?.push('prepare'); calls.push(args); return {repoPath: args.repoPath}; };
    fn.calls    = calls;
    return fn;
}

const REPO = {cloneUrl: 'https://github.com/neomjs/neo.git', repoSlug: 'neomjs/neo'};

function repoAgent(id = 'a') {
    return {[id]: {id, githubUsername: id, harnessType: 'codex', metadata: {repo: REPO}}};
}

test.describe('startAgentProvisioned (Fleet Manager spawn-time repo provisioning)', () => {
    test('provisions, prepares, then starts with one canonical checkout path', async () => {
        const events           = [],
              lifecycle        = makeLifecycle({agents: repoAgent('a'), events}),
              ensureRepo       = makeEnsureRepo('/managed/a/neomjs-neo', events),
              prepareWorkspace = makePrepareWorkspace(events),
              cloneRepo        = () => {},
              status           = await startAgentProvisioned({
                  lifecycleService: lifecycle,
                  agentId         : 'a',
                  managedRoot     : '/managed',
                  cloneRepo,
                  ensureRepo,
                  prepareWorkspace,
                  mainCheckout    : '/installed/neo',
                  nodePath        : '/usr/bin/node'
              });

        // provisioning fed the agent's metadata.repo coordinates + the managed root + the clone seam
        expect(ensureRepo.calls).toHaveLength(1);
        expect(ensureRepo.calls[0]).toMatchObject({managedRoot: '/managed', agentId: 'a', repoSlug: 'neomjs/neo', cloneUrl: REPO.cloneUrl, cloneRepo});
        expect(prepareWorkspace.calls).toHaveLength(1);
        expect(prepareWorkspace.calls[0]).toMatchObject({
            agent       : repoAgent('a').a,
            repoPath    : '/managed/a/neomjs-neo',
            instanceRoot: '/instances',
            mainCheckout: '/installed/neo',
            nodePath    : '/usr/bin/node'
        });
        expect(events).toEqual(['ensure', 'prepare', 'start']);
        // The harness starts with cwd === provisioned repoPath === prepared repoPath.
        expect(lifecycle.calls.start).toHaveLength(1);
        expect(lifecycle.calls.start[0]).toEqual({id: 'a', opts: {cwd: '/managed/a/neomjs-neo'}});
        expect(status.state).toBe('running');
        expect(status.cwd).toBe('/managed/a/neomjs-neo');
    });

    test('an agent with no metadata.repo starts in the inherited cwd (backward-compatible)', async () => {
        const lifecycle        = makeLifecycle({agents: {a: {id: 'a', metadata: {launch: {command: 'h'}}}}}),
              ensureRepo       = makeEnsureRepo(),
              prepareWorkspace = makePrepareWorkspace();

        await startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', ensureRepo, prepareWorkspace});

        // nothing to provision; start called with NO opts (no cwd)
        expect(ensureRepo.calls).toHaveLength(0);
        expect(prepareWorkspace.calls).toHaveLength(0);
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

    test('a preparation rejection propagates and start is NEVER called (fail-closed)', async () => {
        const lifecycle        = makeLifecycle({agents: repoAgent('a')}),
              prepareWorkspace = async () => { throw new Error('DIVERGENT: owned MCP keys'); };

        await expect(startAgentProvisioned({
            lifecycleService: lifecycle,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo      : makeEnsureRepo('/managed/a/neomjs-neo'),
            prepareWorkspace
        })).rejects.toThrow('DIVERGENT: owned MCP keys');

        expect(lifecycle.calls.start).toHaveLength(0);
    });

    test('a repo-bearing raw launch override refuses before clone, prepare, or start', async () => {
        const
            publicAgent = repoAgent('a'),
            rawAgent    = structuredClone(publicAgent);

        rawAgent.a.metadata.launch = {command: '/custom/harness'};

        const
            lifecycle        = makeLifecycle({agents: publicAgent, definitions: rawAgent}),
            ensureRepo       = makeEnsureRepo(),
            prepareWorkspace = makePrepareWorkspace();

        await expect(startAgentProvisioned({
            lifecycleService: lifecycle,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo,
            prepareWorkspace
        })).rejects.toThrow(/raw metadata\.launch override/);

        expect(ensureRepo.calls).toHaveLength(0);
        expect(prepareWorkspace.calls).toHaveLength(0);
        expect(lifecycle.calls.start).toHaveLength(0);
    });

    test('an already-running agent short-circuits to status without provisioning or re-spawning', async () => {
        const lifecycle        = makeLifecycle({agents: repoAgent('a'), running: {a: true}}),
              ensureRepo       = makeEnsureRepo(),
              prepareWorkspace = makePrepareWorkspace(),
              status           = await startAgentProvisioned({lifecycleService: lifecycle, agentId: 'a', managedRoot: '/managed', ensureRepo, prepareWorkspace});

        expect(status.running).toBe(true);
        expect(ensureRepo.calls).toHaveLength(0);
        expect(prepareWorkspace.calls).toHaveLength(0);
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

    test('a preparation result cannot substitute a second checkout path', async () => {
        const lifecycle = makeLifecycle({agents: repoAgent('a')});

        await expect(startAgentProvisioned({
            lifecycleService: lifecycle,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo      : makeEnsureRepo('/managed/a/neomjs-neo'),
            prepareWorkspace: async () => ({repoPath: '/other/repo'})
        })).rejects.toThrow(/canonical provisioned repoPath/);

        expect(lifecycle.calls.start).toHaveLength(0);
    });
});
