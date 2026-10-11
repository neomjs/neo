import {test, expect}        from '@playwright/test';
import net                   from 'node:net';
import {resolveFreePortSync} from '../../resolveFreePort.mjs';

/**
 * Coverage for the per-process webServer port derivation — the shared-machine wedge fix: fixed
 * default ports + `reuseExistingServer: false` made concurrent suite runs contend, and an orphaned
 * server made the wedge sticky machine-wide. The helper's contract: an env pin always wins
 * unchanged; otherwise the OS assigns a free port, so an occupied port can never be returned.
 */
test.describe('test/playwright/resolveFreePort — per-process webServer port derivation', () => {
    test('an explicit env pin wins unchanged (CI + deliberate pinning)', () => {
        expect(resolveFreePortSync('18190')).toBe(18190);
        expect(resolveFreePortSync('8080')).toBe(8080);
    });

    test('absent or non-numeric env values fall through to an OS-assigned free port', () => {
        for (const envValue of [undefined, '', 'not-a-port', '0', '-5']) {
            const port = resolveFreePortSync(envValue);
            expect(Number.isInteger(port)).toBe(true);
            expect(port).toBeGreaterThan(1024);
            expect(port).toBeLessThanOrEqual(65535);
        }
    });

    test('a probed port is genuinely bindable (free by construction)', async () => {
        const port = resolveFreePortSync(undefined);

        await new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => server.close(resolve));
        });
    });

    test('a LISTENING socket cannot wedge an unrelated run — the probe never returns an occupied port', async () => {
        // Occupy a port the way an orphaned test server would, then derive: the OS assigns from
        // its free pool, so the returned port differs from the occupied one by construction.
        const occupied = await new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve(server));
        });

        try {
            const occupiedPort = occupied.address().port;
            const derived      = resolveFreePortSync(undefined);

            expect(derived).not.toBe(occupiedPort);
        } finally {
            await new Promise(resolve => occupied.close(resolve));
        }
    });
});
