import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'path';
import {
    acquireFileLease,
    FileLeaseHeldError,
    FileLeaseLostError
} from '../../../../../../ai/daemons/shared/fileLease.mjs';

/**
 * The shared file-lease core, falsifier-first.
 *
 * The probes below were authored BEFORE the implementation, against the amended Contract Ledger
 * on the authority-lease ticket. The load-bearing falsifier is the namespace case: the named
 * threat is a bare HOST process declaring `container-plane` beside the Docker container that
 * owns it, and
 * Docker Desktop runs containers in a VM — the container's pid has NO host-namespace existence
 * (verified: `docker inspect` State.Pid 335860 → `ps -p` finds nothing). A pid-liveness probe
 * (`process.kill(pid, 0)` → ESRCH) reads that LIVE holder as dead and reclaims, starting the
 * duplicate the lease exists to refuse. So the authority lease's liveness is TTL, not pid: a
 * lease younger than TTL reads HELD regardless of whether the holder's pid is visible.
 *
 * Every contender probe below runs with a pid probe that would say DEAD (`() => false`) — so a
 * pid-liveness implementation fails these tests in the open direction, which is exactly the
 * defect being pinned.
 */

const
    TTL = 60_000,
    T0  = Date.parse('2026-07-31T23:00:00.000Z');

/** Deterministic clock: a mutable now, advanced by the test. */
function clock(start = T0) {
    const ref = {t: start};
    return {now: () => ref.t, advance: ms => { ref.t += ms; }};
}

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-file-lease-'));
}

const LEASE_OPTS = dir => ({
    dir,
    filename   : '.authority-lease-container-plane',
    owner      : '@neo-kimi-phoebe',
    fields     : {profile: 'container-plane'},
    lockLabel  : 'authority',
    remediation: 'host-edge and container-plane declare different roles by design; a same-role second claim is never legitimate.',
    // The authority lease's TTL strategy, injected the way `authorityLease.mjs` injects it into
    // the core. Note what it never reads: pid visibility. That is the namespace falsifier — a
    // pid probe would answer "dead" for a live container holder, and this strategy cannot.
    isHeldFresh: ({holder, now: at}) => (at - Date.parse(holder.lastPulse ?? holder.startedAt)) < TTL
});

