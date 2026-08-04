/**
 * @module test/playwright/integration/helpers/terminateDaemon
 * @summary Terminates a spawned daemon and resolves only once it has actually been REAPED.
 *
 * Extracted so the contract can be witnessed without the integration suite's native dependencies,
 * and so its timings can be injected — the failure paths below are the interesting ones, and a
 * witness that had to wait the production grace period would cost ten seconds per case.
 *
 * **`reaped: true` is only ever derived from observed terminal state.** Three things look like
 * proof of death and are not: `kill()` returning, `kill()` throwing, and `exitCode` being read on
 * its own. A child killed by a signal reports `exitCode === null` and `signalCode === 'SIGKILL'`, so
 * `exitCode !== null` reads a successfully-reaped daemon as still running — wrong in both
 * directions, since it fails a healthy teardown and sends an already-dead child down the full wait.
 * A failed signal delivery is not a death at all: the process is very often still running.
 */

/**
 * The terminal states a termination attempt can reach. `reaped` is carried explicitly from the
 * `exit` event rather than re-derived from the child afterwards, because every derivation from
 * `exitCode` alone misclassifies the signal case.
 *
 * `killError` means a signal could not be delivered AND termination was never observed, so it
 * carries `reaped: false`. A delivery failure that turns out to have raced a real exit resolves as
 * `alreadyExited` instead, because in that case the terminal fields prove it.
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
        let deliveryFailed = false,
            graceTimer     = null,
            hardTimer      = null,
            settled        = false;

        const
            /** The child's own terminal fields, read at the moment they are trusted — never assumed. */
            terminalResult = () => ({
                code   : daemonProcess.exitCode   ?? null,
                signal : daemonProcess.signalCode ?? null,
                reaped : true,
                outcome: REAP_OUTCOME.alreadyExited
            }),

            finish = result => {
                if (!settled) {
                    settled = true;
                    clearTimeout(graceTimer);
                    clearTimeout(hardTimer);
                    daemonProcess.removeListener('error', onDeliveryFailure);
                    resolve(result)
                }
            };

        /**
         * A signal that could not be delivered says nothing about whether the child is alive — EPERM
         * against a live process is the ordinary case. So the terminal fields are re-read rather than
         * assumed, and if they do not prove termination this returns WITHOUT resolving, leaving
         * `exit` or the hard bound to decide.
         */
        function onDeliveryFailure() {
            deliveryFailed = true;

            isProcessTerminated(daemonProcess) && finish(terminalResult())
        }

        // Armed BEFORE the terminal state is re-read below. Node reports an undeliverable signal by
        // emitting `error` on the child, and an `error` with no listener is rethrown by EventEmitter
        // — which is how a failed delivery surfaced as an exception rather than as a live child.
        daemonProcess.once('exit', (code, signal) => {
            finish({code, signal, reaped: true, outcome: REAP_OUTCOME.exited})
        });

        daemonProcess.on('error', onDeliveryFailure);

        // Re-read AFTER arming, because these are two separate reads of the same fact. An exit
        // emitted before the listener existed leaves no event to catch — nothing re-emits it — and
        // only these fields still record it. Measured: a listener armed even one event-loop turn
        // late misses the exit outright and waits out the full bound. Arming first makes that
        // ordering unreachable rather than merely unlikely.
        if (isProcessTerminated(daemonProcess)) {
            finish(terminalResult());
            return
        }

        graceTimer = setTimeout(() => {
            try {
                daemonProcess.kill('SIGKILL')
            } catch {
                onDeliveryFailure()
            }
            // No resolve here: SIGKILL is asynchronous, so the child is still running. The `exit`
            // listener above is what completes this — that is the whole point.
        }, sigtermGraceMs);

        hardTimer = setTimeout(() => {
            finish({
                code   : null,
                signal : 'SIGKILL-timeout',
                reaped : false,
                outcome: deliveryFailed ? REAP_OUTCOME.killError : REAP_OUTCOME.unreaped
            })
        }, sigtermGraceMs + sigkillReapMs);

        try {
            daemonProcess.kill('SIGTERM')
        } catch {
            onDeliveryFailure()
        }
    })
}
