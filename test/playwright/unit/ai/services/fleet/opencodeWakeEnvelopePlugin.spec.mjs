import { test, expect }    from '@playwright/test';
import fs                  from 'fs-extra';
import os                  from 'os';
import path                from 'path';
import { NeoWakeEnvelope } from '../../../../../../ai/services/fleet/opencodeWakeEnvelopePlugin.mjs';

/**
 * Seat-side wake-envelope plugin witnesses: authoritative serverUrl over lsof, per-seat XDG
 * isolation, private temp creation plus final 0600 enforcement, operator-seat-only writes
 * (child/subagent sessions never retarget), credential passthrough, the mandatory post-write
 * probe outcomes (`written-probed` only on an end-to-end route check of the envelope's own
 * coordinates; `written-probe-failed` loud with the envelope still written), the load-time
 * armament log line (the loaded-vs-silent instrument), and the `session.updated` restore
 * path (re-bind after a restart with a restored session; NO on-disk adoption — cached
 * coordinates are never route authority; closure dedup; authoritative parentage from the
 * server's own session resource).
 */
test.describe('opencodeWakeEnvelopePlugin (#15394)', () => {
    let tmpRoot, savedEnv, logs, fetchCalls, realFetch;

    const lsofText = (ports) => ports.map((port, i) =>
        `node    12${i} user   29u  IPv4 0x0      0t0  TCP 127.0.0.1:${port} (LISTEN)`
    ).join('\n');

    const mockCtx = (overrides = {}) => ({
        project  : {id: 'proj-test'},
        directory: '/tmp/proj-test',
        client   : {app: {log: async (record) => { logs.push(record?.body ?? {}) }}},
        $        : (strings, ...values) => ({ text: async () => lsofText(overrides.lsofPorts ?? [11111, 22222]) }),
        ...overrides.ctx
    });

    const fireSessionCreated = async (hooks, info) => {
        await hooks.event({ event: { type: 'session.created', properties: { info } } });
    };

    const fireSessionUpdated = async (hooks, info) => {
        await hooks.event({ event: { type: 'session.updated', properties: { info } } });
    };

    test.beforeEach(() => {
        tmpRoot  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-envelope-'));
        savedEnv = {
            XDG_DATA_HOME            : process.env.XDG_DATA_HOME,
            OPENCODE_SERVER_USERNAME : process.env.OPENCODE_SERVER_USERNAME,
            OPENCODE_SERVER_PASSWORD : process.env.OPENCODE_SERVER_PASSWORD,
            NEO_WAKE_PROBE_TIMEOUT_MS: process.env.NEO_WAKE_PROBE_TIMEOUT_MS
        };

        process.env.OPENCODE_SERVER_USERNAME = 'opencode';
        process.env.OPENCODE_SERVER_PASSWORD = 'test-secret';

        logs       = [];
        fetchCalls = [];
        realFetch  = globalThis.fetch;

        // Default probe stub: the server answers 200 with the asked session id. The stub parses
        // the id out of the request URL so a mismatch between the event's id and the probed id
        // would still surface — the stub never invents the right answer for the wrong question.
        globalThis.fetch = async (input, init) => {
            const url = String(input);
            fetchCalls.push({url, init});

            return new Response(JSON.stringify({id: url.split('/').pop()}), {
                status : 200,
                headers: {'Content-Type': 'application/json'}
            });
        };
    });

    test.afterEach(() => {
        globalThis.fetch = realFetch;

        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }

        fs.removeSync(tmpRoot);
    });

    test('prefers the authoritative serverUrl over the lsof listener order', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ ctx: { serverUrl: 'http://127.0.0.1:22222' } }));
        await fireSessionCreated(hooks, { id: 'ses_authoritative' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        // lsof offers 11111 first; the authoritative serverUrl says 22222 — the authority must win.
        expect(envelope.port).toBe(22222);
        expect(envelope.sessionId).toBe('ses_authoritative');
        expect(envelope.username).toBe('opencode');
        expect(envelope.password).toBe('test-secret');
        expect(envelope.projectId).toBe('proj-test');
    });

    test('falls back to the own-pid lsof listener when no serverUrl exists', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatB');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [55673] }));
        await fireSessionCreated(hooks, { id: 'ses_fallback' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatB', 'opencode', 'wake-envelope.json'));
        expect(envelope.port).toBe(55673);
    });

    test('honors XDG_DATA_HOME per seat (two roots, two envelopes, no shared default)', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        let hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41001] }));
        await fireSessionCreated(hooks, { id: 'ses_a' });

        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatB');

        hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41002] }));
        await fireSessionCreated(hooks, { id: 'ses_b' });

        const a = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        const b = fs.readJsonSync(path.join(tmpRoot, 'seatB', 'opencode', 'wake-envelope.json'));

        expect(a.port).toBe(41001);
        expect(b.port).toBe(41002);
        expect(fs.existsSync(path.join(os.homedir(), '.local', 'share', 'opencode', 'wake-envelope.json.tmp'))).toBe(false);
    });

    test('a pre-existing 0644 envelope ends up 0600 (explicit chmod after the atomic rename)', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const envelopePath = path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json');
        fs.ensureDirSync(path.dirname(envelopePath));
        fs.writeFileSync(envelopePath, '{"stale":true}\n');
        fs.chmodSync(envelopePath, 0o644);

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41003] }));
        await fireSessionCreated(hooks, { id: 'ses_perms' });

        const mode = fs.statSync(envelopePath).mode & 0o777;
        expect(mode).toBe(0o600);

        const envelope = fs.readJsonSync(envelopePath);
        expect(envelope.sessionId).toBe('ses_perms');
        // no tmp residue from the atomic write
        expect(fs.readdirSync(path.dirname(envelopePath)).filter(f => f.endsWith('.tmp')).length).toBe(0);
    });

    test('the credential-bearing temp is 0600 before a rename can expose it', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const envelopePath = path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json');
        // Force rename to fail after the tmp write by occupying the destination with a directory.
        // The plugin catches the error; the retained tmp exposes its pre-rename mode for inspection.
        fs.ensureDirSync(envelopePath);

        const hooks = await NeoWakeEnvelope(mockCtx({lsofPorts: [41003]}));
        await fireSessionCreated(hooks, {id: 'ses_tmp_perms'});

        const tmpPath = `${envelopePath}.${process.pid}.tmp`;
        expect(fs.existsSync(tmpPath)).toBe(true);
        expect(fs.statSync(tmpPath).mode & 0o777).toBe(0o600);

        const tmpEnvelope = fs.readJsonSync(tmpPath);
        expect(tmpEnvelope.username).toBe('opencode');
        expect(tmpEnvelope.password).toBe('test-secret');
    });

    test('child/subagent session.created events never retarget the operator-seat envelope', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41004] }));
        await fireSessionCreated(hooks, { id: 'ses_child', parentID: 'ses_operator' });

        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
        // a child event must not even probe — the envelope's identity never comes from a child
        expect(fetchCalls.length).toBe(0);
    });

    test('non-session.created events are ignored', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({}));
        await hooks.event({ event: { type: 'session.idle', properties: {} } });

        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
        expect(fetchCalls.length).toBe(0);
    });

    test('sequential session.created events each bind their own exact id — no cross-targeting possible', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41005] }));

        await fireSessionCreated(hooks, { id: 'ses_a' });
        await fireSessionCreated(hooks, { id: 'ses_b' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        expect(envelope.sessionId).toBe('ses_b');

        // Each event probed its own exact id, in order — identity comes from the owner events,
        // never from any listing or selection heuristic.
        expect(fetchCalls.map(call => call.url)).toEqual([
            'http://127.0.0.1:41005/session/ses_a',
            'http://127.0.0.1:41005/session/ses_b'
        ]);
        expect(logs.filter(entry => entry.message?.startsWith('wake envelope written-probed')).length).toBe(2);
    });

    test('a verified probe logs written-probed and authenticates with the envelope\'s own credentials', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ ctx: { serverUrl: 'http://127.0.0.1:41006' } }));
        await fireSessionCreated(hooks, { id: 'ses_probe_ok' });

        const probed = logs.find(entry => entry.message?.startsWith('wake envelope written-probed'));
        expect(probed).toBeTruthy();
        expect(probed.level).toBe('info');
        expect(probed.message).toContain('ses_probe_ok');
        expect(probed.message).toContain('41006');

        // The probe exercises the envelope's coordinates — including the Basic auth the daemon will use.
        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].init.headers.Authorization).toBe('Basic ' + Buffer.from('opencode:test-secret').toString('base64'));
    });

    test('a non-200 probe logs written-probe-failed loudly — the envelope stays written', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        globalThis.fetch = async (input) => {
            fetchCalls.push({url: String(input)});
            return new Response('service unavailable', {status: 503});
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41007] }));
        await fireSessionCreated(hooks, { id: 'ses_probe_503' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        expect(envelope.sessionId).toBe('ses_probe_503');

        const failed = logs.find(entry => entry.message?.startsWith('written-probe-failed'));
        expect(failed).toBeTruthy();
        expect(failed.level).toBe('error');
        expect(failed.message).toContain('ses_probe_503');
        expect(failed.message).toContain('503');
        expect(logs.find(entry => entry.message?.startsWith('wake envelope written-probed'))).toBeFalsy();
    });

    test('a 200 probe carrying the wrong session id fails loudly — the split-brain guard', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        globalThis.fetch = async (input) => {
            fetchCalls.push({url: String(input)});
            return new Response(JSON.stringify({id: 'ses_someone_else'}), {
                status : 200,
                headers: {'Content-Type': 'application/json'}
            });
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41008] }));
        await fireSessionCreated(hooks, { id: 'ses_mismatch' });

        const failed = logs.find(entry => entry.message?.startsWith('written-probe-failed'));
        expect(failed).toBeTruthy();
        expect(failed.level).toBe('error');
        expect(failed.message).toContain('id mismatch');
        expect(fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json')).sessionId).toBe('ses_mismatch');
    });

    test('a transport-failing probe fails loudly — the envelope stays written', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        globalThis.fetch = async (input) => {
            fetchCalls.push({url: String(input)});
            throw new Error('fetch failed: ECONNREFUSED');
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41009] }));
        await fireSessionCreated(hooks, { id: 'ses_probe_down' });

        const failed = logs.find(entry => entry.message?.startsWith('written-probe-failed'));
        expect(failed).toBeTruthy();
        expect(failed.level).toBe('error');
        expect(failed.message).toContain('ECONNREFUSED');
        expect(fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json')).sessionId).toBe('ses_probe_down');
    });

    test('a hung probe is bounded in time — aborts loud instead of hanging the event hook', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');
        process.env.NEO_WAKE_PROBE_TIMEOUT_MS = '50';

        // A blackholed listener: accepts the connection, never answers. Without the abort budget
        // this event would hang forever — the feature failing silently in the exact state it
        // exists to detect. The stub rejects only when the signal fires, so the timeout is what
        // settles the race.
        globalThis.fetch = async (input, init) => {
            fetchCalls.push({url: String(input)});

            return new Promise((resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41010] }));
        await fireSessionCreated(hooks, { id: 'ses_probe_hung' });

        const failed = logs.find(entry => entry.message?.startsWith('written-probe-failed'));
        expect(failed).toBeTruthy();
        expect(failed.level).toBe('error');
        expect(failed.message).toContain('timed out after 50ms');
        expect(fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json')).sessionId).toBe('ses_probe_hung');
    });

    test('a load-time log line records the plugin armed — the loaded-vs-silent instrument', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        await NeoWakeEnvelope(mockCtx({}));

        const loaded = logs.find(entry => entry.message?.startsWith('neo-wake-envelope plugin loaded'));
        expect(loaded).toBeTruthy();
        expect(loaded.level).toBe('info');
        expect(loaded.message).toContain('restore coverage armed');
        // no envelope work at load — armament is observability, not a write path
        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
    });

    test('a restored session (session.updated) writes and probes when the envelope is missing', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41011] }));
        await fireSessionUpdated(hooks, { id: 'ses_restored_write' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        expect(envelope.sessionId).toBe('ses_restored_write');
        expect(envelope.port).toBe(41011);

        // authoritative parentage fetch + post-write probe, both against the exact id
        expect(fetchCalls.map(call => call.url)).toEqual([
            'http://127.0.0.1:41011/session/ses_restored_write',
            'http://127.0.0.1:41011/session/ses_restored_write'
        ]);
        expect(logs.find(entry => entry.message?.startsWith('wake envelope written-probed for restored session ses_restored_write'))).toBeTruthy();
    });

    test('a matching on-disk envelope with ROTATED credentials is rewritten and probed — cached coordinates are not authority', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const envelopePath = path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json');
        fs.ensureDirSync(path.dirname(envelopePath));
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : 41012,
            sessionId: 'ses_rotated',
            projectId: 'proj-STALE',
            directory: '/tmp/STALE',
            username : 'opencode',
            password : 'STALE-SECRET',
            updatedAt: '2026-07-25T00:00:00.000Z'
        }, {spaces: 2});

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41012] }));
        await fireSessionUpdated(hooks, { id: 'ses_rotated' });

        const envelope = fs.readJsonSync(envelopePath);
        // every stale field is refreshed from the current environment, not trusted from disk
        expect(envelope.password).toBe('test-secret');
        expect(envelope.projectId).toBe('proj-test');
        expect(envelope.directory).toBe('/tmp/proj-test');
        expect(envelope.updatedAt).not.toBe('2026-07-25T00:00:00.000Z');
        // authoritative parentage fetch + post-write probe — zero-fetch adoption does not exist
        expect(fetchCalls.map(call => call.url)).toEqual([
            'http://127.0.0.1:41012/session/ses_rotated',
            'http://127.0.0.1:41012/session/ses_rotated'
        ]);
    });

    test('a matching on-disk envelope with permissive mode is repaired to 0600', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const envelopePath = path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json');
        fs.ensureDirSync(path.dirname(envelopePath));
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : 41013,
            sessionId: 'ses_permissive',
            projectId: 'proj-test',
            directory: '/tmp/proj-test',
            username : 'opencode',
            password : 'test-secret',
            updatedAt: '2026-07-25T00:00:00.000Z'
        }, {spaces: 2});
        fs.chmodSync(envelopePath, 0o644);

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41013] }));
        await fireSessionUpdated(hooks, { id: 'ses_permissive' });

        expect(fs.statSync(envelopePath).mode & 0o777).toBe(0o600);
        expect(fetchCalls.length).toBe(2);
    });

    test('a pre-existing child-target envelope is never adopted — authoritative parentage filters first', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const envelopePath = path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json');
        fs.ensureDirSync(path.dirname(envelopePath));
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : 41014,
            sessionId: 'ses_child_target',
            projectId: 'proj-test',
            directory: '/tmp/proj-test',
            username : 'opencode',
            password : 'test-secret',
            updatedAt: '2026-07-25T00:00:00.000Z'
        }, {spaces: 2});

        globalThis.fetch = async (input) => {
            const url = String(input);
            fetchCalls.push({url});

            return new Response(JSON.stringify({id: url.split('/').pop(), parentID: 'ses_operator'}), {
                status : 200,
                headers: {'Content-Type': 'application/json'}
            });
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41014] }));
        await fireSessionUpdated(hooks, { id: 'ses_child_target' });
        await fireSessionUpdated(hooks, { id: 'ses_child_target' });

        // the poisoned envelope is neither trusted (adopted) nor refreshed (written):
        // the child filter fires before any write path, and its result is cached
        expect(fs.readJsonSync(envelopePath).updatedAt).toBe('2026-07-25T00:00:00.000Z');
        expect(fetchCalls.length).toBe(1);
        expect(logs.find(entry => entry.message?.includes('adopted'))).toBeFalsy();
    });

    test('repeated session.updated events for the same session cost one write total (closure dedup)', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41013] }));
        await fireSessionUpdated(hooks, { id: 'ses_dedup' });
        await fireSessionUpdated(hooks, { id: 'ses_dedup' });
        await fireSessionUpdated(hooks, { id: 'ses_dedup' });

        // first update: parentage fetch + probe; the rest are closure hits with zero cost
        expect(fetchCalls.length).toBe(2);
        expect(fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json')).sessionId).toBe('ses_dedup');
    });

    test('session.created followed by session.updated for the same session does not rewrite', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41014] }));
        await fireSessionCreated(hooks, { id: 'ses_fresh' });
        await fireSessionUpdated(hooks, { id: 'ses_fresh' });

        // created path probed once; the trailing update is a closure no-op
        expect(fetchCalls.length).toBe(1);
        expect(logs.filter(entry => entry.message?.startsWith('wake envelope written-probed')).length).toBe(1);
    });

    test('a child session.updated never retargets — parentage from the authoritative server payload, cached thereafter', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        globalThis.fetch = async (input) => {
            const url = String(input);
            fetchCalls.push({url});

            return new Response(JSON.stringify({id: url.split('/').pop(), parentID: 'ses_operator'}), {
                status : 200,
                headers: {'Content-Type': 'application/json'}
            });
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41015] }));
        await fireSessionUpdated(hooks, { id: 'ses_subagent' });
        await fireSessionUpdated(hooks, { id: 'ses_subagent' });

        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
        // one authoritative parentage fetch; the second update is filtered from the cache
        expect(fetchCalls.length).toBe(1);
        expect(logs.find(entry => entry.message?.includes('child session ses_subagent ignored'))).toBeTruthy();
    });

    test('a session.updated the server does not know (404) fails loud and writes nothing', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        globalThis.fetch = async (input) => {
            fetchCalls.push({url: String(input)});
            return new Response('not found', {status: 404});
        };

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41016] }));
        await fireSessionUpdated(hooks, { id: 'ses_ghost' });

        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
        const failed = logs.find(entry => entry.message?.startsWith('restore-target failed for session ses_ghost'));
        expect(failed).toBeTruthy();
        expect(failed.level).toBe('error');
        expect(failed.message).toContain('404');
    });

    test('an operator switch to a different top-level session retargets the envelope', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({ lsofPorts: [41017] }));
        await fireSessionUpdated(hooks, { id: 'ses_morning' });
        await fireSessionUpdated(hooks, { id: 'ses_evening' });

        const envelope = fs.readJsonSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'));
        expect(envelope.sessionId).toBe('ses_evening');

        // each switch costs its own parentage fetch + probe against its exact id
        expect(fetchCalls.map(call => call.url)).toEqual([
            'http://127.0.0.1:41017/session/ses_morning',
            'http://127.0.0.1:41017/session/ses_morning',
            'http://127.0.0.1:41017/session/ses_evening',
            'http://127.0.0.1:41017/session/ses_evening'
        ]);
    });
});
