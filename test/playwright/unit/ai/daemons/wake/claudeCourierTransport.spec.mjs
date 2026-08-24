import {test, expect} from '@playwright/test';

import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import {
    COURIER_ADAPTER,
    completeOutboxEntry,
    defaultCourierDirs,
    deliverClaudeCourier,
    enqueueCourierEntry,
    listOutboxEntries,
    parseIdentityCwdMap,
    readSessionRegistry,
    resolveSessionForIdentity,
    writeCourierReceipt
} from '../../../../../../ai/daemons/wake/claudeCourierTransport.mjs';

/**
 * Focus-free transport for Claude seats: receiver spools, a courier session drains and delivers
 * over Claude Code's contracted cross-session messaging. These arms pin the parts that must
 * never fail silently — the explicit routing table (no path conventions), prefix session
 * matching (worktrees are real), ambiguity reported instead of guessed, and the layered outcome
 * vocabulary that distinguishes channel acceptance from rendered-in-session confirmation.
 */

const SEAT_MAP = [
    {identity: '@neo-opus-grace', cwd: '/Users/Shared/opus-grace/neomjs/neo'},
    {identity: '@neo-opus-ada', cwd: '/Users/Shared/github/neomjs/neo'}
];

const liveSessions = cwd => [{pid: 101, cwd, name: 'neo-x', socketPath: `/tmp/cc-socks/101.sock`}];

test.describe('claude courier transport — routing table', () => {

    test('parses a well-formed explicit table', () => {
        const map = parseIdentityCwdMap(JSON.stringify(SEAT_MAP));

        expect(map).toEqual(SEAT_MAP)
    });

    test('rejects a relative cwd, an identity without @, and a duplicate binding', () => {
        expect(() => parseIdentityCwdMap(JSON.stringify([{identity: '@x', cwd: 'rel/path'}])))
            .toThrow(/absolute/);
        expect(() => parseIdentityCwdMap(JSON.stringify([{identity: 'x', cwd: '/abs'}])))
            .toThrow(/@identity/);
        expect(() => parseIdentityCwdMap(JSON.stringify([
            {identity: '@x', cwd: '/a'}, {identity: '@x', cwd: '/b'}
        ]))).toThrow(/twice/)
    })
});

test.describe('claude courier transport — session resolution', () => {

    test('resolves exactly on the seat clone and by prefix inside a worktree', () => {
        const resolved = resolveSessionForIdentity({
            identity: '@neo-opus-grace',
            map     : SEAT_MAP,
            sessions: liveSessions('/Users/Shared/opus-grace/neomjs/neo')
        });

        expect(resolved.status).toBe('resolved');
        expect(resolved.session.pid).toBe(101);

        const worktree = resolveSessionForIdentity({
            identity: '@neo-opus-grace',
            map     : SEAT_MAP,
            sessions: liveSessions('/Users/Shared/opus-grace/neomjs/neo/.claude/worktrees/wt-1')
        });

        expect(worktree.status).toBe('resolved');
        expect(worktree.session.pid).toBe(101)
    });

    test('the historical-layout trap stays explicit: ada resolves only via her table row', () => {
        // /Users/Shared/github/neomjs/neo breaks any seat-folder convention; the table is the key.
        const resolved = resolveSessionForIdentity({
            identity: '@neo-opus-ada',
            map     : SEAT_MAP,
            sessions: liveSessions('/Users/Shared/github/neomjs/neo')
        });

        expect(resolved.status).toBe('resolved')
    });

    test('unmapped identities and mapped-but-dead seats are distinct typed outcomes', () => {
        expect(resolveSessionForIdentity({identity: '@nobody', map: SEAT_MAP, sessions: []}).status)
            .toBe('unmapped');
        expect(resolveSessionForIdentity({
            identity: '@neo-opus-grace',
            map     : SEAT_MAP,
            sessions: liveSessions('/somewhere/else')
        }).status).toBe('no-live-session')
    });

    test('two same-depth candidates are ambiguous — never guessed; a deeper worktree disambiguates', () => {
        const ambiguous = resolveSessionForIdentity({
            identity: '@neo-opus-grace',
            map     : SEAT_MAP,
            sessions: [
                {pid: 201, cwd: '/Users/Shared/opus-grace/neomjs/neo'},
                {pid: 202, cwd: '/Users/Shared/opus-grace/neomjs/neo'}
            ]
        });

        expect(ambiguous.status).toBe('ambiguous');
        expect(ambiguous.candidates.map(candidate => candidate.pid).sort()).toEqual([201, 202]);

        const nested = resolveSessionForIdentity({
            identity: '@neo-opus-grace',
            map     : SEAT_MAP,
            sessions: [
                {pid: 201, cwd: '/Users/Shared/opus-grace/neomjs/neo'},
                {pid: 202, cwd: '/Users/Shared/opus-grace/neomjs/neo/.claude/worktrees/deep'}
            ]
        });

        expect(nested.status).toBe('resolved');
        expect(nested.session.pid).toBe(202)
    })
});

