/**
 * @module test/playwright/integration/helpers/terminateDaemon
 * @summary Terminates a spawned daemon and resolves only once it has actually been REAPED.
 *
 * Extracted so the contract can be witnessed without the integration suite's native dependencies,
 * and so its timings can be injected — the failure paths below are the interesting ones, and a
 * witness that had to wait the production grace period would cost ten seconds per case.
 *
 * **Signal state, not exit code, is the oracle.** A child killed by a signal reports
 * `exitCode === null` and `signalCode === 'SIGKILL'` — so `exitCode !== null` reads a
 * successfully-reaped daemon as still running. That is the one classification this module exists to
 * get right, and it is wrong in both directions: it fails a healthy teardown, and it sends an
 * already-dead child down the full wait path.
 */

/**
 * The terminal states a termination attempt can reach. `reaped` is carried explicitly from the
 * `exit` event rather than re-derived from the child afterwards, because every derivation from
 * `exitCode` alone misclassifies the signal case.
 * @type {Object}
 */
export const REAP_OUTCOME = Object.freeze({
    alreadyExited: 'already-exited',
    exited       : 'exited',
    killError    : 'kill-error',
    unreaped     : 'unreaped'
});

/**
 * @summary Whether the child has already terminated, by exit code OR by signal.
 *
 * Both are terminal and only one is ever populated: a normal exit sets `exitCode`, a signalled
 * termination sets `signalCode`. Checking one is checking half the contract.
 *
 * @param {import('node:child_process').ChildProcess} [child]
 * @returns {Boolean}
 */
export function isProcessTerminated(child) {
    return !child || child.exitCode !== null || child.signalCode !== null
}

/**
 * @summary Sends SIGTERM, escalates to SIGKILL, and resolves only once the child is reaped.
 *
 * **Resolving on `kill()` rather than on `exit` is a teardown race.** Signals are asynchronous:
 * `kill('SIGKILL')` marks the process for termination and returns immediately, so a caller that
 * resolves there hands control back while the child is still alive and still writing. A caller that
 * then removes the child's working directory is racing it — a recursive removal lists a directory,
 * unlinks what it saw, then `rmdir`s it, and an entry created in an already-walked subdirectory is
 * what makes that `rmdir` fail with `ENOTEMPTY`.
 *
 * So SIGKILL is a second wait rather than a resolution. The final bound exists only so an unkillable
 * child cannot hang a suite forever; reaching it returns `reaped: false`, which callers must treat
 * as "do not touch this child's workspace" rather than as completion.
 *
 * @param {import('node:child_process').ChildProcess} daemonProcess
 * @param {Object}  [options]
 * @param {Number}  [options.sigtermGraceMs=5000] How long SIGTERM gets before SIGKILL escalation.
 * @param {Number}  [options.sigkillReapMs=5000]  How long to keep awaiting `exit` after SIGKILL.
 * @returns {Promise<{code:Number|null, signal:String|null, reaped:Boolean, outcome:String}>}
 */
export async function terminateDaemon(daemonProcess, {sigtermGraceMs = 5000, sigkillReapMs = 5000} = {}) {
    if (isProcessTerminated(daemonProcess)) {
        return {
            code   : daemonProcess?.exitCode   ?? null,
            signal : daemonProcess?.signalCode ?? null,
            reaped : true,
            outcome: REAP_OUTCOME.alreadyExited
        }
    }

    return new Promise(resolve => {
        let settled = false;

        const finish = result => {
            if (!settled) {
                settled = true;
                clearTimeout(graceTimer);
                clearTimeout(hardTimer);
                resolve(result)
            }
        };

        // The only resolution that means "the child is gone", whichever signal got it there.
        daemonProcess.once('exit', (code, signal) => {
            finish({code, signal, reaped: true, outcome: REAP_OUTCOME.exited})
        });

        const graceTimer = setTimeout(() => {
            try {
                daemonProcess.kill('SIGKILL')
            } catch {}
            // No resolve here: SIGKILL is asynchronous, so the child is still running. The `exit`
            // listener above is what completes this — that is the whole point.
        }, sigtermGraceMs);

        const hardTimer = setTimeout(() => {
            finish({code: null, signal: 'SIGKILL-timeout', reaped: false, outcome: REAP_OUTCOME.unreaped})
        }, sigtermGraceMs + sigkillReapMs);

        try {
            daemonProcess.kill('SIGTERM')
        } catch (error) {
            // The child vanished between the terminal check and the signal. Terminal either way, but
            // reported distinctly so a caller can tell it from a clean reap.
            finish({
                code   : daemonProcess.exitCode   ?? null,
                signal : daemonProcess.signalCode ?? null,
                reaped : true,
                outcome: REAP_OUTCOME.killError
            })
        }
    })
}
