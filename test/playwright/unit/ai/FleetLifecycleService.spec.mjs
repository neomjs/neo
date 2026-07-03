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

import {test, expect}   from '@playwright/test';
import {EventEmitter}   from 'events';

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
        resolveCredential: id => (Object.hasOwn(creds, id) ? creds[id] : null),
        // Stub the Bridge-token mint with a deterministic per-id token, so spawn-injection specs can
        // assert env carriage without touching the real registry's crypto store.
        mintBridgeToken  : id => ({token: `bridge_${id}_token`, expiresAt: Date.now() + 3_600_000})
    };
}

const LAUNCH = {command: 'my-harness', args: ['--serve']};

function agentDef(id, extra = {}) {
    return {id, githubUsername: id, harnessType: 'codex', metadata: {launch: LAUNCH}, ...extra};
}

/** Reset the singleton + inject fresh test doubles. Returns the spawn stub. */
function install({agents = {}, creds = {}} = {}) {
    const spawnStub = makeSpawnStub();
    FleetLifecycleService.processes.clear();
    FleetLifecycleService.spawnFn         = spawnStub;
    FleetLifecycleService.registry        = makeRegistry(agents, creds);
    FleetLifecycleService.sigkillTimeoutMs = 50;
    // Reset the configurable env-key fields to their defaults so a collision test cannot bleed into
    // the next serial sibling (singleton-stateful service).
    FleetLifecycleService.credentialEnvVar  = 'GH_TOKEN';
    FleetLifecycleService.bridgeTokenEnvVar = 'NEO_FLEET_BRIDGE_TOKEN';
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
        expect(spawn.calls[0].command).toBe('my-harness');
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
        FleetLifecycleService.credentialEnvVar = ''; // empty key ⇒ contract violation
        expect(() => FleetLifecycleService.start('a')).toThrow(/env-key contract/);
        expect(spawn.calls).toHaveLength(0); // never spawned
    });

    test('a tokenless agent starts without injecting a fleet credential', () => {
        const before = process.env.GH_TOKEN,
              spawn  = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');

        // no fleet credential resolved → the env var is left at its ambient value, not a fleet token
        expect(spawn.calls[0].opts.env.GH_TOKEN).toBe(before);
        expect(FleetLifecycleService.isRunning('a')).toBe(true);
    });

    test('start refuses an unknown agent', () => {
        install({agents: {}, creds: {}});
        expect(() => FleetLifecycleService.start('ghost')).toThrow(/unknown agent/);
    });

    test('start refuses an agent with no launch spec', () => {
        install({agents: {a: {id: 'a', githubUsername: 'a', harnessType: 'codex', metadata: {}}}, creds: {}});
        expect(() => FleetLifecycleService.start('a')).toThrow(/no launch spec/);
    });

    test('start is idempotent while running (no double spawn)', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');
        FleetLifecycleService.start('a');
        expect(spawn.calls).toHaveLength(1);
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
