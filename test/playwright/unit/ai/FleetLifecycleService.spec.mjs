import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'FleetLifecycleServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import {execFile, spawn} from 'child_process';
import {EventEmitter}    from 'events';
import fs                from 'fs';
import os                from 'os';
import path              from 'path';

import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import FleetLifecycleService from '../../../../ai/services/fleet/FleetLifecycleService.mjs';

let nextPid = 1000;

/**
 * A stub child process: an EventEmitter that dies (emits `exit`) on the first `kill()`, recording
 * the signals it received. No real process is ever launched.
 */
class FakeChild extends EventEmitter {
    constructor() {
        super();
        this.pid     = ++nextPid;
        this.signals = [];
        this.stderr  = new EventEmitter();
        this.stdout  = new EventEmitter();
    }

    kill(signal) {
        this.signals.push(signal);
        queueMicrotask(() => this.emit('exit', 0, signal));
        return true;
    }
}

/** A recording spawn stub (the supervisor test seam). */
function makeSpawnStub() {
    const calls = [];
    const fn    = (command, args, opts) => {
        const child = new FakeChild();
        calls.push({command, args, opts, child});
        return child;
    };
    fn.calls = calls;
    return fn;
}

/** A minimal registry stub so lifecycle specs never touch the real on-disk credential store. */
function makeRegistry(agents, creds) {
    return {
        getAgent         : id => agents[id] || null,
        // The spawn path reads the RAW definition (launch visible) — the public getAgent
        // projection redacts metadata.launch, so the service consumes this surface instead.
        getDefinition    : id => agents[id] || null,
        resolveCredential: id => (Object.hasOwn(creds, id) ? creds[id] : null),
        // Stub the Bridge-token mint with a deterministic per-id token, so spawn-injection specs can
        // assert env carriage without touching the real registry's crypto store.
        mintBridgeToken  : id => ({token: `bridge_${id}_token`, expiresAt: Date.now() + 3_600_000})
    };
}

// A REAL path-shaped binary: the spawn stays stubbed, but the executable preflight stats the
// command for path-shaped AND bare forms, so the fixture must exist on disk.
const LAUNCH = {command: process.execPath, args: ['--serve']};

function agentDef(id, extra = {}) {
    return {id, githubUsername: id, harnessType: 'codex', metadata: {launch: LAUNCH}, ...extra};
}

/** Exact non-secret renderer input returned by prepareManagedAgentWorkspace for a tenant Codex seat. */
function tenantMcpPlan(resources, matrix) {
    return Object.entries(matrix).map(([key, enabled]) => {
        const remote = ['memory-core', 'knowledge-base'].includes(key);

        return {
            key,
            name              : `neo-mjs-${key}`,
            enabled,
            target            : remote ? 'tenant' : 'resident',
            transport         : remote ? 'streamable-http' : 'stdio',
            url               : remote ? resources[key].url : null,
            credentialEnvVar  : remote ? 'NEO_MCP_REMOTE_TOKEN' : null,
            command           : process.execPath,
            sourceRoot        : '/installed/neo',
            args              : [`/installed/neo/ai/mcp/server/${key}/mcp-server.mjs`],
            runtimeEnv        : ['NEO_AGENT_IDENTITY'],
            requiredRuntimeEnv: ['NEO_AGENT_IDENTITY'],
            secretEnv         : [],
            unsupportedReason : null
        }
    })
}

/** Reset the singleton + inject fresh test doubles. Returns the spawn stub. */
function install({agents = {}, creds = {}} = {}) {
    const spawnStub = makeSpawnStub();
    for (const record of FleetLifecycleService.processes.values()) {
        clearTimeout(record.openCodeBootstrapTimer);
    }
    FleetLifecycleService.processes.clear();
    FleetLifecycleService.spawnFn         = spawnStub;
    // Stub the version probe by default so no spec spawns a real auxiliary subprocess; the
    // env-boundary test injects its own recorder.
    FleetLifecycleService.execFileFn      = () => {};
    FleetLifecycleService.claudeDesktopBridgeCapabilityProbeFn = null;
    FleetLifecycleService.fetchFn         = null;
    FleetLifecycleService.openCodeHookExecFileFn = null;
    FleetLifecycleService.openCodeBootstrapTimeoutMs = 10000;
    FleetLifecycleService.registry        = makeRegistry(agents, creds);
    FleetLifecycleService.sigkillTimeoutMs = 50;
    // Reset the configurable env-key fields to their defaults so a collision test cannot bleed into
    // the next serial sibling (singleton-stateful service).
    FleetLifecycleService.credentialEnvVar          = 'GH_TOKEN';
    FleetLifecycleService.bridgeTokenEnvVar         = 'NEO_FLEET_BRIDGE_TOKEN';
    // Reset the curated-launch resolution fields too — fallback tests set them explicitly.
    FleetLifecycleService.instanceRoot       = null;
    FleetLifecycleService.harnessBinaryPaths = null;
    FleetLifecycleService.codexDesktopCapabilityProbeFn = null;
    FleetLifecycleService.codexDesktopCleanupFn         = null;
    return spawnStub;
}

// Singleton-stateful service → run serially in one worker so per-test install() resets are not
// raced by Playwright's parallel worker reuse.
test.describe.configure({mode: 'serial'});