test.describe('claude courier transport — spool', () => {

    test('entries land atomically with correlation id and verbatim digest', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-outbox-'));

        const {file} = enqueueCourierEntry({
            outboxDir  : dir,
            eventId    : 'evt-42',
            randomToken: () => 'fixed',
            entry      : {eventId: 'evt-42', targetIdentity: '@neo-opus-grace', digest: 'DIGEST-BYTES'}
        });

        const written = JSON.parse(fs.readFileSync(file, 'utf8'));

        expect(file).toMatch(/\d+-fixed-evt-42\.json$/);
        expect(written.digest).toBe('DIGEST-BYTES');
        expect(path.basename(file)).not.toMatch(/\.tmp$/);

        fs.rmSync(dir, {recursive: true, force: true})
    });

    test('the registry reader keeps only sessions that can actually receive', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sessions-'));

        fs.writeFileSync(path.join(dir, '101.json'), JSON.stringify({
            pid: 101, cwd: '/a', name: 'n1', messagingSocketPath: '/tmp/s1.sock'
        }));
        fs.writeFileSync(path.join(dir, '102.json'), JSON.stringify({pid: 102, cwd: '/b', name: 'bare'}));
        fs.writeFileSync(path.join(dir, 'garbage.json'), '{not json');

        const rows = readSessionRegistry({sessionsDir: dir});

        expect(rows).toHaveLength(1);
        expect(rows[0].socketPath).toBe('/tmp/s1.sock');

        fs.rmSync(dir, {recursive: true, force: true})
    })
});

test.describe('claude courier transport — adapter semantics', () => {

    const record = (overrides = {}) => ({
        eventId       : 'evt-c1',
        subscriptionId: 'WAKE_SUB:courier-a',
        envelope      : {
            identity: '@neo-opus-grace',
            payload : {totalEvents: 1, latestMessage: {subject: 'probe'}}
        },
        route: {
            agentIdentity        : '@neo-opus-grace',
            harnessTargetMetadata: {adapter: COURIER_ADAPTER},
            adapterConfig        : {}
        },
        ...overrides
    });

    const baseEffects = outboxDir => ({
        fs,
        homedir        : os.homedir,
        identityCwdMap : SEAT_MAP,
        sessionRegistry: liveSessions('/Users/Shared/opus-grace/neomjs/neo'),
        courierDirs    : {outboxDir, receiptsDir: `${outboxDir}-receipts`}
    });

    test('happy path: registry read from the seat home, spool entry carries pid+socket+digest', async () => {
        const outboxDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-run-'));
        const seatHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-home-'));
        const sessionsDir = path.join(seatHome, '.claude/sessions');

        fs.mkdirSync(sessionsDir, {recursive: true});
        fs.writeFileSync(path.join(sessionsDir, '101.json'), JSON.stringify({
            pid: 101, cwd: '/Users/Shared/opus-grace/neomjs/neo', name: 'n1', messagingSocketPath: '/tmp/s101.sock'
        }));

        const result = await deliverClaudeCourier({
            digest : 'DIGEST-BYTES',
            effects: {...baseEffects(outboxDir), sessionRegistry: null, homedir: () => seatHome},
            meta   : {},
            record : record()
        });

        expect(result.outcome).toBe('delivered');
        expect(result.outcomeReason).toBe('courier-spool-accepted');

        const files   = fs.readdirSync(outboxDir);
        const written = JSON.parse(fs.readFileSync(path.join(outboxDir, files[0]), 'utf8'));

        expect(written.targetPid).toBe(101);
        expect(written.targetSocket).toBe('/tmp/s101.sock');
        expect(written.targetIdentity).toBe('@neo-opus-grace');
        expect(written.digest).toBe('DIGEST-BYTES');

        fs.rmSync(outboxDir, {recursive: true, force: true});
        fs.rmSync(seatHome, {recursive: true, force: true})
    });

    test('every failure mode is loud and typed — never a quiet best-effort', async () => {
        const outboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-fail-'));

        const noMap = await deliverClaudeCourier({
            digest: 'd', effects: {fs, homedir: os.homedir, courierDirs: {outboxDir}}, meta: {}, record: record()
        });
        expect(noMap).toEqual({outcome: 'failed', outcomeReason: 'courier-map-missing'});

        const unmapped = await deliverClaudeCourier({
            digest : 'd',
            effects: {...baseEffects(outboxDir), identityCwdMap: [{identity: '@other', cwd: '/x'}]},
            meta   : {},
            record : record()
        });
        expect(unmapped.outcomeReason).toBe('courier-unmapped-identity:@neo-opus-grace');

        const dead = await deliverClaudeCourier({
            digest : 'd',
            effects: {...baseEffects(outboxDir), sessionRegistry: []},
            meta   : {},
            record : record()
        });
        expect(dead.outcomeReason).toContain('courier-no-live-session');

        const ambiguous = await deliverClaudeCourier({
            digest : 'd',
            effects: {
                ...baseEffects(outboxDir),
                sessionRegistry: [
                    {pid: 301, cwd: '/Users/Shared/opus-grace/neomjs/neo'},
                    {pid: 302, cwd: '/Users/Shared/opus-grace/neomjs/neo'}
                ]
            },
            meta  : {},
            record: record()
        });
        expect(ambiguous.outcomeReason).toContain('courier-ambiguous-session');
        expect(ambiguous.outcome).toBe('failed');

        fs.rmSync(outboxDir, {recursive: true, force: true})
    })
});

