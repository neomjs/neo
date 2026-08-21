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
 *   lexicographic order as the final tiebreak (two claims in the same clock millisecond stay
 *   deterministic); *stale* — ignored; *no claim* — {@link #resolve} returns `null` and the caller
 *   fails closed: no preview, no commit.
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
 * @returns {Function} arbiter.claim          `(stableId, zone)` acquire-or-refresh; returns the claim record.
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
         * Acquire-or-refresh the claim for one stable identity. Seniority survives a refresh
         * ONLY while the claim is still live: an existing record whose expiry has elapsed is
         * absent by contract (stale = ignored), so re-claiming after expiry is a REACQUISITION —
         * a new acquisition time, competing under the tie/age rules as a new claim. The expiry
         * boundary is `expiresAt >= now` = live, matching the resolver's prune condition exactly.
         * @param {String} stableId
         * @param {Object} zone Opaque target handle, returned verbatim by a winning resolve.
         * @returns {Object} the live claim record `{acquiredAt, expiresAt, stableId, token, zone}`
         */
        claim(stableId, zone) {
            const
                timestamp = now(),
                existing  = claims.get(stableId),
                live      = existing != null && existing.expiresAt >= timestamp,
                record    = {
                    acquiredAt: live ? existing.acquiredAt : timestamp,
                    expiresAt : timestamp + claimTtlMs,
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
