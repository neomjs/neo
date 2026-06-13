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
        resolveCredential: id => (Object.hasOwn(creds, id) ? creds[id] : null)
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

    test('drains + captures child stderr into a bounded tail (no pipe backpressure)', () => {
        install({agents: {a: agentDef('a')}, creds: {a: 'ghp_x'}});
        FleetLifecycleService.start('a');
        const child = FleetLifecycleService.processes.get('a').child;

        child.stderr.emit('data', Buffer.from('[WARN] harness warming up\n'));
        expect(FleetLifecycleService.status('a').recentStderr).toContain('harness warming up');

        // a large burst is drained, but the retained tail stays bounded
        child.stderr.emit('data', Buffer.from('x'.repeat(10_000)));
        expect(FleetLifecycleService.status('a').recentStderr.length).toBeLessThanOrEqual(4096);
    });
});
