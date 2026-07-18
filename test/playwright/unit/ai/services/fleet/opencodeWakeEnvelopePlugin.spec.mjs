import { test, expect }    from '@playwright/test';
import fs                  from 'fs-extra';
import os                  from 'os';
import path                from 'path';
import { NeoWakeEnvelope } from '../../../../../../ai/services/fleet/opencodeWakeEnvelopePlugin.mjs';

/**
 * Seat-side wake-envelope plugin witnesses: authoritative serverUrl over lsof, per-seat XDG
 * isolation, private temp creation plus final 0600 enforcement, operator-seat-only writes
 * (child/subagent sessions never retarget), and credential passthrough.
 */
test.describe('opencodeWakeEnvelopePlugin (#15394)', () => {
    let tmpRoot, savedEnv;

    const lsofText = (ports) => ports.map((port, i) =>
        `node    12${i} user   29u  IPv4 0x0      0t0  TCP 127.0.0.1:${port} (LISTEN)`
    ).join('\n');

    const mockCtx = (overrides = {}) => ({
        project  : {id: 'proj-test'},
        directory: '/tmp/proj-test',
        client   : {app: {log: async () => {}}},
        $        : (strings, ...values) => ({ text: async () => lsofText(overrides.lsofPorts ?? [11111, 22222]) }),
        ...overrides.ctx
    });

    const fireSessionCreated = async (hooks, info) => {
        await hooks.event({ event: { type: 'session.created', properties: { info } } });
    };

    test.beforeEach(() => {
        tmpRoot  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-envelope-'));
        savedEnv = {
            XDG_DATA_HOME           : process.env.XDG_DATA_HOME,
            OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME,
            OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD
        };

        process.env.OPENCODE_SERVER_USERNAME = 'opencode';
        process.env.OPENCODE_SERVER_PASSWORD = 'test-secret';
    });

    test.afterEach(() => {
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
    });

    test('non-session.created events are ignored', async () => {
        process.env.XDG_DATA_HOME = path.join(tmpRoot, 'seatA');

        const hooks = await NeoWakeEnvelope(mockCtx({}));
        await hooks.event({ event: { type: 'session.idle', properties: {} } });

        expect(fs.existsSync(path.join(tmpRoot, 'seatA', 'opencode', 'wake-envelope.json'))).toBe(false);
    });
});