test.describe('claude courier transport — courier-side protocol', () => {

    const seedOutbox = outboxDir => {
        // Injected clocks make oldest-first deterministic regardless of millisecond boundaries.
        enqueueCourierEntry({outboxDir, eventId: 'evt-b', randomToken: () => 'b', entry: {eventId: 'evt-b'}, now: () => 2_000});
        enqueueCourierEntry({outboxDir, eventId: 'evt-a', randomToken: () => 'a', entry: {eventId: 'evt-a'}, now: () => 1_000})
    };

    test('drain lists oldest-first without claiming; completion removes exactly one', () => {
        const outboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-drain-'));

        seedOutbox(outboxDir);

        const listed   = listOutboxEntries({outboxDir});
        const complete = ({file}) => completeOutboxEntry({file});

        expect(listed.map(item => item.entry.eventId)).toEqual(['evt-a', 'evt-b']);

        complete(listed[0]);

        expect(listOutboxEntries({outboxDir}).map(item => item.entry.eventId)).toEqual(['evt-b']);
        // A dead courier re-drains survivors: nothing was claimed away by listing.
        expect(listOutboxEntries({outboxDir})[0].entry.eventId).toBe('evt-b');

        fs.rmSync(outboxDir, {recursive: true, force: true})
    });

    test('a corrupt entry is skipped for the pass rather than blocking the queue', () => {
        const outboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-corrupt-'));

        seedOutbox(outboxDir);
        fs.writeFileSync(path.join(outboxDir, '0000-broken.json'), '{not json');

        const listed = listOutboxEntries({outboxDir});

        expect(listed.map(item => item.entry.eventId)).toEqual(['evt-a', 'evt-b']);

        fs.rmSync(outboxDir, {recursive: true, force: true})
    });

    test('receipts are one-file-per-event and carry the verbatim detail', () => {
        const receiptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-receipts-'));

        writeCourierReceipt({
            receiptsDir,
            eventId: 'evt-a',
            outcome: 'expired',
            detail : 'held 5m then expired at the target'
        });
        writeCourierReceipt({receiptsDir, eventId: 'evt-a', outcome: 'delivered'});

        const written = JSON.parse(fs.readFileSync(path.join(receiptsDir, 'evt-a.json'), 'utf8'));

        expect(written.outcome).toBe('delivered');
        expect(written.at).toBeTruthy();

        fs.rmSync(receiptsDir, {recursive: true, force: true})
    })
});