test.describe('Neo.ai.services.fleet.FleetLifecycleService', () => {
    test('start spawns the launch command and reports running', () => {
        const spawn  = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}}),
              status = FleetLifecycleService.start('a');

        expect(spawn.calls).toHaveLength(1);
        expect(spawn.calls[0].command).toBe(process.execPath);
        expect(spawn.calls[0].args).toEqual(['--serve']);
        expect(status.running).toBe(true);
        expect(status.state).toBe('running');
        expect(status.pid).toBeGreaterThan(0);
    });

    test('start passes opts.cwd through to the spawn options (the harness runs in its provisioned repo)', () => {
        const spawn = install({agents: {a: agentDef('a')}});
        FleetLifecycleService.start('a', {cwd: '/managed/a/neomjs-neo'});

        expect(spawn.calls[0].opts.cwd).toBe('/managed/a/neomjs-neo');
    });

    test('start without opts.cwd spawns with no cwd (inherited — unchanged legacy behavior)', () => {
        const spawn = install({agents: {a: agentDef('a')}});
        FleetLifecycleService.start('a');

        expect(spawn.calls[0].opts.cwd).toBeUndefined();
    });

    test('SECURITY: PAT injected into the child env copy only — never argv / record / live parent env', () => {
        const pat    = 'ghp_SECRET_injected_value',
              spawn  = install({agents: {a: agentDef('a')}, creds: {a: pat}}),
              status = FleetLifecycleService.start('a'),
              call   = spawn.calls[0];

        // injected under the configured var, on a COPY of process.env (not the live object)
        expect(call.opts.env.GH_TOKEN).toBe(pat);
        expect(call.opts.env.NEO_MCP_REMOTE_TOKEN).toBeUndefined();
        expect(call.opts.env).not.toBe(process.env);
        // never in argv or the command
        expect(JSON.stringify(call.args)).not.toContain(pat);
        expect(call.command).not.toContain(pat);
        // never in the status snapshot
        expect(JSON.stringify(status)).not.toContain(pat);
        // the live parent env was not mutated to carry the secret
        expect(process.env.GH_TOKEN).not.toBe(pat);
    });

    test('start mints + injects a Bridge token + forced NL projection into the child env', () => {
        const pat   = 'ghp_dual_class';
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: pat}});
        FleetLifecycleService.start('a');
        const env = spawn.calls[0].opts.env;

        // Bridge token under its OWN var — a credential class distinct from the PAT
        expect(env.NEO_FLEET_BRIDGE_TOKEN).toBe('bridge_a_token');
        expect(env.NEO_FLEET_BRIDGE_TOKEN).not.toBe(env.GH_TOKEN);
        expect(env.NEO_FLEET_BRIDGE_TOKEN).not.toBe(env.NEO_MCP_REMOTE_TOKEN);
        // forced NL projection: FM-spawned ⇒ embedded ⇒ harness-embedded, by construction
        expect(env.NEO_NL_TOOL_PROJECTION_MODE).toBe('harness-embedded');
        // the PAT injection is unaffected
        expect(env.GH_TOKEN).toBe(pat);
        // injected on a COPY of process.env; parent env never mutated to carry the bridge token
        expect(env).not.toBe(process.env);
        expect(process.env.NEO_FLEET_BRIDGE_TOKEN).not.toBe('bridge_a_token');
    });

    test('SECURITY: the injected Bridge token never enters the process record / status', () => {
        const spawn  = install({agents: {a: agentDef('a')}}),
              status = FleetLifecycleService.start('a'),
              token  = spawn.calls[0].opts.env.NEO_FLEET_BRIDGE_TOKEN;

        expect(token).toBe('bridge_a_token');                                       // it WAS injected
        expect(JSON.stringify(status)).not.toContain(token);                        // never via status
        expect(JSON.stringify(FleetLifecycleService.status('a'))).not.toContain(token);
    });

    test('forced NL projection is set by construction for every FM spawn (fail-closed invariant)', () => {
        // even a tokenless agent (no PAT) gets the forced embedded projection — never the full surface
        const spawn = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');
        expect(spawn.calls[0].opts.env.NEO_NL_TOOL_PROJECTION_MODE).toBe('harness-embedded');
    });

    test('SECURITY: start fails fast when bridgeTokenEnvVar collides with credentialEnvVar (Bridge token would land in the PAT slot)', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.bridgeTokenEnvVar = 'GH_TOKEN'; // === credentialEnvVar ⇒ credential classes collapse
        expect(() => FleetLifecycleService.start('a')).toThrow(/env-key contract/);
        expect(spawn.calls).toHaveLength(0); // guard is fail-fast: never spawned, no secret injected
    });

    test('SECURITY: start fails fast when a key collides with the fixed forced-projection var, or is empty', () => {
        install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.bridgeTokenEnvVar = 'NEO_NL_TOOL_PROJECTION_MODE'; // collides w/ the FIXED forced var
        expect(() => FleetLifecycleService.start('a')).toThrow(/env-key contract/);

        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}}); // fresh install resets the keys
        FleetLifecycleService.credentialEnvVar = 'NEO_MCP_REMOTE_TOKEN'; // repository PAT cannot collapse onto the fixed remote plane slot
        expect(() => FleetLifecycleService.start('a')).toThrow(/env-key contract/);
        expect(spawn.calls).toHaveLength(0); // never spawned

        install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.credentialEnvVar = ''; // empty key ⇒ contract violation
        expect(() => FleetLifecycleService.start('a')).toThrow(/env-key contract/)
    });

    test('a tokenless agent starts with NO credential in its env — the parent\'s ambient token never crosses', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');

        // no fleet credential resolved → the slot is EMPTY. The parent process may well carry its
        // own ambient GH_TOKEN; a tokenless peer silently inheriting it would collapse the
        // per-agent credential boundary (the cycle-1 review's falsifier) — the minimal allowlisted
        // child env excludes it by construction.
        expect(spawn.calls[0].opts.env.GH_TOKEN).toBeUndefined();
        expect(spawn.calls[0].opts.env.NEO_MCP_REMOTE_TOKEN).toBeUndefined();
        expect(FleetLifecycleService.isRunning('a')).toBe(true);
    });

    test('start refuses an unknown agent', () => {
        install({agents: {}, creds: {}});
        expect(() => FleetLifecycleService.start('ghost')).toThrow(/unknown agent/);
    });

    test('start refuses an agent with no launch override and no built-in launch template (untemplated harnessType)', () => {
        install({agents: {a: {id: 'a', githubUsername: 'a', harnessType: 'gemini-cli', metadata: {}}}, creds: {}});
        expect(() => FleetLifecycleService.start('a')).toThrow(/no launch template/);
    });

    test('start refuses an agent whose explicit metadata.launch carries no command', () => {
        install({agents: {a: {id: 'a', githubUsername: 'a', harnessType: 'codex', metadata: {launch: {args: ['--serve']}}}}, creds: {}});
        expect(() => FleetLifecycleService.start('a')).toThrow(/no launch spec/);
    });

    test('start is idempotent while running (no double spawn)', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');
        FleetLifecycleService.start('a');
        expect(spawn.calls).toHaveLength(1);
    });

    test('raw compatibility launches expose neither launchCommand nor authCommand through status', () => {
        install({agents: {a: agentDef('a')}, creds: {}});

        const status = FleetLifecycleService.start('a');

        expect(status.launchCommand).toBeNull();
        expect(status.authCommand).toBeNull();
        expect(status.authHome).toBeNull();
    });

    test('stop sends SIGTERM and transitions to stopped', async () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');

        const res = await FleetLifecycleService.stop('a');
        expect(res.success).toBe(true);
        expect(spawn.calls[0].child.signals).toContain('SIGTERM');
        expect(FleetLifecycleService.isRunning('a')).toBe(false);
        expect(FleetLifecycleService.status('a').state).toBe('stopped');
    });

    test('stop of a non-running agent is a no-op (success:false)', async () => {
        install({agents: {a: agentDef('a')}, creds: {}});
        const res = await FleetLifecycleService.stop('a');
        expect(res.success).toBe(false);
    });

    test('restart stops the old process and starts a fresh one', async () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}}),
              first = FleetLifecycleService.start('a'),
              after = await FleetLifecycleService.restart('a');

        expect(spawn.calls).toHaveLength(2);
        expect(after.running).toBe(true);
        expect(after.pid).not.toBe(first.pid);
    });

    test('restart re-spawns at the cwd the agent was started with (provisioned restart preserves the checkout)', async () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a', {cwd: '/managed/a/neomjs-neo'});
        await FleetLifecycleService.restart('a');

        expect(spawn.calls).toHaveLength(2);
        // The re-spawn re-uses the recorded cwd → it lands in the agent's checkout, not the FM dir
        // (otherwise the checkout-path-keyed auto-memory would silently fork).
        expect(spawn.calls[1].opts.cwd).toBe('/managed/a/neomjs-neo');
    });

    test('restart of a cwd-less agent re-spawns with no cwd (unchanged legacy behavior)', async () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');
        await FleetLifecycleService.restart('a');

        expect(spawn.calls[1].opts.cwd).toBeUndefined();
    });

    test('listRunning reflects the running set', () => {
        install({agents: {a: agentDef('a'), b: agentDef('b')}, creds: {a: 'x', b: 'y'}});
        FleetLifecycleService.start('a');
        FleetLifecycleService.start('b');

        expect(FleetLifecycleService.listRunning().map(s => s.id).sort()).toEqual(['a', 'b']);
    });

    test('status of a never-started agent is stopped', () => {
        install({agents: {a: agentDef('a')}, creds: {}});
        expect(FleetLifecycleService.status('a')).toMatchObject({state: 'stopped', running: false});
    });

    test('drains stderr (no backpressure) but never surfaces its content through status — counts bytes only', () => {
        install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');
        const child = FleetLifecycleService.processes.get('a').child;

        // a misbehaving harness echoes its injected token to stderr — status must NOT surface it
        child.stderr.emit('data', Buffer.from('[ERROR] auth failed with token ghp_LEAKED_via_stderr\n'));

        const status = FleetLifecycleService.status('a');
        expect(JSON.stringify(status)).not.toContain('ghp_LEAKED_via_stderr');  // content never surfaced
        expect(status.recentStderr).toBeUndefined();                            // no raw-content field at all
        expect(status.stderrBytes).toBeGreaterThan(0);                          // but it WAS drained (counted)
    });
});

