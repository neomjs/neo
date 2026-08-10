import {expect, test}                      from '@playwright/test';
import fs                                  from 'fs-extra';
import path                                from 'path';
import {fileURLToPath}                     from 'url';
import {DAEMON_EXIT_CRASH, DAEMON_EXIT_OK} from '../../../../../../ai/daemons/shared/daemonExit.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../');

/**
 * @summary Coverage for the daemon exit-code contract.
 *
 * **The defect.** All four long-lived daemons routed `uncaughtException` into the same `cleanup()`
 * their signal handlers use, and it called a bare `process.exit()` — exit code **0**. A crash was
 * therefore reported to the container runtime as SUCCESS. A restart policy masks it, which is why it
 * survived: the loss is attribution, not availability.
 *
 * **Two instruments here, and they prove different things — do not read one as the other:**
 *
 * 1. The `DAEMON_EXIT_*` tests are **behavioural** over the contract module. They prove the codes are
 *    distinct and that success is `0`.
 * 2. The per-daemon tests are **STRUCTURAL** — they read source text and assert how the handlers are
 *    WIRED. They cannot prove what the process does at runtime. That limit is deliberate and stated
 *    rather than papered over: proving the runtime behaviour would mean spawning each daemon and
 *    inducing a real uncaught exception, which needs their config, PID locks and stores. The wiring
 *    IS the defect here — a bare `process.exit()` and a directly-registered listener — so a
 *    structural assertion has the right subject, but it is not a behavioural claim.
 *
 * **Retirement condition for the structural half:** if handler installation is ever extracted into an
 * injectable function taking an `exit` port, these become behavioural and the source-reading versions
 * should go.
 *
 * **The `SIGINT` trap these guard.** `process.on('SIGINT', cleanup)` invokes the listener with the
 * **signal name**, so a positional `cleanup(exitCode = 0)` wired directly would hand `'SIGTERM'` to
 * `process.exit`. Each registration must pass its code explicitly. A repair that only changed the
 * crash path and left `process.on('SIGTERM', cleanup)` in place would still be broken, and the
 * signal-path assertions below are what catch that.
 */

const DAEMONS = [
    {key: 'orchestrator', file: 'ai/daemons/orchestrator/daemon.mjs'},
    {key: 'embed',        file: 'ai/daemons/embed/daemon.mjs'},
    {key: 'message',      file: 'ai/daemons/message/daemon.mjs'},
    {key: 'wake',         file: 'ai/daemons/wake/daemon.mjs'}
];

/**
 * Reads a daemon's source with comments removed, so an assertion about CODE cannot be satisfied — or
 * broken — by prose. The docblocks in these files quote `process.exit()` while explaining the defect;
 * without stripping, a "no bare exit" assertion would fail on its own explanation.
 * @param {String} relativePath
 * @returns {String}
 */
function readCode(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

test.describe('daemon exit-code contract', () => {
    test('success and crash are DISTINCT codes, and success is 0', () => {
        // Behavioural. `0` is not arbitrary — it is what a supervisor reads as a clean stop, so an
        // operator-initiated shutdown must land here and a crash must not.
        expect(DAEMON_EXIT_OK).toBe(0);
        expect(DAEMON_EXIT_CRASH).not.toBe(DAEMON_EXIT_OK);
        expect(Number.isInteger(DAEMON_EXIT_CRASH)).toBe(true);
        expect(DAEMON_EXIT_CRASH).toBeGreaterThan(0);
    });

    for (const daemon of DAEMONS) {
        test(`${daemon.key} — the crash path exits NON-ZERO`, () => {
            const code = readCode(daemon.file);

            // Single-sourced, not a local literal. Four copies of an implicit convention is what
            // produced this defect; a daemon that reintroduces its own constant fails here.
            expect(code).toContain("from '../shared/daemonExit.mjs'");
            expect(code).toMatch(/import\s*\{[^}]*DAEMON_EXIT_CRASH[^}]*\}/);

            // The crash arm hands the failure code through.
            expect(code).toMatch(/cleanup\(\s*DAEMON_EXIT_CRASH\s*\)/);
        });

        test(`${daemon.key} — the SIGNAL path still exits 0 (non-vacuity arm)`, () => {
            const code = readCode(daemon.file);

            // THE arm that makes this suite non-vacuous. Without it, a change setting every exit
            // non-zero would satisfy the crash assertions above and make every graceful stop look
            // like a crash — strictly worse than the defect, because it trains operators to ignore
            // the signal we just built.
            expect(code).toMatch(/process\.on\(\s*'SIGINT',\s*\(\)\s*=>\s*cleanup\(\s*DAEMON_EXIT_OK\s*\)/);
            expect(code).toMatch(/process\.on\(\s*'SIGTERM',\s*\(\)\s*=>\s*cleanup\(\s*DAEMON_EXIT_OK\s*\)/);

            // And the trap itself: a directly-registered listener receives the SIGNAL NAME as its
            // first argument. This is the shape the fix removes, and it must not come back.
            expect(code).not.toMatch(/process\.on\(\s*'SIGINT',\s*cleanup\s*\)/);
            expect(code).not.toMatch(/process\.on\(\s*'SIGTERM',\s*cleanup\s*\)/);
        });

        test(`${daemon.key} — no bare process.exit() remains`, () => {
            const code = readCode(daemon.file);

            // A bare `process.exit()` is the original defect verbatim: it yields 0 regardless of why
            // it was reached. Every exit in these files must now name its code.
            expect(code).not.toMatch(/process\.exit\(\s*\)/);
        });
    }

    test('the `exit` listener RELEASES without exiting, in every daemon', () => {
        // A listener registered on `exit` that itself calls `process.exit(0)` can reset a non-zero
        // code chosen by whatever triggered the exit — the same failure this ticket closes, arriving
        // by a different door. Three daemons previously registered the whole of `cleanup` here; the
        // orchestrator already registered release-only, and this asserts all four now agree.
        for (const daemon of DAEMONS) {
            const code = readCode(daemon.file);

            expect(code, `${daemon.key} registers a release-only exit listener`)
                .toMatch(/process\.on\(\s*'exit',\s*(removePidFile|releasePidFile)\s*\)/);
        }
    });
});
