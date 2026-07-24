import {expect, test}                                from '@playwright/test';
import {groupByServedCheckout, parseListenerRecords} from '../../../../../../ai/scripts/diagnostics/probePortClaims.mjs';

/**
 * The probe answers the fourth axis of a per-seat data-root reconcile: which checkout SERVES each
 * port. Occupancy is not identity — a runner that trusted any listener on a port once executed a
 * different checkout's tree and produced false greens as well as false reds.
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

    test('groups by served checkout — the same port number is a DIFFERENT plane per checkout', () => {
        const grouped = groupByServedCheckout(parseListenerRecords(fixture, resolver));

        expect(grouped['/seats/seat-a/neo']).toEqual([8081, 8083]);
        expect(grouped['/canonical/neo']).toEqual([8080]);

        // The finding this exists to surface: more than one checkout serving one host's namespace.
        expect(Object.keys(grouped).filter(key => key !== 'unknown').length).toBeGreaterThan(1);
    });

    test('empty lsof output is a valid observation, not an error', () => {
        // A host with no listeners must return [], never throw — lsof exits non-zero on no-match.
        expect(parseListenerRecords('', () => 'unknown')).toEqual([]);
    });
});