// The positive lifecycle matrix: curated launch derivation, the minimal-env credential boundary,
// reserved/prototype env-key rejection, identity injection, the stdio liveness topology, and the
// live per-home authRequired surface. The final case is a REAL-process falsifier: it spawns an
// actual `node` child through the service's exact spawn path and proves the held-open-stdin
// topology keeps it alive — pure launch-shape tests cannot establish process liveness (the exact
// gap the cycle-1 review demonstrated on the real harness binaries).
test.describe('Neo.ai.services.fleet.FleetLifecycleService — curated launch + security matrix', () => {
    const curatedAgent = (id, harnessType = 'codex') => ({id, githubUsername: id, harnessType, metadata: {}});

    test('curated codex derivation: template args + isolated CODEX_HOME under instanceRoot, keyed by agent id', () => {
        const spawn = install({agents: {peer2: curatedAgent('peer2')}, creds: {}});
        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        // a REAL path-shaped binary so the existence preflight passes (spawn itself is stubbed)
        FleetLifecycleService.harnessBinaryPaths = {codex: process.execPath};

        FleetLifecycleService.start('peer2');

        const {command, args, opts} = spawn.calls[0];
        expect(command).toBe(process.execPath);
        expect(args).toEqual(['app-server']);                                   // the long-lived mode is template-owned
        expect(opts.env.CODEX_HOME.startsWith('/srv/fleet/instances/')).toBe(true);
        expect(opts.env.CODEX_HOME).toContain('peer2');                         // agent.id keys the home, never githubUsername-only grain
    });

    test('Fleet-managed OpenCode boot creates one top-level owner session before publishing the generated wake envelope', async () => {
        const
            root       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-opencode-owner-')),
            cwd        = path.join(root, 'repo'),
            agent      = curatedAgent('open-owner', 'opencode'),
            spawn      = install({agents: {'open-owner': agent}, creds: {}}),
            fetchCalls = [],
            hookCalls  = [];

        fs.mkdirSync(cwd);
        FleetLifecycleService.instanceRoot       = path.join(root, 'instances');
        FleetLifecycleService.harnessBinaryPaths = {opencode: process.execPath};

        const launch       = FleetLifecycleService.resolveLaunch(agent, {cwd});
        const hookPath     = path.join(launch.instanceHome, 'write-wake-envelope.mjs');
        const envelopePath = path.join(launch.instanceHome, 'opencode', 'wake-envelope.json');

        fs.mkdirSync(launch.instanceHome, {recursive: true});
        fs.writeFileSync(hookPath, '// generated test hook\n');

        FleetLifecycleService.fetchFn = async (url, opts) => {
            fetchCalls.push({url, opts});
            return {
                ok    : true,
                status: 200,
                json  : async () => ({
                    id       : 'ses_owner',
                    projectID: 'project_owner',
                    directory: fs.realpathSync(cwd)
                })
            };
        };
        FleetLifecycleService.openCodeHookExecFileFn = (command, args, opts, callback) => {
            hookCalls.push({command, args, opts});
            fs.mkdirSync(path.dirname(envelopePath), {recursive: true});
            fs.writeFileSync(envelopePath, JSON.stringify({
                hostname : '127.0.0.1',
                port     : 45678,
                sessionId: 'ses_owner',
                projectId: 'project_owner',
                directory: fs.realpathSync(cwd),
                username : opts.env.OPENCODE_SERVER_USERNAME,
                password : opts.env.OPENCODE_SERVER_PASSWORD,
                updatedAt: new Date().toISOString()
            }));
            fs.chmodSync(envelopePath, 0o600);
            callback(null, '', '');
        };

        const starting = FleetLifecycleService.start('open-owner', {cwd});
        const call     = spawn.calls[0];
        const password = call.opts.env.OPENCODE_SERVER_PASSWORD;

        expect(starting.wakeRoute).toMatchObject({state: 'starting', directory: fs.realpathSync(cwd), envelopePath});
        expect(call.opts.stdio).toEqual(['pipe', 'pipe', 'pipe']);
        expect(call.opts.env.OPENCODE_SERVER_USERNAME).toBe('opencode');
        expect(password).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(JSON.stringify(starting)).not.toContain(password);

        // Chunk boundary is deliberate: only a complete newline-terminated authoritative banner
        // may start the bootstrap.
        call.child.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.'));
        expect(fetchCalls).toHaveLength(0);
        call.child.stdout.emit('data', Buffer.from('1:45678\n'));

        await expect.poll(() => FleetLifecycleService.status('open-owner').wakeRoute?.state).toBe('ready');

        expect(fetchCalls).toHaveLength(1);
        const createUrl = new URL(fetchCalls[0].url);
        expect(createUrl.pathname).toBe('/api/session');
        expect(createUrl.searchParams.get('directory')).toBe(fs.realpathSync(cwd));
        expect(fetchCalls[0].opts).toMatchObject({method: 'POST', body: '{}', redirect: 'error'});
        expect(fetchCalls[0].opts.headers.authorization)
            .toBe('Basic ' + Buffer.from(`opencode:${password}`).toString('base64'));

        expect(hookCalls).toHaveLength(1);
        expect(hookCalls[0].command).toBe(process.execPath);
        expect(hookCalls[0].args).toEqual([
            hookPath,
            '--data-home', launch.instanceHome,
            '--port', '45678',
            '--session-id', 'ses_owner',
            '--project-id', 'project_owner',
            '--directory', fs.realpathSync(cwd)
        ]);
        expect(JSON.stringify(hookCalls[0].args)).not.toContain(password);
        expect(hookCalls[0].opts.env.NEO_FLEET_BRIDGE_TOKEN).toBeUndefined();
        expect(hookCalls[0].opts.env.NEO_MCP_REMOTE_TOKEN).toBeUndefined();
        expect(hookCalls[0].opts.env.GH_TOKEN).toBeUndefined();

        const ready = FleetLifecycleService.status('open-owner');
        expect(ready.wakeRoute).toMatchObject({
            state: 'ready', port: 45678, sessionId: 'ses_owner', projectId: 'project_owner'
        });
        expect(JSON.stringify(ready)).not.toContain(password);
        expect(fs.statSync(envelopePath).mode & 0o777).toBe(0o600);

        call.child.emit('exit', 0, 'SIGTERM');
        await expect.poll(() => FleetLifecycleService.status('open-owner').state).toBe('stopped');
        expect(FleetLifecycleService.status('open-owner').wakeRoute).toMatchObject({
            state: 'degraded', port: null, sessionId: null, projectId: null
        });
        expect(fs.existsSync(envelopePath)).toBe(false);

        FleetLifecycleService.processes.clear();
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('Fleet-managed OpenCode rejects sibling-workspace, child, or malformed creation tuples and never invokes the hook', async () => {
        const cases = [
            {
                id            : 'open-sibling',
                response      : {id: 'ses_sibling', projectID: 'project_sibling'},
                wrongDirectory: true
            },
            {
                id      : 'open-child',
                response: {id: 'ses_child', projectID: 'project_child', parentID: 'ses_parent'}
            },
            {
                id      : 'open-missing',
                response: {id: '', projectID: 'project_missing'}
            }
        ];

        for (const entry of cases) {
            const
                root  = fs.mkdtempSync(path.join(os.tmpdir(), `fleet-${entry.id}-`)),
                cwd   = path.join(root, 'repo'),
                agent = curatedAgent(entry.id, 'opencode'),
                spawn = install({agents: {[entry.id]: agent}, creds: {}});

            fs.mkdirSync(cwd);
            FleetLifecycleService.instanceRoot       = path.join(root, 'instances');
            FleetLifecycleService.harnessBinaryPaths = {opencode: process.execPath};

            const launch       = FleetLifecycleService.resolveLaunch(agent, {cwd});
            const hookPath     = path.join(launch.instanceHome, 'write-wake-envelope.mjs');
            const envelopePath = path.join(launch.instanceHome, 'opencode', 'wake-envelope.json');
            let   hookCalls    = 0;

            fs.mkdirSync(launch.instanceHome, {recursive: true});
            fs.writeFileSync(hookPath, '// generated test hook\n');
            FleetLifecycleService.fetchFn = async () => ({
                ok  : true,
                json: async () => ({
                    ...entry.response,
                    directory: entry.wrongDirectory ? path.join(root, 'sibling-repo') : fs.realpathSync(cwd)
                })
            });
            FleetLifecycleService.openCodeHookExecFileFn = () => { hookCalls++ };

            FleetLifecycleService.start(entry.id, {cwd});
            spawn.calls[0].child.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:45679\n'));

            await expect.poll(() => FleetLifecycleService.status(entry.id).wakeRoute?.state).toBe('degraded');
            expect(hookCalls).toBe(0);
            expect(fs.existsSync(envelopePath)).toBe(false);

            FleetLifecycleService.processes.clear();
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    test('Fleet-managed OpenCode removes stale coordinates and degrades fail-closed when owner-session creation fails', async () => {
        const
            root  = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-opencode-create-fail-')),
            cwd   = path.join(root, 'repo'),
            agent = curatedAgent('open-fail', 'opencode'),
            spawn = install({agents: {'open-fail': agent}, creds: {}});

        fs.mkdirSync(cwd);
        FleetLifecycleService.instanceRoot       = path.join(root, 'instances');
        FleetLifecycleService.harnessBinaryPaths = {opencode: process.execPath};

        const launch       = FleetLifecycleService.resolveLaunch(agent, {cwd});
        const hookPath     = path.join(launch.instanceHome, 'write-wake-envelope.mjs');
        const envelopePath = path.join(launch.instanceHome, 'opencode', 'wake-envelope.json');
        let   hookCalls    = 0;

        fs.mkdirSync(path.dirname(envelopePath), {recursive: true});
        fs.writeFileSync(hookPath, '// generated test hook\n');
        fs.writeFileSync(envelopePath, '{"port":1234}\n');
        FleetLifecycleService.fetchFn = async () => { throw new Error('fetch leaked-secret-value') };
        FleetLifecycleService.openCodeHookExecFileFn = () => { hookCalls++ };

        FleetLifecycleService.start('open-fail', {cwd});
        expect(fs.existsSync(envelopePath)).toBe(false);

        spawn.calls[0].child.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:45680\n'));

        await expect.poll(() => FleetLifecycleService.status('open-fail').wakeRoute?.state).toBe('degraded');
        const status = FleetLifecycleService.status('open-fail');

        expect(hookCalls).toBe(0);
        expect(fs.existsSync(envelopePath)).toBe(false);
        expect(status.running).toBe(true);
        expect(status.failureReason).toBe('OpenCode wake bootstrap failed during session creation');
        expect(JSON.stringify(status)).not.toContain('leaked-secret-value');

        FleetLifecycleService.processes.clear();
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('curated codex-desktop derivation composes exact cwd, dual homes, typed auth, and direct packaged-main supervision', () => {
        const
            cwd   = '/srv/checkouts/peer-desktop/neomjs/neo',
            spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: '/bin/sh'};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            reason            : null,
            crashpadExecutable: '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler'
        });
        FleetLifecycleService.codexDesktopCleanupFn = async () => ({terminated: [], escalated: []});

        const status       = FleetLifecycleService.start('desktop', {cwd});
        const {args, opts} = spawn.calls[0];

        expect(args).toEqual([
            `--user-data-dir=${opts.env.CODEX_ELECTRON_USER_DATA_PATH}`,
            `--open-project=${cwd}`
        ]);
        expect(opts.cwd).toBe(cwd);
        expect(opts.env.CODEX_HOME).toBe(status.authHome);
        expect(opts.env.CODEX_ELECTRON_USER_DATA_PATH).toContain('electron-profile');
        expect(opts.env.CODEX_SPARKLE_ENABLED).toBe('false');
        expect(opts.env.CODEX_THREAD_ID).toBeUndefined();
        expect(status.instanceHome).not.toBe(status.authHome);
        expect(status.launchCommand).toBe(process.execPath);
        expect(status.authCommand).toBe('/bin/sh');
        expect(status.authCommand).not.toBe(status.launchCommand);
        expect(status.authRequired).toBe(true);
    });

    test('codex-desktop refuses before capability probe/spawn when the final provisioned cwd is absent', () => {
        const spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => {
            throw new Error('must not run');
        };

        expect(() => FleetLifecycleService.start('desktop')).toThrow(/cwd.*absolute provisioned checkout/);
        expect(spawn.calls).toHaveLength(0);
    });

    test('codex-desktop capability failure publishes unavailable and never spawns', () => {
        const spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({available: false, reason: 'updater-disable-predicate-missing'});

        expect(() => FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toThrow(/codex-desktop is unavailable.*updater-disable-predicate-missing/);
        expect(spawn.calls).toHaveLength(0);
        expect(FleetLifecycleService.status('desktop')).toMatchObject({
            state        : 'unavailable',
            running      : false,
            failureReason: 'updater-disable-predicate-missing'
        });
    });

    test('codex-desktop missing bundled CLI publishes unavailable before capability probing or spawn', () => {
        const spawn  = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});
        let   probed = false;

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: '/definitely/missing/codex'};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => {
            probed = true;
            return {available: true, crashpadExecutable: '/app/browser_crashpad_handler'};
        };

        expect(() => FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toThrow(/bundled Codex CLI auth command is unavailable/);
        expect(probed).toBe(false);
        expect(spawn.calls).toHaveLength(0);
        expect(FleetLifecycleService.status('desktop')).toMatchObject({
            state        : 'unavailable',
            failureReason: 'bundled Codex CLI auth command is unavailable'
        });
    });

    test('codex-desktop child never inherits an ambient CODEX_THREAD_ID', () => {
        const
            previous = process.env.CODEX_THREAD_ID,
            spawn    = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            crashpadExecutable: '/app/browser_crashpad_handler'
        });
        process.env.CODEX_THREAD_ID = 'ambient-thread-must-not-cross';

        try {
            FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});
            expect(spawn.calls[0].opts.env.CODEX_THREAD_ID).toBeUndefined();
        } finally {
            if (previous === undefined) delete process.env.CODEX_THREAD_ID;
            else process.env.CODEX_THREAD_ID = previous;
        }
    });

    test('codex-desktop auth marker is scoped to the nested authHome, never the parent instanceHome', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-codex-desktop-auth-'));

        try {
            install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});
            FleetLifecycleService.instanceRoot       = root;
            FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
            FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
                available         : true,
                crashpadExecutable: '/app/browser_crashpad_handler'
            });

            const started = FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});

            fs.mkdirSync(started.instanceHome, {recursive: true});
            fs.writeFileSync(path.join(started.instanceHome, 'auth.json'), '{}');
            expect(FleetLifecycleService.status('desktop').authRequired).toBe(true);

            fs.mkdirSync(started.authHome, {recursive: true});
            fs.writeFileSync(path.join(started.authHome, 'auth.json'), '{}');
            expect(FleetLifecycleService.status('desktop').authRequired).toBe(false);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    test('codex-desktop stop waits for exact-profile helper cleanup before reporting stopped', async () => {
        const spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}}),
              calls = [];

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            crashpadExecutable: '/app/browser_crashpad_handler'
        });
        FleetLifecycleService.codexDesktopCleanupFn = async options => {
            calls.push(options);
            await Promise.resolve();
            return {terminated: [1, 2], escalated: []};
        };

        FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});
        const stopped = await FleetLifecycleService.stop('desktop');

        expect(spawn.calls[0].child.signals).toContain('SIGTERM');
        expect(calls).toHaveLength(1);
        expect(calls[0].electronProfile).toContain('electron-profile');
        expect(stopped).toMatchObject({success: true, state: 'stopped'});
        expect(FleetLifecycleService.status('desktop').state).toBe('stopped');
    });

    test('codex-desktop stop joins helper finalization already started by a natural main exit', async () => {
        const spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});
        let releaseCleanup;

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            crashpadExecutable: '/app/browser_crashpad_handler'
        });
        FleetLifecycleService.codexDesktopCleanupFn = () => new Promise(resolve => { releaseCleanup = resolve });

        FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});
        spawn.calls[0].child.emit('exit', 0, null);
        await Promise.resolve();

        expect(FleetLifecycleService.status('desktop').state).toBe('stopping');
        expect(() => FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toThrow(/still being finalized/);
        expect(spawn.calls).toHaveLength(1);

        let   settled = false;
        const stop    = FleetLifecycleService.stop('desktop').then(result => {
            settled = true;
            return result;
        });

        await Promise.resolve();
        expect(settled).toBe(false);

        releaseCleanup({terminated: [], escalated: []});

        await expect(stop).resolves.toMatchObject({success: true, state: 'stopped'});
    });

    test('codex-desktop ambiguous helper ownership fails stop status instead of broadening cleanup', async () => {
        const spawn           = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});
        let   cleanupAttempts = 0;

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            crashpadExecutable: '/app/browser_crashpad_handler'
        });
        FleetLifecycleService.codexDesktopCleanupFn = async () => {
            if (++cleanupAttempts === 1) throw new Error('ambiguous profile-owned process identity');
            return {terminated: [], escalated: []};
        };

        FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});
        const stopped = await FleetLifecycleService.stop('desktop');

        expect(stopped).toMatchObject({success: false, state: 'failed'});
        expect(stopped.cleanupUnresolved).toBe(true);
        expect(FleetLifecycleService.status('desktop').failureReason).toContain('ambiguous profile-owned process identity');
        expect(() => FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toThrow(/refusing to spawn.*lifecycle failure/);

        await expect(FleetLifecycleService.stop('desktop')).resolves.toMatchObject({success: true, state: 'stopped', cleanupUnresolved: false});
        expect(cleanupAttempts).toBe(2);

        expect(FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toMatchObject({state: 'running'});
        expect(spawn.calls).toHaveLength(2);
    });

    test('codex-desktop child error after spawn preserves stop authority until helper cleanup succeeds', async () => {
        const spawn = install({agents: {desktop: curatedAgent('desktop', 'codex-desktop')}, creds: {}});

        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'codex-desktop': process.execPath, codex: process.execPath};
        FleetLifecycleService.codexDesktopCapabilityProbeFn = () => ({
            available         : true,
            crashpadExecutable: '/app/browser_crashpad_handler'
        });
        FleetLifecycleService.codexDesktopCleanupFn = async () => ({terminated: [], escalated: []});

        FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'});
        spawn.calls[0].child.emit('error', new Error('synthetic child error'));

        expect(FleetLifecycleService.status('desktop')).toMatchObject({state: 'failed', cleanupUnresolved: true});
        expect(() => FleetLifecycleService.start('desktop', {cwd: '/srv/checkouts/desktop'})).toThrow(/unresolved after a lifecycle failure/);

        await expect(FleetLifecycleService.stop('desktop')).resolves.toMatchObject({state: 'stopped', cleanupUnresolved: false});
    });

    test('curated claude-code derivation pins strict per-home MCP config plus stream-json mode', () => {
        const spawn = install({agents: {c2: curatedAgent('c2', 'claude-code')}, creds: {}});
        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'claude-code': process.execPath};

        FleetLifecycleService.start('c2');

        const {args, opts} = spawn.calls[0];
        expect(args).toEqual([
            '--mcp-config', path.join(FleetLifecycleService.instanceRoot, 'c2-9c0abe51c6e6', 'claude-code-28e174396028', 'mcp-config.json'),
            '--strict-mcp-config',
            '--input-format', 'stream-json',
            '--output-format', 'stream-json',
            '--print',
            '--verbose'
        ]);
        expect(Object.keys(opts.env)).toContain('CLAUDE_CONFIG_DIR');
    });

    test('SECURITY: the child env is the minimal allowlist — an ambient parent secret NEVER crosses into a peer', () => {
        process.env.NEO_TEST_AMBIENT_SECRET = 'sk_parent_secret';
        try {
            const spawn = install({agents: {a: agentDef('a')}, creds: {}});
            FleetLifecycleService.start('a');

            const env = spawn.calls[0].opts.env;
            expect(env.NEO_TEST_AMBIENT_SECRET).toBeUndefined();  // a tokenless peer cannot inherit parent secrets
            expect(env.PATH).toBe(process.env.PATH);              // benign runtime vars DO cross (the allowlist)
            expect(env.GH_TOKEN).toBeUndefined();                 // creds:{} → no PAT: nothing leaks from the parent's own GH_TOKEN either
            expect(env.NEO_MCP_REMOTE_TOKEN).toBeUndefined();     // no selected plane credential ⇒ remote slot stays empty
        } finally {
            delete process.env.NEO_TEST_AMBIENT_SECRET;
        }
    });

    test('SECURITY: a launch env naming a reserved slot is rejected fail-fast, before any secret is minted', () => {
        install({agents: {a: agentDef('a', {metadata: {launch: {command: 'x', args: [], env: {NEO_AGENT_IDENTITY: 'spoofed'}}}})}, creds: {}});
        expect(() => FleetLifecycleService.start('a')).toThrow(/collides with a reserved env slot/);
    });

    test('SECURITY: a prototype-mutating launch env key is rejected, never assigned', () => {
        // JSON.parse creates `__proto__` as an OWN key — exactly what registry-authored JSON yields
        const launch = JSON.parse('{"command": "x", "args": [], "env": {"__proto__": "polluted"}}');
        install({agents: {a: agentDef('a', {metadata: {launch}})}, creds: {}});
        expect(() => FleetLifecycleService.start('a')).toThrow(/prototype-mutating key/);
    });

    test('every FM spawn binds NEO_AGENT_IDENTITY to githubUsername, never the per-instance fleet id', () => {
        const spawn = install({
            agents: {
                'codex-2': agentDef('codex-2', {githubUsername: 'neo-gpt'})
            },
            creds: {}
        });

        FleetLifecycleService.start('codex-2');

        expect(spawn.calls[0].opts.env.NEO_AGENT_IDENTITY).toBe('neo-gpt');
    });

    test('the stdio topology holds stdin open as a pipe — the liveness contract for CLI harnesses', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');
        expect(spawn.calls[0].opts.stdio).toEqual(['pipe', 'ignore', 'pipe']);
    });

    test('start fails loud (pre-spawn, pre-secret) on a path-shaped binary that does not exist', () => {
        install({agents: {ghostbin: curatedAgent('ghostbin')}, creds: {}});
        FleetLifecycleService.instanceRoot       = os.tmpdir();
        FleetLifecycleService.harnessBinaryPaths = {codex: '/definitely/not/a/real/binary'};
        expect(() => FleetLifecycleService.start('ghostbin')).toThrow(/harness binary .* not found/);
    });

    test('a remote start launches the exact binary snapshot carried by its capability proof', () => {
        const spawn = install({agents: {remote: curatedAgent('remote')}, creds: {}});

        FleetLifecycleService.instanceRoot       = os.tmpdir();
        FleetLifecycleService.harnessBinaryPaths = {codex: '/mutated/after-capability-probe'};

        FleetLifecycleService.start('remote', {
            remoteMcpCapability: {
                harnessType     : 'codex',
                binaryPath      : process.execPath,
                launchBinaryPath: process.execPath
            }
        });

        expect(spawn.calls).toHaveLength(1);
        expect(spawn.calls[0].command).toBe(process.execPath)
    });

    test('a malformed or cross-family capability proof rejects before spawn', () => {
        const spawn = install({agents: {remote: curatedAgent('remote')}, creds: {}});

        FleetLifecycleService.instanceRoot = os.tmpdir();

        expect(() => FleetLifecycleService.start('remote', {
            remoteMcpCapability: {
                harnessType     : 'claude-code',
                binaryPath      : process.execPath,
                launchBinaryPath: process.execPath
            }
        })).toThrow(/invalid remote MCP capability proof/);
        expect(spawn.calls).toEqual([])
    });

    test('authRequired surfaces the LIVE per-home auth-marker state for curated launches — and flips without a restart', () => {
        const root  = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-auth-')),
              spawn = install({agents: {peer2: curatedAgent('peer2')}, creds: {}});
        FleetLifecycleService.instanceRoot       = root;
        FleetLifecycleService.harnessBinaryPaths = {codex: process.execPath};  // any real path-shaped binary passes preflight

        FleetLifecycleService.start('peer2');

        const
            home   = spawn.calls[0].opts.env.CODEX_HOME,
            status = FleetLifecycleService.status('peer2');

        expect(status.authRequired).toBe(true);  // fresh home: login pending
        expect(status.instanceHome).toBe(home); // exact non-secret owner path for the login handoff
        expect(status.launchCommand).toBe(process.execPath); // actual AiConfig/lifecycle binary, not PATH

        fs.mkdirSync(home, {recursive: true});
        fs.writeFileSync(path.join(home, 'auth.json'), '{}');

        expect(FleetLifecycleService.status('peer2').authRequired).toBe(false); // marker present: recomputed live

        fs.rmSync(root, {recursive: true, force: true});
    });

    test('the version probe runs under the SAME minimal env as the supervised child — no ambient-secret leak through the auxiliary subprocess', () => {
        const spawn     = install({agents: {a: agentDef('a')}, creds: {}}),
              execCalls = [];

        FleetLifecycleService.execFileFn = (command, args, opts) => execCalls.push({command, args, opts});

        FleetLifecycleService.start('a');

        expect(execCalls).toHaveLength(1);
        expect(execCalls[0].args).toEqual(['--version']);
        // identity, not similarity: the probe must receive the exact child-env object — a probe
        // built from process.env would carry every ambient provider secret to the probed binary
        expect(execCalls[0].opts.env).toBe(spawn.calls[0].opts.env);
    });

    test('a BARE command missing from the child PATH fails synchronously — never a transient running/pid:null state', () => {
        const spawn = install({agents: {ghost: {id: 'ghost', githubUsername: 'ghost', harnessType: 'codex', metadata: {launch: {
            command: 'definitely-not-a-real-harness-xyz',
            args   : [],
            env    : {}
        }}}}, creds: {}});

        expect(() => FleetLifecycleService.start('ghost')).toThrow(/harness binary .* not found/);
        expect(spawn.calls).toHaveLength(0);                        // preflight fired BEFORE any spawn
        expect(FleetLifecycleService.isRunning('ghost')).toBe(false);
        expect(FleetLifecycleService.processes.has('ghost')).toBe(false);   // no zombie/false-running record
    });

    test('a bare command that DOES resolve on the child PATH passes preflight', () => {
        const spawn = install({agents: {bare: {id: 'bare', githubUsername: 'bare', harnessType: 'codex', metadata: {launch: {
            command: 'node',
            args   : ['--version'],
            env    : {}
        }}}}, creds: {}});

        FleetLifecycleService.start('bare');

        expect(spawn.calls).toHaveLength(1);
        expect(FleetLifecycleService.isRunning('bare')).toBe(true);
    });

    test('EXECUTABILITY, not existence: a mode-0644 PATH candidate fails synchronously — no record, no async permission-flip', () => {
        // the exact falsifier shape: a real file that EXISTS on the child PATH but is not
        // executable — an existence-only preflight passes it, publishes running/pid:null, then
        // flips to failed on the child's asynchronous permission error
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-noexec-'));
        fs.writeFileSync(path.join(binDir, 'plainfile-harness'), '#!/bin/sh\nexit 0\n', {mode: 0o644});

        const spawn = install({agents: {noexec: {id: 'noexec', githubUsername: 'noexec', harnessType: 'codex', metadata: {launch: {
            command: 'plainfile-harness',
            args   : [],
            env    : {PATH: binDir}
        }}}}, creds: {}});

        expect(() => FleetLifecycleService.start('noexec')).toThrow(/not found or not executable/);
        expect(spawn.calls).toHaveLength(0);
        expect(FleetLifecycleService.processes.has('noexec')).toBe(false);

        fs.rmSync(binDir, {recursive: true, force: true});
    });

    test('REAL-PROCESS child-cwd resolution: a relative ./bin command under opts.cwd preflights AND spawns consistently', async () => {
        // spawn-equivalence end-to-end: the resolver accepts the relative command against the
        // CHILD's cwd, and the real spawn (which chdirs before exec) resolves it identically —
        // the child stays alive on the held-open stdin pipe, then stops on SIGTERM
        const childCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-relcwd-'));
        fs.mkdirSync(path.join(childCwd, 'bin'));
        fs.writeFileSync(path.join(childCwd, 'bin', 'h'), '#!/bin/sh\ncat\n', {mode: 0o755});

        install({agents: {rel: {id: 'rel', githubUsername: 'rel', harnessType: 'codex', metadata: {launch: {
            command: './bin/h',
            args   : [],
            env    : {}
        }}}}, creds: {}});
        FleetLifecycleService.spawnFn = null;   // the REAL child_process.spawn

        FleetLifecycleService.start('rel', {cwd: childCwd});

        await new Promise(resolve => setTimeout(resolve, 300));
        expect(FleetLifecycleService.isRunning('rel')).toBe(true);

        const stopped = await FleetLifecycleService.stop('rel');
        expect(stopped.success).toBe(true);

        fs.rmSync(childCwd, {recursive: true, force: true});
    });

    test('REAL-PROCESS relative child PATH: spawn and version probe reuse the same resolved executable', async () => {
        const childCwd       = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-relpath-')),
              executablePath = path.join(childCwd, 'bin', 'h'),
              processCalls   = {spawn: [], execFile: []};

        fs.mkdirSync(path.dirname(executablePath));
        fs.writeFileSync(executablePath, '#!/bin/sh\nif [ "$1" = "--version" ]; then\n    echo relpath-v1\n    exit 0\nfi\nIFS= read -r line\n', {mode: 0o755});

        install({agents: {relpath: {id: 'relpath', githubUsername: 'relpath', harnessType: 'codex', metadata: {launch: {
            command: 'h',
            args   : [],
            env    : {PATH: 'bin'}
        }}}}, creds: {}});
        FleetLifecycleService.spawnFn = (command, args, opts) => {
            processCalls.spawn.push({command, args, opts});
            return spawn(command, args, opts);
        };
        FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
            processCalls.execFile.push({command, args, opts});
            return execFile(command, args, opts, callback);
        };

        try {
            FleetLifecycleService.start('relpath', {cwd: childCwd});

            await expect.poll(() => FleetLifecycleService.status('relpath').binaryVersion).toBe('relpath-v1');
            expect(FleetLifecycleService.isRunning('relpath')).toBe(true);
            expect(processCalls.spawn).toHaveLength(1);
            expect(processCalls.execFile).toHaveLength(1);
            expect(processCalls.spawn[0].command).toBe(executablePath);
            expect(processCalls.execFile[0].command).toBe(executablePath);
        } finally {
            if (FleetLifecycleService.isRunning('relpath')) await FleetLifecycleService.stop('relpath');
            fs.rmSync(childCwd, {recursive: true, force: true});
        }
    });

    test('REAL-PROCESS liveness falsifier: the service topology keeps an actual child alive; SIGTERM stops it', async () => {
        // Through the service's EXACT spawn path (no stub): a real `node` child that only survives
        // if stdin stays open — precisely the property the harness CLIs demand. A regression to
        // stdio 'ignore' makes this child exit instantly and the assertion below fail.
        install({agents: {live: {id: 'live', githubUsername: 'live', harnessType: 'codex', metadata: {launch: {
            command: process.execPath,
            args   : ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0))'],
            env    : {}
        }}}}, creds: {}});
        FleetLifecycleService.spawnFn = null;  // the REAL child_process.spawn

        FleetLifecycleService.start('live');

        await new Promise(resolve => setTimeout(resolve, 400));
        expect(FleetLifecycleService.isRunning('live')).toBe(true);             // alive BECAUSE stdin is a held pipe

        const stopped = await FleetLifecycleService.stop('live');
        expect(stopped.success).toBe(true);
        expect(FleetLifecycleService.isRunning('live')).toBe(false);
    });
});

