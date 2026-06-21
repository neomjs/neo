/**
 * @module ai/services/memory-core/capSessionsForSweep
 * @summary Bounds how many sessions a single summary sweep drains before the child exits and
 * releases the heavy-maintenance lease.
 *
 * `SessionService.summarizeSessions` otherwise drains the entire drift list in one child run, holding
 * the exclusive heavy-maintenance lease for the whole batch — starving `dream` / `backup` /
 * `memory-summary-backfill`, which only win the lease at a release boundary (the fair picker, see
 * `learn/agentos/decisions/0022-heavy-maintenance-scheduling-fairness.md`). Capping the per-sweep
 * count yields release boundaries frequently, so the picker interleaves the rest of the REM chain.
 *
 * The drift sweep is self-continuing — the next sweep re-derives the remaining sessions — so capping
 * CHUNKS the backlog, it never drops work.
 */

/**
 * @summary Caps a session list to its first `maxPerSweep` entries when that is a positive integer;
 * otherwise returns the list unchanged (an unset / zero / non-integer cap means "no bound").
 * Pure — no I/O, no `aiConfig` mutation — so it is unit-testable in isolation.
 * @param {Array} sessions The full drift list from `findSessionsToSummarize`.
 * @param {Number} maxPerSweep The per-sweep cap (read at the use site as `aiConfig.maxSessionsPerSummarySweep`).
 * @returns {Array} The capped (or unchanged) list.
 */
export function capSessionsForSweep(sessions, maxPerSweep) {
    return Number.isInteger(maxPerSweep) && maxPerSweep > 0
        ? sessions.slice(0, maxPerSweep)
        : sessions;
}
