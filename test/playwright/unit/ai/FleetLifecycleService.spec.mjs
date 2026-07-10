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

import {test, expect} from '@playwright/test';
import {EventEmitter} from 'events';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

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

/** Reset the singleton + inject fresh test doubles. Returns the spawn stub. */
function install({agents = {}, creds = {}} = {}) {
    const spawnStub = makeSpawnStub();
    FleetLifecycleService.processes.clear();
    FleetLifecycleService.spawnFn         = spawnStub;
    // Stub the version probe by default so no spec spawns a real auxiliary subprocess; the
    // env-boundary test injects its own recorder.
    FleetLifecycleService.execFileFn      = () => {};
    FleetLifecycleService.registry        = makeRegistry(agents, creds);
    FleetLifecycleService.sigkillTimeoutMs = 50;
    // Reset the configurable env-key fields to their defaults so a collision test cannot bleed into
    // the next serial sibling (singleton-stateful service).
    FleetLifecycleService.credentialEnvVar  = 'GH_TOKEN';
    FleetLifecycleService.bridgeTokenEnvVar = 'NEO_FLEET_BRIDGE_TOKEN';
    // Reset the curated-launch resolution fields too — fallback tests set them explicitly.
    FleetLifecycleService.instanceRoot       = null;
    FleetLifecycleService.harnessBinaryPaths = null;
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

    test('a tokenless agent starts with NO credential in its env — the parent\'s ambient token never crosses', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');

        // no fleet credential resolved → the slot is EMPTY. The parent process may well carry its
        // own ambient GH_TOKEN; a tokenless peer silently inheriting it would collapse the
        // per-agent credential boundary (the cycle-1 review's falsifier) — the minimal allowlisted
        // child env excludes it by construction.
        expect(spawn.calls[0].opts.env.GH_TOKEN).toBeUndefined();
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

    test('curated claude-code derivation is reachable (registry vocabulary aligned) and pins the stream-json mode', () => {
        const spawn = install({agents: {c2: curatedAgent('c2', 'claude-code')}, creds: {}});
        FleetLifecycleService.instanceRoot       = '/srv/fleet/instances';
        FleetLifecycleService.harnessBinaryPaths = {'claude-code': process.execPath};

        FleetLifecycleService.start('c2');

        const {args, opts} = spawn.calls[0];
        expect(args).toEqual(['--input-format', 'stream-json', '--output-format', 'stream-json', '--print', '--verbose']);
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

    test('every FM spawn binds the child to its fleet identity via NEO_AGENT_IDENTITY', () => {
        const spawn = install({agents: {a: agentDef('a')}, creds: {}});
        FleetLifecycleService.start('a');
        expect(spawn.calls[0].opts.env.NEO_AGENT_IDENTITY).toBe('a');
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
