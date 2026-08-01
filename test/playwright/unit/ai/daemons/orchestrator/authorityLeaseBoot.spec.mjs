import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'path';

/**
 * The boot-level falsifier for the authority lease — the REAL CLI entrypoint, not a helper seam.
 *
 * The defect this pins: `enforceSingleton()` can SIGTERM whatever holds the daemon PID file, so
 * the role lease must be claimed AHEAD of it. A refused boot must leave the incumbent unsignaled
 * and the plane untouched — no PID file, no receipt, no task state. A probe that starts inside
 * `Orchestrator.start()` cannot see that ordering; only the full `daemon.mjs` boot path can.
 *
 * Isolation: `NEO_AI_ORCHESTRATOR_DIR` relocates the daemon data dir into a temp dir; an empty
 * dotenv file in the subprocess cwd keeps the checkout's `.env` from leaking in. The probe never
 * touches the live plane.
 */

const
    REPO_ROOT  = path.resolve(new URL('../../../../../..', import.meta.url).pathname),
    DAEMON_MJS = path.join(REPO_ROOT, 'ai/daemons/orchestrator/daemon.mjs');

test.describe('the authority lease binds the REAL boot path before the legacy PID singleton', () => {
    test('a refused boot leaves the incumbent unsignaled and the plane untouched', () => {
        const
            dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lease-boot-')),
            workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lease-boot-cwd-'));

        fs.writeFileSync(path.join(workDir, '.env'), '', 'utf8');

        // The incumbent: a fresh container-plane lease (lastPulse = now) plus a sentinel PID file.
        // If enforceSingleton ran, it would read/reap/rewrite the sentinel.
        fs.writeJsonSync(path.join(dataDir, '.authority-lease-container-plane'), {
            pid      : 7, owner: 'plane-daemon', ownerToken: 'incumbent-token', profile: 'container-plane',
            startedAt: new Date().toISOString(), lastPulse: new Date().toISOString()
        });
        fs.writeFileSync(path.join(dataDir, 'orchestrator-daemon.pid'), 'SENTINEL-UNTOUCHED\n', 'utf8');

        let output = '',
            status = 0;

        try {
            execFileSync(process.execPath, [DAEMON_MJS], {
                cwd: workDir,
                env: {
                    HOME                                 : os.homedir(),
                    PATH                                 : process.env.PATH,
                    NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane',
                    NEO_AI_ORCHESTRATOR_DIR              : dataDir
                },
                encoding: 'utf8',
                stdio   : 'pipe',
                timeout : 60_000
            });
        } catch (err) {
            status = err.status ?? 1;
            output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
        }

        // The boot must refuse non-zero, naming the lease and the holder.
        expect(status, `boot output:\n${output}`).not.toBe(0);
        expect(output).toContain('authority');
        expect(output).toContain('lease');
        expect(output).toContain('plane-daemon');

        // The plane is untouched: the sentinel PID file is byte-identical (the incumbent was
        // never signaled), and no receipt, state, or new files appeared.
        expect(fs.readFileSync(path.join(dataDir, 'orchestrator-daemon.pid'), 'utf8')).toBe('SENTINEL-UNTOUCHED\n');
        expect(fs.readdirSync(dataDir).sort()).toEqual([
            '.authority-lease-container-plane',
            'orchestrator-daemon.pid'
        ]);
    });
});
