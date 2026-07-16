import {test, expect}                  from '@playwright/test';
import {deriveTestPort, probeFreePort} from '../../deriveTestPort.mjs';
import net                             from 'node:net';

/**
 * Self-test for the per-checkout test-port derivation — the fix for the machine-global fixed
 * port that deadlocked four concurrent agent checkouts behind one orphaned server. The
 * distinctness fixtures are the REAL checkout roots from that incident. The env-override branch
 * lives in `playwright.config.unit.mjs` (importing a config module in a spec runs its side
 * effects, so the override semantics are covered by the config's own one-line `||` shape plus
 * this suite pinning both operands).
 */
test.describe('test-infra — deriveTestPort (per-checkout isolation)', () => {
    const incidentRoots = [
        '/Users/Shared/claude/neomjs/neo',
        '/Users/Shared/opus-vega/neomjs/neo',
        '/Users/Shared/fable/neomjs/neo',
        '/Users/Shared/github/neomjs/neo/.claude/worktrees/exciting-bhaskara-4872e6'
    ];

    test('deterministic: the same root derives the same port across calls', () => {
        const first = deriveTestPort(incidentRoots[0]);

        expect(deriveTestPort(incidentRoots[0])).toBe(first);
        expect(deriveTestPort(incidentRoots[0])).toBe(first)
    });

    test('distinct: the four real incident checkouts (worktree included) derive four different ports', () => {
        const ports = incidentRoots.map(root => deriveTestPort(root));

        expect(new Set(ports).size).toBe(ports.length)
    });

    test('range-bound: every derivation lands inside [base, base + range)', () => {
        for (const root of incidentRoots) {
            const port = deriveTestPort(root, {base: 18180, range: 512});

            expect(port).toBeGreaterThanOrEqual(18180);
            expect(port).toBeLessThan(18180 + 512)
        }
    });

    test('probe: a free candidate returns itself; an occupied one walks forward', async () => {
        const candidate = deriveTestPort('/probe/fixture/checkout', {base: 19300, range: 64});

        expect(probeFreePort(candidate)).toBe(candidate);

        const squatter = net.createServer();

        await new Promise(resolve => squatter.listen(candidate, '127.0.0.1', resolve));
        try {
            expect(probeFreePort(candidate)).toBe(candidate + 1)
        } finally {
            await new Promise(resolve => squatter.close(resolve))
        }
    })
});
