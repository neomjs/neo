import {test, expect}          from '@playwright/test';
import {startAgentProvisioned} from '../../../../ai/services/fleet/startAgentProvisioned.mjs';

// Pure composer — imported directly with injected stubs (no fs / git / Neo runtime), so the suite has
// no host-runtime side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec /
// ensureAgentRepo.spec. The `ensureRepo` + `cloneRepo` seams stand in for the real provisioning chain;
// the `lifecycleService` stub records every `start` call so the cwd-threading contract is assertable.

/** A recording FleetLifecycleService stub: tracks start/capability/credential calls. */
function makeLifecycle({
    agents = {},
    definitions = agents,
    credentials = {},
    running = {},
    events,
    capabilityError = null,
    inspectionError = null
} = {}) {
    const calls = {capability: [], credential: [], inspection: [], start: [], status: []};
    return {
        calls,
        credentialEnvVar: 'GH_TOKEN',
        isRunning       : id => !!running[id],
        status          : id => { calls.status.push(id); return {id, running: !!running[id], state: running[id] ? 'running' : 'stopped'}; },
        getRegistry     : () => ({
            getAgent         : id => agents[id] || null,
            getDefinition    : id => definitions[id] || null,
            resolveCredential: id => {
                events?.push('credential');
                calls.credential.push(id);

                return Object.hasOwn(credentials, id) ? credentials[id] : null
            }
        }),
        getInstanceRoot          : () => '/instances',
        assertRemoteMcpCapability: async agent => {
            events?.push('capability');
            calls.capability.push(agent);

            if (capabilityError) throw capabilityError;

            return {
                harnessType     : agent.harnessType,
                binaryPath      : '/bin/harness',
                launchBinaryPath: '/bin/harness'
            }
        },
        inspectPreparedRemoteMcpAdapter: async args => {
            events?.push('inspect');
            calls.inspection.push(args);

            if (inspectionError) throw inspectionError;

            return {harnessType: args.agent.harnessType, inspected: true}
        },
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
    const fn    = async args => {
        events?.push('prepare');
        calls.push(args);

        return {
            repoPath    : args.repoPath,
            instanceHome: `/instances/${args.agent.id}`,
            mcpMatrix   : {
                'memory-core'    : true,
                'knowledge-base' : true,
                'neural-link'    : true,
                'github-workflow': false,
                'gitlab-workflow': false
            }
        }
    };
    fn.calls    = calls;
    return fn;
}

const REPO = {cloneUrl: 'https://github.com/neomjs/neo.git', repoSlug: 'neomjs/neo'};

function repoAgent(id = 'a') {
    return {[id]: {id, githubUsername: id, harnessType: 'codex', metadata: {repo: REPO}}};
}

function remoteRepoAgent(id = 'a') {
    const agents = repoAgent(id);

    agents[id].mcpTransport = {mode: 'remote-http', tenantId: 'tenant-a'};

    return agents
}

function makeTenantService({
    events,
    resolved   = true,
    readiness  = true,
    credential = 'glpat_exact_plane_credential'
} = {}) {
    const
        resources = {
            'memory-core'   : {url: 'https://tenant.example.com/mc/mcp'},
            'knowledge-base': {url: 'https://tenant.example.com/kb/mcp'}
        },
        calls = {credential: [], resolve: [], probe: []};

    return {
        calls,
        resolveMcpResources(tenantId) {
            events?.push('resolve-tenant');
            calls.resolve.push(tenantId);

            return resolved ? {tenantId, endpoint: 'https://tenant.example.com', resources} : null
        },
        resolveMcpCredential(tenantId) {
            events?.push('plane-credential');
            calls.credential.push(tenantId);

            return credential
        },
        async probeSeatCredential(args) {
            events?.push('probe');
            calls.probe.push(args);

            return readiness === true
                ? {
                    ok       : true,
                    status   : 200,
                    resources: {
                        'memory-core'   : {
                            ok: true, status: 200, identity: args.expectedIdentity
                        },
                        'knowledge-base': {ok: true, status: 200}
                    }
                }
                : readiness
        }
    }
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

    test('a remote seat keeps repository and plane credentials distinct through readiness and spawn', async () => {
        const
            events           = [],
            repositoryPat    = 'ghp_exact_repository_pat',
            planePat         = 'glpat_exact_plane_pat',
            agents           = remoteRepoAgent('a'),
            lifecycle        = makeLifecycle({agents, credentials: {a: repositoryPat}, events}),
            tenantService    = makeTenantService({events, credential: planePat}),
            ensureRepo       = makeEnsureRepo('/managed/a/neomjs-neo', events),
            prepareWorkspace = makePrepareWorkspace(events);

        await startAgentProvisioned({
            lifecycleService: lifecycle,
            tenantService,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo,
            prepareWorkspace
        });

        expect(events).toEqual([
            'credential',
            'resolve-tenant',
            'plane-credential',
            'capability',
            'probe',
            'ensure',
            'prepare',
            'inspect',
            'start'
        ]);
        expect(lifecycle.calls.credential).toEqual(['a']);
        expect(lifecycle.calls.capability).toEqual([agents.a]);
        expect(tenantService.calls.resolve).toEqual(['tenant-a']);
        expect(tenantService.calls.credential).toEqual(['tenant-a']);
        expect(tenantService.calls.probe).toEqual([{
            tenantId        : 'tenant-a',
            credential      : planePat,
            expectedIdentity: '@a'
        }]);
        expect(prepareWorkspace.calls[0].mcpTransport).toEqual({
            mode            : 'remote-http',
            credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN',
            resources       : {
                'memory-core'   : {url: 'https://tenant.example.com/mc/mcp'},
                'knowledge-base': {url: 'https://tenant.example.com/kb/mcp'}
            }
        });
        expect(lifecycle.calls.inspection).toEqual([{
            agent       : agents.a,
            binaryPath  : '/bin/harness',
            repoPath    : '/managed/a/neomjs-neo',
            instanceHome: '/instances/a',
            mcpMatrix   : {
                'memory-core'    : true,
                'knowledge-base' : true,
                'neural-link'    : true,
                'github-workflow': false,
                'gitlab-workflow': false
            },
            mcpTransport: {
                mode     : 'remote-http',
                resources: {
                    'memory-core'   : {url: 'https://tenant.example.com/mc/mcp'},
                    'knowledge-base': {url: 'https://tenant.example.com/kb/mcp'}
                }
            }
        }]);
        expect(lifecycle.calls.start).toEqual([{
            id  : 'a',
            opts: {
                cwd                  : '/managed/a/neomjs-neo',
                resolvedCredential   : repositoryPat,
                resolvedMcpCredential: planePat,
                remoteMcpCapability  : {
                    harnessType     : 'codex',
                    binaryPath      : '/bin/harness',
                    launchBinaryPath: '/bin/harness'
                }
            }
        }])
    });

    test('a remote seat may use a public repository without substituting its plane bearer as GH_TOKEN', async () => {
        const
            agents           = remoteRepoAgent('a'),
            lifecycle        = makeLifecycle({agents, credentials: {}}),
            tenantService    = makeTenantService({credential: 'glpat_plane_only'}),
            ensureRepo       = makeEnsureRepo('/managed/a/neomjs-neo'),
            prepareWorkspace = makePrepareWorkspace();

        await startAgentProvisioned({
            lifecycleService: lifecycle,
            tenantService,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo,
            prepareWorkspace
        });

        expect(lifecycle.calls.credential).toEqual(['a']);
        expect(lifecycle.calls.start).toEqual([{
            id  : 'a',
            opts: {
                cwd                  : '/managed/a/neomjs-neo',
                resolvedCredential   : null,
                resolvedMcpCredential: 'glpat_plane_only',
                remoteMcpCapability  : {
                    harnessType     : 'codex',
                    binaryPath      : '/bin/harness',
                    launchBinaryPath: '/bin/harness'
                }
            }
        }])
    });

    test('a remote seat without a managed repo rejects before credential, capability, tenant, or filesystem work', async () => {
        const
            lifecycle        = makeLifecycle({
                agents: {
                    a: {
                        id          : 'a', harnessType: 'codex', metadata: {},
                        mcpTransport: {mode: 'remote-http', tenantId: 'tenant-a'}
                    }
                },
                credentials: {a: 'ghp_x'}
            }),
            tenantService    = makeTenantService(),
            ensureRepo       = makeEnsureRepo(),
            prepareWorkspace = makePrepareWorkspace();

        await expect(startAgentProvisioned({
            lifecycleService: lifecycle,
            tenantService,
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo,
            prepareWorkspace
        })).rejects.toThrow(/requires a managed repo/);

        expect(lifecycle.calls.credential).toEqual([]);
        expect(lifecycle.calls.capability).toEqual([]);
        expect(tenantService.calls.resolve).toEqual([]);
        expect(tenantService.calls.credential).toEqual([]);
        expect(tenantService.calls.probe).toEqual([]);
        expect(ensureRepo.calls).toEqual([]);
        expect(prepareWorkspace.calls).toEqual([]);
        expect(lifecycle.calls.start).toEqual([])
    });

    test('every remote admission failure leaves checkout, workspace, and spawn untouched', async () => {
        const scenarios = [{
            name       : 'unavailable tenant',
            credentials: {},
            tenant     : {resolved: false},
            error      : /tenant 'tenant-a' is unavailable/
        }, {
            name       : 'missing plane credential',
            credentials: {a: 'ghp_x'},
            tenant     : {credential: null},
            error      : /tenant 'tenant-a' has no plane credential/
        }, {
            name           : 'unsupported installed capability',
            credentials    : {a: 'ghp_x'},
            tenant         : {},
            capabilityError: new Error('missing remote grammar'),
            error          : /missing remote grammar/
        }, {
            name       : 'one plane not ready',
            credentials: {a: 'ghp_x'},
            tenant     : {
                readiness: {
                    ok       : false,
                    status   : 503,
                    resources: {
                        'memory-core'   : {ok: true, status: 200},
                        'knowledge-base': {ok: false, status: 503}
                    }
                }
            },
            error: /credential readiness failed/
        }];

        for (const scenario of scenarios) {
            const
                lifecycle        = makeLifecycle({
                    agents         : remoteRepoAgent('a'),
                    credentials    : scenario.credentials,
                    capabilityError: scenario.capabilityError
                }),
                tenantService    = makeTenantService(scenario.tenant),
                ensureRepo       = makeEnsureRepo(),
                prepareWorkspace = makePrepareWorkspace();

            await expect(startAgentProvisioned({
                lifecycleService: lifecycle,
                tenantService,
                agentId         : 'a',
                managedRoot     : '/managed',
                ensureRepo,
                prepareWorkspace
            }), scenario.name).rejects.toThrow(scenario.error);

            expect(ensureRepo.calls, scenario.name).toEqual([]);
            expect(prepareWorkspace.calls, scenario.name).toEqual([]);
            expect(lifecycle.calls.start, scenario.name).toEqual([])
        }
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

    test('an installed-adapter readback rejection propagates after preparation and before spawn', async () => {
        const
            events    = [],
            lifecycle = makeLifecycle({
                agents         : remoteRepoAgent('a'),
                events,
                inspectionError: new Error('installed adapter rejected generated projection')
            }),
            ensureRepo       = makeEnsureRepo('/managed/a/neomjs-neo', events),
            prepareWorkspace = makePrepareWorkspace(events);

        await expect(startAgentProvisioned({
            lifecycleService: lifecycle,
            tenantService   : makeTenantService({events}),
            agentId         : 'a',
            managedRoot     : '/managed',
            ensureRepo,
            prepareWorkspace
        })).rejects.toThrow(/installed adapter rejected generated projection/);

        expect(events).toEqual([
            'credential',
            'resolve-tenant',
            'plane-credential',
            'capability',
            'probe',
            'ensure',
            'prepare',
            'inspect'
        ]);
        expect(lifecycle.calls.start).toEqual([])
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
