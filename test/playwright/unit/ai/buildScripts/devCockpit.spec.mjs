import {test, expect}               from '@playwright/test';
import {createServer}               from 'node:net';
import {planCockpitBoot, probePort} from '../../../../../buildScripts/devCockpit.mjs';

/**
 * The boot-plan witnesses for the one-command cockpit launcher: the pure decision seam
 * (spawn-vs-reuse on the fleet port) and the probe primitive it feeds. The full two-process
 * supervision is process wiring behind the entry guard — the launcher's spawn targets
 * (`npm run server-start`, `devFleetServer.mjs`) carry their own suites.
 */
test.describe('buildScripts/devCockpit — the live-by-default boot plan (#15283)', () => {

    test('a free fleet port → spawn the transport, named start note', () => {
        const plan = planCockpitBoot({fleetPort: 8083, fleetPortBusy: false});

        expect(plan.spawnFleet).toBe(true);
        expect(plan.spawnWebpack).toBe(true);
        expect(plan.notes[0]).toContain('starting fleet transport on :8083')
    });

    test('a busy fleet port → REUSE, never a silent second server (shared-machine honesty)', () => {
        const plan = planCockpitBoot({fleetPort: 8083, fleetPortBusy: true});

        expect(plan.spawnFleet).toBe(false);
        expect(plan.spawnWebpack).toBe(true);
        expect(plan.notes[0]).toContain('already serving :8083');
        expect(plan.notes[0]).toContain('reusing');
        expect(plan.notes[0]).toContain('not spawning a second server')
    });

    test('probePort: a live loopback listener reads busy; a closed port reads free', async () => {
        const listener = createServer();

        await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));

        const {port} = listener.address();

        expect(await probePort(port)).toBe(true);

        await new Promise(resolve => listener.close(resolve));

        expect(await probePort(port)).toBe(false)
    })
});
