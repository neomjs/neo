import {expect, test}                                from '@playwright/test';
import {groupByCwd, parseListenerRecords,
        servedCwds}                                  from '../../../../../../ai/scripts/diagnostics/probePortClaims.mjs';

/**
 * The probe answers the fourth axis of a per-seat data-root reconcile: which directory each port's
 * listener RESOLVES PATHS AGAINST. Occupancy is not identity — a runner that trusted any listener
 * on a port once executed a different checkout's tree and produced false greens as well as reds.
 *
 * The probe reports cwds, not verified checkouts, and these tests hold it to that weaker claim:
 * nothing here validates a path as a repository root, so nothing may assert one.
 *
 * The parser is tested against fixture `lsof -F pcn` output rather than live sockets: a test that
 * needed real listeners to prove the record-folding is right would be unrunnable in CI, which is
 * the reason the shell seam is injected rather than called.
 */
test.describe('ai/scripts/diagnostics/probePortClaims', () => {
    // `lsof -F pcn` is line-oriented and stateful: p<pid> opens a process block, c<cmd> names it,
    // and each following n<name> is one of THAT process's sockets.
    const fixture = [
        'p1363',
        'cnode',
        'n*:8081',
        'n*:8083',
        'p47541',
        'cnode',
        'n127.0.0.1:8080',
        'p719',
        'cControlCenter',
        'n*:5000'
    ].join('\n');

    const cwds = {
        1363 : '/seats/seat-a/neo',
        47541: '/canonical/neo',
        719  : '/'
    };

    const resolver = pid => cwds[pid] ?? 'unknown';

    test('folds multi-socket process blocks — every port carries its OWN process cwd', () => {
        const rows = parseListenerRecords(fixture, resolver);

        expect(rows).toHaveLength(4);
        expect(rows.map(row => row.port)).toEqual([5000, 8080, 8081, 8083]);

        // Both of pid 1363's sockets inherit that pid's cwd — the state must carry across n-lines.
        expect(rows.filter(row => row.pid === '1363').map(row => row.cwd))
            .toEqual(['/seats/seat-a/neo', '/seats/seat-a/neo']);
    });

    test('resolves each pid at most once', () => {
        const seen = [];
        parseListenerRecords(fixture, pid => {
            seen.push(pid);
            return cwds[pid] ?? 'unknown';
        });

        // pid 1363 owns two sockets but must be resolved once — the probe reads /proc-equivalents,
        // and re-reading per socket would scale with sockets rather than processes.
        expect(seen).toEqual(['1363', '47541', '719']);
    });

    test('reports unknown rather than guessing when a process is not inspectable', () => {
        // A foreign-uid process yields no cwd line; the honest answer is `unknown`, never a
        // plausible-looking default. A wrong checkout attribution is worse than an absent one.
        const rows = parseListenerRecords('p999\ncsomething\nn*:9999', () => 'unknown');

        expect(rows[0].cwd).toBe('unknown');
    });

    test('ignores non-socket n-lines and records without a parsable port', () => {
        const rows = parseListenerRecords('p1\ncnode\nn/some/path\nn*:7000', () => '/x');

        expect(rows).toHaveLength(1);
        expect(rows[0].port).toBe(7000);
    });

    test('groups by serving cwd — the same port number is a DIFFERENT plane per directory', () => {
        const grouped = groupByCwd(parseListenerRecords(fixture, resolver));

        expect(grouped['/seats/seat-a/neo']).toEqual([8081, 8083]);
        expect(grouped['/canonical/neo']).toEqual([8080]);

        // The finding this exists to surface: more than one checkout serving one host's namespace.
        expect(servedCwds(grouped).length).toBeGreaterThan(1);
    });

    test('a root-owned daemon is NOT counted as a serving cwd', () => {
        // A stock macOS host always has something rooted at `/` (ControlCenter, etc). Counting raw
        // group keys would report a plane that does not exist, inflating the very finding this
        // probe is meant to establish — an over-count is as wrong as a miss.
        const grouped = groupByCwd(parseListenerRecords(fixture, resolver));

        expect(grouped['/']).toEqual([5000]);
        expect(servedCwds(grouped)).not.toContain('/');
        expect(servedCwds(grouped)).not.toContain('unknown');
    });

    test('empty lsof output is a valid observation, not an error', () => {
        // A host with no listeners must return [], never throw — lsof exits non-zero on no-match.
        expect(parseListenerRecords('', () => 'unknown')).toEqual([]);
    });

    test('a non-repository cwd is reported as-is, never dropped and never called a checkout', () => {
        // The probe validates nothing about a cwd, so a listener serving from `/usr/local/var` or a
        // user's home has to survive the grouping intact. Filtering "non-repo-looking" paths would
        // be the probe inventing an identity check it never ran; the honest output is the cwd.
        const
            raw     = 'p9001\ncpostgres\nn*:5432\np9002\ncnode\nn*:9229',
            cwds    = {9001: '/usr/local/var/postgres', 9002: '/Users/someone'},
            grouped = groupByCwd(parseListenerRecords(raw, pid => cwds[pid]));

        expect(grouped['/usr/local/var/postgres']).toEqual([5432]);
        expect(grouped['/Users/someone']).toEqual([9229]);
        expect(servedCwds(grouped).sort()).toEqual(['/Users/someone', '/usr/local/var/postgres']);
    });
});