test.describe('Neo.ai.services.fleet.FleetLifecycleService — remote MCP capability admission', () => {
    test('the default Claude Desktop probe executes the reviewed bridge grammar', async () => {
        install();
        FleetLifecycleService.harnessBinaryPaths = {'claude-desktop': process.execPath};

        const proof = await FleetLifecycleService.assertRemoteMcpCapability({
            id         : 'seat-claude-desktop',
            harnessType: 'claude-desktop'
        }, {
            mainCheckout: process.cwd(),
            nodePath    : process.execPath
        });

        expect(proof.bridge).toEqual({
            kind      : 'neo-stdio-streamable-http',
            command   : process.execPath,
            entrypoint: path.join(process.cwd(), 'ai/mcp/client/stdioToStreamableHttp.mjs')
        })
    });

    test('accepts only the exact adapter grammar for every supported harness family', async () => {
        install();
        FleetLifecycleService.harnessBinaryPaths = {
            codex           : process.execPath,
            'codex-desktop' : process.execPath,
            'claude-code'   : process.execPath,
            'claude-desktop': process.execPath,
            'kimi-code'     : process.execPath,
            opencode        : process.execPath
        };

        const
            desktopBridge = {
                kind      : 'neo-stdio-streamable-http',
                command   : process.execPath,
                entrypoint: '/installed/neo/ai/mcp/client/stdioToStreamableHttp.mjs'
            },
            outputs       = new Map([
                ['codex',         'Usage: mcp add --url <URL> --bearer-token-env-var <ENV>'],
                ['codex-desktop', 'Usage: mcp add --url <URL> --bearer-token-env-var <ENV>'],
                ['claude-desktop', null],
                ['claude-code',   'Usage: mcp add --transport http --header Header'],
                ['kimi-code',     'kimi 0.29.1'],
                ['opencode',      'opencode 1.18.5']
            ]),
            calls   = [];

        FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
            const harnessType = calls.at(-1)?.pendingHarness;
            calls.push({command, args, opts, harnessType});
            callback(null, outputs.get(harnessType), '')
        };
        FleetLifecycleService.claudeDesktopBridgeCapabilityProbeFn = () => desktopBridge;

        for (const harnessType of outputs.keys()) {
            calls.push({pendingHarness: harnessType});

            const expected = {
                harnessType,
                binaryPath      : process.execPath,
                launchBinaryPath: process.execPath
            };

            if (harnessType === 'claude-desktop') expected.bridge = desktopBridge;

            await expect(FleetLifecycleService.assertRemoteMcpCapability({
                id: `seat-${harnessType}`, harnessType
            })).resolves.toEqual(expected)
        }

        const probeCalls = calls.filter(call => call.command);

        expect(probeCalls.map(call => call.args)).toEqual([
            ['mcp', 'add', '--help'],
            ['mcp', 'add', '--help'],
            ['mcp', 'add', '--help'],
            ['--version'],
            ['--version']
        ])
    });

    test('rejects missing flags, wrong bridge kinds, unknown families, and unavailable binaries', async () => {
        install();
        FleetLifecycleService.harnessBinaryPaths = {
            codex           : process.execPath,
            'claude-code'   : process.execPath,
            'claude-desktop': process.execPath,
            'kimi-code'     : process.execPath,
            opencode        : process.execPath
        };

        const rejects = [
            {harnessType: 'codex',       output: '--url only'},
            {harnessType: 'claude-code', output: '--transport only'},
            {harnessType: 'kimi-code',   output: 'kimi 0.29.0'},
            {harnessType: 'opencode',    output: 'opencode 1.18.6'}
        ];

        for (const {harnessType, output} of rejects) {
            FleetLifecycleService.execFileFn = (command, args, opts, callback) => callback(null, output, '');

            await expect(FleetLifecycleService.assertRemoteMcpCapability({
                id: `seat-${harnessType}`, harnessType
            })).rejects.toThrow(/does not expose Fleet's required remote MCP grammar/)
        }

        FleetLifecycleService.claudeDesktopBridgeCapabilityProbeFn = () => ({
            kind      : 'generic-proxy',
            command   : process.execPath,
            entrypoint: '/installed/neo/ai/mcp/client/stdioToStreamableHttp.mjs'
        });

        await expect(FleetLifecycleService.assertRemoteMcpCapability({
            id: 'seat-claude-desktop', harnessType: 'claude-desktop'
        })).rejects.toThrow(/does not expose Fleet's required Neo stdio-to-Streamable-HTTP bridge/)

        FleetLifecycleService.claudeDesktopBridgeCapabilityProbeFn = () => {
            throw new Error('missing bridge')
        };

        await expect(FleetLifecycleService.assertRemoteMcpCapability({
            id: 'seat-claude-desktop', harnessType: 'claude-desktop'
        })).rejects.toThrow(/bridge capability probe failed/)

        FleetLifecycleService.harnessBinaryPaths['native-neo'] = process.execPath;

        await expect(FleetLifecycleService.assertRemoteMcpCapability({
            id: 'seat-native', harnessType: 'native-neo'
        })).rejects.toThrow(/has no remote MCP artifact grammar/)

        FleetLifecycleService.harnessBinaryPaths = {codex: '/definitely/missing/codex'};

        await expect(FleetLifecycleService.assertRemoteMcpCapability({
            id: 'seat-missing', harnessType: 'codex'
        })).rejects.toThrow(/harness binary .* is unavailable/)
    });

    test('capability probes receive only the benign runtime env allowlist', async () => {
        install();
        FleetLifecycleService.harnessBinaryPaths = {codex: process.execPath};

        const
            secretKey    = 'NEO_TEST_REMOTE_CAPABILITY_SECRET',
            priorSecret  = process.env[secretKey],
            capturedEnvs = [];

        process.env[secretKey] = 'must-not-cross';
        FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
            capturedEnvs.push(opts.env);
            callback(null, '--url --bearer-token-env-var', '')
        };

        try {
            await FleetLifecycleService.assertRemoteMcpCapability({
                id: 'seat-codex', harnessType: 'codex'
            })
        } finally {
            if (priorSecret === undefined) {
                delete process.env[secretKey]
            } else {
                process.env[secretKey] = priorSecret
            }
        }

        expect(capturedEnvs).toHaveLength(1);
        expect(capturedEnvs[0][secretKey]).toBeUndefined();
        expect(capturedEnvs[0].GH_TOKEN).toBeUndefined();
        expect(capturedEnvs[0].NEO_MCP_REMOTE_TOKEN).toBeUndefined();
        expect(Object.keys(capturedEnvs[0]).every(key =>
            ['HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'TMPDIR', 'USER'].includes(key)
        )).toBe(true)
    });

    test('the installed Codex parser must consume the exact generated remote projection before spawn', async () => {
        install();

        const
            resources = {
                'memory-core'   : {url: 'https://tenant.example.com/mc/mcp'},
                'knowledge-base': {url: 'https://tenant.example.com/kb/mcp'}
            },
            matrix = {
                'memory-core'    : true,
                'knowledge-base' : true,
                'neural-link'    : true,
                'github-workflow': false,
                'gitlab-workflow': false
            },
            rows = Object.entries(matrix).map(([key, enabled]) => ({
                name     : `neo-mjs-${key}`,
                enabled,
                transport: ['memory-core', 'knowledge-base'].includes(key)
                    ? {
                        type                : 'streamable_http',
                        url                 : resources[key].url,
                        bearer_token_env_var: 'NEO_MCP_REMOTE_TOKEN',
                        http_headers        : null,
                        env_http_headers    : null
                    }
                    : {type: 'stdio'}
            })),
            calls = [];

        FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
            calls.push({command, args, opts});
            callback(null, JSON.stringify(rows), 'WARNING: benign launcher warning')
        };

        await expect(FleetLifecycleService.inspectPreparedRemoteMcpAdapter({
            agent       : {id: 'seat-codex', githubUsername: 'neo-gpt', harnessType: 'codex'},
            binaryPath  : process.execPath,
            repoPath    : '/managed/seat-codex/neo',
            instanceHome: '/instances/seat-codex',
            mcpMatrix   : matrix,
            mcpTarget   : {kind: 'tenant', resources},
            mcpPlan     : tenantMcpPlan(resources, matrix)
        })).resolves.toEqual({
            harnessType: 'codex',
            inspected  : true,
            serverNames: Object.keys(matrix).map(key => `neo-mjs-${key}`),
            capturePlan: {
                producer        : 'installed-codex-mcp-list',
                harnessType     : 'codex',
                repoPath        : '/managed/seat-codex/neo',
                sourceRoot      : '/installed/neo',
                expectedIdentity: '@neo-gpt',
                servers         : {
                    'memory-core': {
                        name   : 'neo-mjs-memory-core',
                        enabled: true,
                        stdio  : {
                            command: process.execPath,
                            args   : ['/installed/neo/ai/mcp/server/memory-core/mcp-server.mjs'],
                            envVars: ['NEO_AGENT_IDENTITY']
                        },
                        remote: {
                            url             : resources['memory-core'].url,
                            credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                        }
                    },
                    'knowledge-base': {
                        name   : 'neo-mjs-knowledge-base',
                        enabled: true,
                        stdio  : {
                            command: process.execPath,
                            args   : ['/installed/neo/ai/mcp/server/knowledge-base/mcp-server.mjs'],
                            envVars: ['NEO_AGENT_IDENTITY']
                        },
                        remote: {
                            url             : resources['knowledge-base'].url,
                            credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                        }
                    }
                }
            }
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].command).toBe(process.execPath);
        expect(calls[0].args).toEqual(['mcp', 'list', '--json']);
        expect(calls[0].opts.cwd).toBe('/managed/seat-codex/neo');
        expect(calls[0].opts.env.CODEX_HOME).toBe('/instances/seat-codex');
        expect(calls[0].opts.env.GH_TOKEN).toBeUndefined();
        expect(calls[0].opts.env.NEO_MCP_REMOTE_TOKEN).toBeUndefined();
    });

    test('the installed Codex projection fails closed on residue, wrong routing, or static auth', async () => {
        install();

        const
            resources = {
                'memory-core'   : {url: 'https://tenant.example.com/mc/mcp'},
                'knowledge-base': {url: 'https://tenant.example.com/kb/mcp'}
            },
            matrix = {
                'memory-core'    : true,
                'knowledge-base' : true,
                'neural-link'    : true,
                'github-workflow': false,
                'gitlab-workflow': false
            },
            canonicalRows = Object.entries(matrix).map(([key, enabled]) => ({
                name     : `neo-mjs-${key}`,
                enabled,
                transport: ['memory-core', 'knowledge-base'].includes(key)
                    ? {
                        type                : 'streamable_http',
                        url                 : resources[key].url,
                        bearer_token_env_var: 'NEO_MCP_REMOTE_TOKEN',
                        http_headers        : null,
                        env_http_headers    : null
                    }
                    : {type: 'stdio'}
            })),
            mutations = [
                rows => rows.slice(1),
                rows => [...rows, structuredClone(rows[0])],
                rows => { rows[0].enabled = false; return rows; },
                rows => { rows[0].transport.url = 'https://wrong.example.com/mc/mcp'; return rows; },
                rows => { rows[0].transport.bearer_token_env_var = 'GH_TOKEN'; return rows; },
                rows => { rows[0].transport.http_headers = {Authorization: 'Bearer static'}; return rows; },
                rows => { rows[2].transport = {type: 'streamable_http', url: 'https://wrong.example.com/nl'}; return rows; }
            ];

        for (const mutate of mutations) {
            const rows = mutate(structuredClone(canonicalRows));

            FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
                callback(null, JSON.stringify(rows), '')
            };

            await expect(FleetLifecycleService.inspectPreparedRemoteMcpAdapter({
                agent       : {id: 'seat-codex', githubUsername: 'neo-gpt', harnessType: 'codex'},
                binaryPath  : process.execPath,
                repoPath    : '/managed/seat-codex/neo',
                instanceHome: '/instances/seat-codex',
                mcpMatrix   : matrix,
                mcpTarget   : {kind: 'tenant', resources},
                mcpPlan     : tenantMcpPlan(resources, matrix)
            })).rejects.toThrow(/inspectPreparedRemoteMcpAdapter/)
        }

        FleetLifecycleService.execFileFn = (command, args, opts, callback) => {
            callback(new Error('adapter read failed'))
        };

        await expect(FleetLifecycleService.inspectPreparedRemoteMcpAdapter({
            agent       : {id: 'seat-codex', githubUsername: 'neo-gpt', harnessType: 'codex'},
            binaryPath  : process.execPath,
            repoPath    : '/managed/seat-codex/neo',
            instanceHome: '/instances/seat-codex',
            mcpMatrix   : matrix,
            mcpTarget   : {kind: 'tenant', resources},
            mcpPlan     : tenantMcpPlan(resources, matrix)
        })).rejects.toThrow(/could not consume the generated MCP projection/)
    });

    test('explicit repository and plane credentials are injected verbatim without authority collapse or a second registry read', () => {
        const
            repositoryPat = 'ghp_exact_authenticated_value',
            planePat      = 'glpat_exact_authenticated_value',
            spawn         = install({agents: {a: agentDef('a')}, creds: {a: 'stale-registry-value'}}),
            registry      = FleetLifecycleService.registry;
        let credentialReads = 0;

        registry.resolveCredential = () => {
            credentialReads++;
            return 'unexpected-second-read'
        };

        FleetLifecycleService.start('a', {
            resolvedCredential   : repositoryPat,
            resolvedMcpCredential: planePat
        });

        expect(credentialReads).toBe(0);
        expect(spawn.calls[0].opts.env.GH_TOKEN).toBe(repositoryPat);
        expect(spawn.calls[0].opts.env.NEO_MCP_REMOTE_TOKEN).toBe(planePat);
        expect(spawn.calls[0].opts.env.GH_TOKEN).not.toBe(spawn.calls[0].opts.env.NEO_MCP_REMOTE_TOKEN)
    });
});
