/**
 * @module ai/daemons/shared/daemonExit
 * @summary The exit-code contract every long-lived daemon owes its supervisor.
 *
 * **The defect this closes.** All four long-lived daemons — orchestrator, embed, message, wake —
 * routed their `uncaughtException` handler into the same `cleanup()` their signal handlers use, and
 * that `cleanup()` called a bare `process.exit()`. Node's `process.exit()` with no argument exits
 * **0**. So a crash was reported to the container runtime as SUCCESS, indistinguishable from an
 * operator stopping the service.
 *
 * A restart policy brings the daemon back either way, which is precisely why this survived for so
 * long: **the loss is not availability, it is attribution.** An external CPU-only plane showed
 * `restartCount: 12` with `exitCode: 0`, `oomKilled: false` and `error: null` — readings that say
 * "somebody stopped it twelve times" — beside a self-heal ledger reading `total: 0`, no events ever.
 * Twelve probable crashes invisible to everything keyed on a non-zero exit, while the stack traces
 * sat in the log seconds before each exit and nobody went looking, because the exit code said there
 * was nothing to find.
 *
 * **Both codes are the contract, not just the failure one.** A signal-initiated stop is SUCCESS and
 * must stay `0`. A repair that set every exit non-zero would satisfy the obvious test and make every
 * graceful shutdown look like a crash — strictly worse than the defect, because it would train
 * operators to ignore the signal we just built.
 *
 * **Why this is a module and not four literals.** Three of the four `cleanup()` bodies were already
 * textually identical, and this defect is what four independent copies of an implicit convention
 * produce. Single-sourcing makes the contract assertable by a spec rather than by reading four files
 * and trusting your eyes.
 *
 * **Why a constant and not a config leaf.** An exit code is a contract with the process supervisor,
 * not a deployment preference. A plane that could configure "what a crash reports" could configure
 * the signal away — and the reactive-config leaf model exists for values a deployment legitimately
 * varies. No leaf is introduced here deliberately.
 *
 * **The positional-argument trap this exists to keep visible.** `process.on('SIGINT', cleanup)`
 * invokes the listener with the **signal name**, and `process.on('exit', cleanup)` invokes it with
 * the **exit code**. A `cleanup(exitCode = 0)` wired directly to either would therefore receive
 * `'SIGTERM'` or a runtime-chosen number rather than the intended code. Every registration must pass
 * its code explicitly — `() => cleanup(DAEMON_EXIT_OK)` — and that wrapping is load-bearing, not a
 * style choice.
 *
 * **Why an `exit` listener must RELEASE and never exit — the asymmetry, measured.** This is stated
 * here once so the four daemons do not each re-derive it, and because an earlier version of those
 * comments asserted the opposite and was wrong:
 *
 * ```js
 * process.on('exit', () => { process.exit();  }); process.exit(1);  // → exits 1  (status RETAINED)
 * process.on('exit', () => { process.exit(0); }); process.exit(1);  // → exits 0  (status OVERRIDDEN)
 * ```
 *
 * A **bare** `process.exit()` inside an `exit` listener keeps the already-selected status, so wiring
 * that predates an explicit code was safe. An **explicit** `process.exit(0)` overrides it. Passing a
 * code is exactly what this contract requires, so `process.on('exit', cleanup)` becomes unsafe *the
 * moment `cleanup` takes one* — it would reset every crash exit to success. The contrast is the
 * point: knowing only "bare is safe" is what leads someone to wire `cleanup(DAEMON_EXIT_OK)` onto
 * `exit` and reintroduce the defect. Register a release-only function there instead.
 */

/**
 * Exit code for a deliberate, signal-initiated shutdown. An operator stopping a daemon is success.
 * @type {Number}
 */
export const DAEMON_EXIT_OK = 0;

/**
 * Exit code for a daemon terminating because of an unhandled error.
 *
 * Deliberately distinct from {@link DAEMON_EXIT_OK} so a supervisor, a restart-policy audit, or a
 * human reading `docker inspect` can tell a crash from a stop without correlating logs by timestamp.
 * @type {Number}
 */
export const DAEMON_EXIT_CRASH = 1;