test.describe('#16230 — file lease: claim, refuse, reclaim, release (TTL-liveness)', () => {
    test('a fresh claim writes the full diagnostic descriptor and returns a handle', () => {
        const dir   = tmpDir();
        const {now} = clock();

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        const written = fs.readJsonSync(path.join(dir, '.authority-lease-container-plane'));
        expect(written.pid).toBe(4242);
        expect(written.owner).toBe('@neo-kimi-phoebe');
        expect(typeof written.ownerToken).toBe('string');
        expect(written.profile).toBe('container-plane');
        expect(written.startedAt).toBe('2026-07-31T23:00:00.000Z');
        expect(written.lastPulse).toBe('2026-07-31T23:00:00.000Z');

        handle.release();
    });

    test('NAMESPACE FALSIFIER (host contender vs container holder): a fresh lease reads HELD even when the holder pid is invisible', () => {
        const dir   = tmpDir();
        const {now} = clock();

        // The "container": holds the lease. Its pid (7) would read DEAD to any host-namespace
        // pid probe — simulate by never claiming the dir exists in any process table.
        acquireFileLease({...LEASE_OPTS(dir), pid: 7, now});

        // The "host bare process": its pid probe cannot see the container (always false).
        // A pid-liveness lease would reclaim here and start the duplicate — the defect.
        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now}))
            .toThrow(FileLeaseHeldError);
    });

    test('the refusal names holder pid, role, and remediation (positive control on the error)', () => {
        const dir   = tmpDir();
        const {now} = clock();

        acquireFileLease({...LEASE_OPTS(dir), pid: 7, now});

        let caught;
        try {
            acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now});
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(FileLeaseHeldError);
        expect(caught.code).toBe('FILE_LEASE_HELD');
        expect(caught.holder.pid).toBe(7);
        expect(caught.holder.profile).toBe('container-plane');
        expect(caught.message).toContain('container-plane');
        expect(caught.message).toContain('pid 7');
        expect(caught.message).toContain('same-role second claim is never legitimate');
    });

    test('NAMESPACE FALSIFIER (container contender vs dead host holder): a lease older than TTL is reclaimed', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        advance(TTL + 1); // the holder went silent past TTL — dead, wedged, or in another namespace

        const handle  = acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now});
        const written = fs.readJsonSync(path.join(dir, '.authority-lease-container-plane'));

        expect(written.pid).toBe(9999);
        handle.release();
    });

    test('a lease younger than TTL by any margin is HELD; older than TTL is stale (boundary)', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        advance(TTL - 1);
        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now}))
            .toThrow(FileLeaseHeldError);

        advance(2); // now TTL + 1 past the last pulse
        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now});
        handle.release();
    });

    test('different roles coexist: a fresh other-role lease does not block a different-role claim', () => {
        const dir   = tmpDir();
        const {now} = clock();

        acquireFileLease({...LEASE_OPTS(dir), pid: 7, now}); // container-plane held

        const hostEdge = acquireFileLease({
            ...LEASE_OPTS(dir),
            filename: '.authority-lease-host-edge',
            fields  : {profile: 'host-edge'},
            pid     : 8888,
            now,
            isAlive : () => false
        });

        expect(fs.existsSync(path.join(dir, '.authority-lease-host-edge'))).toBe(true);
        hostEdge.release();
    });

    test('a corrupt lease file is reclaimed, never a wedge', () => {
        const dir   = tmpDir();
        const {now} = clock();

        fs.writeFileSync(path.join(dir, '.authority-lease-container-plane'), '{not json', 'utf8');

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});
        handle.release();
    });

    test('pulse refreshes lastPulse and keeps the lease HELD past the original TTL', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        // Heartbeat every 3s for 90s — well past one TTL, never silent.
        for (let i = 0; i < 30; i++) {
            advance(3_000);
            expect(handle.pulse().held).toBe(true);
        }

        // A contender still refuses: the holder is fresh.
        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now}))
            .toThrow(FileLeaseHeldError);

        handle.release();
    });

    test('REVALIDATION: a holder paused past TTL whose lease was reclaimed detects the loss on its next pulse — never silent continuation', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        const paused = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        advance(TTL + 1); // paused holder missed 20 beats

        // A contender legitimately reclaims the stale lease.
        acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now});

        // The paused holder wakes: its next mutating moment must surface the loss.
        expect(() => paused.pulse()).toThrow(FileLeaseLostError);
    });

    test('a pulse after a gap with the lease intact still holds (gap alone is not loss)', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});

        advance(TTL + 1); // nobody reclaimed — the file is still ours, just old

        // The holder re-verifies before its next mutating action: file intact → still ours.
        expect(handle.pulse().held).toBe(true);
        handle.release();
    });

    test('release removes only our own lease; a late release never deletes a successor', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        const first = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, now});
        advance(TTL + 1);
        const second = acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now}); // reclaims stale

        first.release(); // late — must NOT delete the successor's lock
        expect(fs.existsSync(path.join(dir, '.authority-lease-container-plane'))).toBe(true);

        second.release();
        expect(fs.existsSync(path.join(dir, '.authority-lease-container-plane'))).toBe(false);
    });

    test('TOKEN IDENTITY: an equal numeric pid with a different token is NOT ours — fresh refuses, stale reclaims', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        // The "container": pid 7, token A. A "host" boot reusing numeric pid 7 collides across
        // namespaces — token identity must not mistake it for our own leftover.
        acquireFileLease({...LEASE_OPTS(dir), pid: 7, token: 'token-a', now});

        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 7, token: 'token-b', now}))
            .toThrow(FileLeaseHeldError);

        advance(TTL + 1); // stale is stale, regardless of pid equality

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 7, token: 'token-b', now});
        handle.release();
    });

    test('a same-token re-claim reclaims (restart continuity for the injected-token path)', () => {
        const dir   = tmpDir();
        const {now} = clock();

        acquireFileLease({...LEASE_OPTS(dir), pid: 4242, token: 'token-a', now});
        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, token: 'token-a', now});
        handle.release();
    });

    test('GUARDED RENEWAL: a holder that pulses in time is never reclaimed — the successor re-inspects inside the guard', () => {
        const dir            = tmpDir();
        const {now, advance} = clock();

        const holder = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, token: 'token-a', now});

        advance(TTL + 1); // externally stale…
        expect(holder.pulse().held).toBe(true); // …but the holder renews first…

        // …and the successor's guarded reclaim re-inspects INSIDE the critical section: fresh now.
        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, token: 'token-b', now}))
            .toThrow(FileLeaseHeldError);

        expect(fs.readJsonSync(path.join(dir, '.authority-lease-container-plane')).ownerToken).toBe('token-a');
        holder.release();
    });

    test('corrupt + refuse-policy fails CLOSED — unjudgeable authority state is a refusal, never a guess', () => {
        const dir   = tmpDir();
        const {now} = clock();

        fs.writeFileSync(path.join(dir, '.authority-lease-container-plane'), '{not json', 'utf8');

        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now, onCorrupt: 'refuse'}))
            .toThrow(FileLeaseHeldError);
    });

    test('corrupt DATES are unjudgeable, not stale: a descriptor with garbage startedAt/lastPulse fails closed under refuse-policy', () => {
        const dir   = tmpDir();
        const {now} = clock();

        // Parseable JSON, valid pid + token, garbage TTL fields: an unguarded reader would compute
        // NaN < TTL as false and call it STALE — reclaiming a holder it cannot actually judge.
        fs.writeJsonSync(path.join(dir, '.authority-lease-container-plane'), {
            pid      : 7, owner: 'plane-daemon', ownerToken: 'token-a', profile: 'container-plane',
            startedAt: 'not-a-date', lastPulse: 'not-a-date'
        });

        // Refuse-policy (the authority lease): unjudgeable must fail closed.
        expect(() => acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now, onCorrupt: 'refuse'}))
            .toThrow(FileLeaseHeldError);

        // Reclaim-policy (the drain's non-wedging contract): corrupt state reclaims.
        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 9999, now});
        handle.release();
    });

    test('a contended pulse reports UNVERIFIED, never held — someone else mid-transition is not proof of authority', () => {
        const dir   = tmpDir();
        const {now} = clock();

        const handle = acquireFileLease({...LEASE_OPTS(dir), pid: 4242, token: 'token-a', now});

        // Stage a LIVE lifecycle guard held by someone else (fresh owner-token mtime): every entry
        // attempt observes a live guard and exhausts.
        const guardDir = `${path.join(dir, '.authority-lease-container-plane')}.lifecycle-guard`;
        fs.mkdirSync(guardDir);
        fs.writeFileSync(path.join(guardDir, 'owner-someone-else'), '');

        const result = handle.pulse();

        expect(result.held).toBe(false);
        expect(result.contended).toBe(true);

        fs.removeSync(guardDir);
        handle.release();
    });

    /**
     * A refusal whose holder identity is byte-identical to the requester's is EVIDENCE of
     * self-succession, not proof of it — the field is named `holderIdentityMatchesRequester` for
     * that reason, and the guidance says "may be" rather than "is".
     *
     * The distinction is load-bearing, because the same byte-identical identity is exactly what a
     * genuine duplicate produces. Containers make both cases collide: hostname is the container id
     * and the entrypoint is always pid 1, so a restart of the same slot AND a second container
     * started from the same image reproduce the previous identity equally well. Nothing in the
     * refusal can separate them, so the message must not pick one.
     *
     * What it replaces is worse than imprecise: "stop the duplicate" sent an operator hunting for a
     * second process that did not exist while the real cause — a crash loop — scrolled past above
     * it. Asserting self-succession instead would fail the same way in the other direction.
     */
    test('#16459 — an identical holder identity reports the identity match instead of telling you to stop a duplicate', () => {
        const holder = {owner: 'orchestrator@21ccb536bbb9', pid: 1, startedAt: '2026-08-03T18:09:24.177Z'},
              error  = new FileLeaseHeldError({
                  holder,
                  lockLabel  : 'authority',
                  lockPath   : '/x/.authority-lease-container-plane',
                  remediation: 'stop the duplicate.',
                  requester  : {owner: 'orchestrator@21ccb536bbb9', pid: 1}
              });

        expect(error.holderIdentityMatchesRequester).toBe(true);
        expect(error.message).toMatch(/may be your own previous instance/);
        expect(error.message).not.toMatch(/stop the duplicate/);
    });

    test('#16459 — a genuinely different holder keeps the caller remediation intact', () => {
        const error = new FileLeaseHeldError({
            holder     : {owner: 'orchestrator@21ccb536bbb9', pid: 1, startedAt: '2026-08-03T18:09:24.177Z'},
            lockLabel  : 'authority',
            lockPath   : '/x/.authority-lease-container-plane',
            remediation: 'stop the duplicate.',
            requester  : {owner: 'orchestrator@other-host', pid: 4711}
        });

        expect(error.holderIdentityMatchesRequester).toBe(false);
        expect(error.message).toMatch(/stop the duplicate/);
        expect(error.message).not.toMatch(/may be your own previous instance/);
    });

    test('#16459 — an unverifiable holder never reports an identity match', () => {
        const error = new FileLeaseHeldError({
            holder     : null,
            lockLabel  : 'authority',
            lockPath   : '/x/.authority-lease-container-plane',
            remediation: 'stop the duplicate.',
            requester  : {owner: 'orchestrator@21ccb536bbb9', pid: 1}
        });

        expect(error.holderIdentityMatchesRequester).toBe(false);
        expect(error.message).toMatch(/unverifiable holder/);
    });
});
