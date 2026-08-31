/**
 * @summary Pure per-gesture claim arbiter — the session-scoped gesture/claim protocol that replaces
 * first-intersecting target resolution on the dock path (docking design record §2.8.1,
 * `learn/agentos/decisions/0029-docking-design.md`).
 *
 * One arbiter IS one gesture: {@link Neo.manager.DragCoordinator} mints an arbiter at gesture start,
 * every claim references its token, and the whole claim set dies with the gesture (terminal or
 * cancel) via {@link #reset}. The factory is deliberately dependency-free — no imports, closure
 * state only, an injectable clock — so witnesses drive the full protocol without a browser, and the
 * arbiter stays blind to windows, docks, and zones alike: callers hand it stable identities plus
 * opaque zone handles, and it hands back exactly one winner or nothing.
 *
 * Protocol semantics (all deterministic, per the contract):
 * - **Acquire-or-refresh:** the first {@link #claim} for a stable identity records its acquisition
 *   time; every subsequent claim refreshes the expiry but keeps the original acquisition — the
 *   "earliest valid claim wins" axis measures hover seniority within the gesture, so a refresh must
 *   not reset seniority. The zone handle is updated to the latest claimant so a re-embodied surface
 *   with the same stable identity never leaves a dangling reference behind.
 * - **Validity and expiry:** claims expire `claimTtlMs` after their last refresh. {@link #resolve}
 *   ignores AND prunes expired claims — staleness is the safety net for surfaces that vanish
 *   without an explicit {@link #release} (a window closing mid-gesture).
 * - **Deterministic outcomes, all three cases:** *tie* — earliest acquisition wins, with stable-id
 *   lexicographic order as the final tiebreak (claims sharing an acquisition instant stay
 *   deterministic); *stale* — ignored; *no claim* — {@link #resolve} returns `null` and the caller
 *   fails closed: no preview, no commit.
 * - **One instant per claim pass:** zones the caller evaluates against a single pointer event became
 *   hoverable simultaneously, so they carry no seniority relative to each other and MUST share one
 *   acquisition instant — that is what puts them in the tie case where the lexicographic tiebreak
 *   governs. A caller raising several claims per pass therefore samples its clock ONCE and passes
 *   that instant to every {@link #claim} of the pass; reading the clock per call instead lets a
 *   millisecond boundary falling mid-pass invent a seniority ordering, and the winner degrades to
 *   the caller's iteration order — the registration-order nondeterminism §2.8.1 exists to replace.
 *   Seniority ACROSS passes is unaffected: successive passes carry successive instants.
 *
 * Stable identity is the caller's contract: a workspace/zone identity that survives re-registration
 * and never encodes `windowId` or registration/insertion order.
 */

let gestureTokenSeq = 0;

/**
 * Creates one gesture-scoped claim arbiter.
 * @param {Object} [config]
 * @param {Number} [config.claimTtlMs=300] Claim lifetime after the last refresh, in milliseconds.
 * @param {Function} [config.now=Date.now] Injectable clock, milliseconds.
 * @returns {Object} arbiter
 * @returns {Number}   arbiter.claimCount     Live claim count (expired claims included until pruned).
 * @returns {Function} arbiter.claim          `(stableId, zone, timestamp)` acquire-or-refresh; returns the claim record.
 * @returns {Function} arbiter.passInstant    `()` → one acquisition instant to share across a claim pass.
 * @returns {Function} arbiter.release        `(stableId)` drops a claim; unknown ids are a no-op.
 * @returns {Function} arbiter.reset          Kills every claim — the gesture-terminal cleanup.
 * @returns {Function} arbiter.resolve        `()` → `{stableId, zone}` of the winning claim, or `null` (fail closed).
 * @returns {String}   arbiter.token          The gesture token every claim of this arbiter references.
 */
export function createGestureClaimArbiter({claimTtlMs = 300, now = Date.now} = {}) {
    const
        claims = new Map(),
        token  = `gesture-${++gestureTokenSeq}`;

    return {
        get claimCount() {
            return claims.size
        },

        get token() {
            return token
        },

        /**
         * Samples ONE acquisition instant for a claim pass, from this arbiter's own clock. A caller
         * evaluating several zones against a single pointer event calls this once and hands the
         * result to every {@link #claim} of that pass, so the zones tie and resolve lexicographically
         * instead of by the caller's iteration order. Reading a clock of the caller's own would
         * defeat the injected-clock witnesses, which is why the instant comes from here.
         * @returns {Number}
         */
        passInstant() {
            return now()
        },

        /**
         * Acquire-or-refresh the claim for one stable identity. Seniority survives a refresh
         * ONLY while the claim is still live: an existing record whose expiry has elapsed is
         * absent by contract (stale = ignored), so re-claiming after expiry is a REACQUISITION —
         * a new acquisition time, competing under the tie/age rules as a new claim. The expiry
         * boundary is `expiresAt >= now` = live, matching the resolver's prune condition exactly.
         *
         * **The pass instant is the SENIORITY axis and nothing else.** It orders claims against each
         * other; it does not say when this call happened. Liveness and expiry are therefore read from
         * the real clock at refresh, never from `timestamp` — a pass is not guaranteed to be short,
         * and deriving `expiresAt` from its start makes a claim refreshed more than `claimTtlMs` into
         * a slow pass arrive ALREADY EXPIRED. That inverts the one property the TTL exists to state:
         * a claim lives `claimTtlMs` after its LAST REFRESH. The same read also decides `live`, so an
         * existing record that expired mid-pass is correctly seen as stale rather than pinned alive by
         * a stale instant.
         *
         * @param {String} stableId
         * @param {Object} zone Opaque target handle, returned verbatim by a winning resolve.
         * @param {Number} [timestamp=now()] The claim pass's acquisition instant. A caller raising
         * several claims for ONE pointer event passes the same instant to all of them, so they
         * compete as a tie and resolve lexicographically; the default is for single-claim callers,
         * for whom a per-call clock read and a per-pass one are the same thing.
         * @returns {Object} the live claim record `{acquiredAt, expiresAt, stableId, token, zone}`
         */
        claim(stableId, zone, timestamp = now()) {
            const
                // Real time, sampled once per call: liveness and expiry are wall-clock facts.
                refreshedAt = now(),
                existing    = claims.get(stableId),
                live        = existing != null && existing.expiresAt >= refreshedAt,
                record      = {
                    // Seniority: the pass instant on acquisition, carried forward across a refresh.
                    acquiredAt: live ? existing.acquiredAt : timestamp,
                    // Lifetime: always measured from THIS refresh.
                    expiresAt : refreshedAt + claimTtlMs,
                    stableId,
                    token,
                    zone
                };

            claims.set(stableId, record);
            return record
        },

        /**
         * @param {String} stableId
         */
        release(stableId) {
            claims.delete(stableId)
        },

        reset() {
            claims.clear()
        },

        /**
         * Resolves the gesture's single winning target: earliest valid acquisition, stable-id
         * lexicographic tiebreak, expired claims ignored and pruned, no valid claim → `null`.
         * @returns {Object|null} `{stableId, zone}` or `null` when nothing validly claims
         */
        resolve() {
            const timestamp = now();

            let winner = null;

            for (const record of claims.values()) {
                if (record.expiresAt < timestamp) {
                    claims.delete(record.stableId);
                    continue
                }

                if (
                    !winner ||
                    record.acquiredAt < winner.acquiredAt ||
                    (record.acquiredAt === winner.acquiredAt && record.stableId < winner.stableId)
                ) {
                    winner = record
                }
            }

            return winner ? {stableId: winner.stableId, zone: winner.zone} : null
        }
    }
}
