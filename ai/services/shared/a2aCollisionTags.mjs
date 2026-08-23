/**
 * @module ai/services/shared/a2aCollisionTags
 * @summary The single structural reader for A2A collision-prevention tags — one definition, shared
 * by every consumer that must separate "this message IS a claim" from "this message MENTIONS claims".
 *
 * A SET, not a regex, because a census of the live broadcast corpus showed the class is wider than
 * `[lane-claim]` and grows: a review SEAT is claimable — an observed collision had two families claim
 * the same seat on the same head 18 minutes apart — and a RELEASE is exactly as collision-relevant as
 * a claim, since silencing it leaves a free lane looking taken. Adding a member must never require
 * editing a matcher.
 *
 * Centralized here (the `storeWriteGuard` precedent) because the class definition had already been
 * copy-pasted into two services, and a fix in one place left the other wrong: the wake guard was
 * repaired while a fleet-activity copy of the old anchored regex kept undercounting live claims.
 * A tag that lives in two places drifts.
 *
 * **The mailbox wake seam is no longer a consumer.** `MailboxService` once used this reader to pick
 * which broadcasts default to quiet; `AGENT:*` fan-out is now quiet unconditionally, so that seam
 * needs no vocabulary and asks nothing here. This module is NOT dead: `fleetA2AActivityAdapter`
 * still reads it to identify lane claims, which is a question about what a message IS, not about
 * how loudly it should arrive. That is the durable use — the classification outlived the delivery
 * policy that first needed it, which is the argument for centralizing it rather than inlining a
 * matcher at the seam.
 */

/**
 * The collision-prevention tag vocabulary. PRIVATE to this module — the consumed contract is the
 * reader below, never the Set: an exported mutable Set lets any importer rewrite every consumer's
 * classifier at once (`.delete()` is a silent global veto). Consumers decide per-surface how WIDE
 * their own question is (fleet activity counts only `lane-claim`) by comparing against the returned
 * tag name.
 * @type {Set<String>}
 */
const COLLISION_PREVENTION_TAGS = new Set([
    'lane-claim',      // a work lane
    'review-claim',    // a review seat — same collision, different vocabulary
    'claim-corrected', // a RELEASE: the lane is free again
    'drive-claimed'    // an ideation/coordination drive
]);

/**
 * @summary Returns the collision-prevention tag a message carries, or `null`.
 *
 * **Structural, never lexical.** The predecessor was `/^\s*\[lane-claim\]/i` and it was wrong twice
 * over: `^`-anchored, so the fleet's own `[ticket-created][lane-claim][#N]` convention walked past it —
 * 8 of 15 live claims unguarded — and substring-matching would have been worse, forcing every message
 * *discussing* lane-claims to wake. The predicate must separate "this message IS a claim" from
 * "this message MENTIONS claims", which no subject regex can: both contain the same characters.
 *
 * So a tag counts only inside a bracket run that OPENS a segment. Segments split on the separators the
 * fleet actually uses to concatenate two announcements into one subject (`·`, `|`, newline), which is
 * why a trailing `… · [ticket-created][lane-claim][#N] …` still registers while `the [lane-claim] guard`
 * in prose does not.
 *
 * `taggedConcepts` is checked FIRST and is the preferred signal — it is declared data rather than prose
 * a parser must interpret. The subject path is the transitional fallback for senders that carry no
 * structural signal; it is not the contract.
 *
 * @param {Object}   args
 * @param {String}   [args.subject='']
 * @param {String[]} [args.taggedConcepts=[]]
 * @returns {String|null} the matched tag name, or `null`
 */
export function collisionPreventionTag({subject = '', taggedConcepts = []} = {}) {
    for (const concept of taggedConcepts) {
        const name = String(concept).trim().toLowerCase();

        if (COLLISION_PREVENTION_TAGS.has(name)) {
            return name;
        }
    }

    for (const segment of String(subject).split(/[·|\n]/)) {
        const run = segment.match(/^\s*(?:\[[^\]]*\]\s*)+/);

        if (!run) {
            continue;
        }

        for (const match of run[0].matchAll(/\[([^\]]*)\]/g)) {
            const name = match[1].trim().toLowerCase();

            if (COLLISION_PREVENTION_TAGS.has(name)) {
                return name;
            }
        }
    }

    return null;
}
