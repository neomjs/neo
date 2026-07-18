/**
 * @summary Attention dispositions. Deliberately three-valued: "we have not decided" is a real,
 * durable answer and must not collapse into "no".
 * @member {Object<String,String>}
 */
export const ATTENTION_DISPOSITION = {
    ELIGIBLE    : 'eligible',
    INELIGIBLE  : 'ineligible',
    UNDETERMINED: 'undetermined'
};

/**
 * @summary Classifies whether an admitted occurrence is an attention-eligible community item.
 *
 * **Zero authority.** A disposition assigns no work, enters no frontier, and creates no Task — it
 * records a judgement about the occurrence, nothing more. Promotion is a separate, explicit
 * transition that this function must never pre-empt.
 *
 * The judgement is stored as its own evidence-backed field rather than derived on read, so it stays
 * separate from occurrence kind, provider actor kind, and trust projection — three things that
 * inform it but none of which alone decides it.
 *
 * Rule order is load-bearing:
 * 1. **Rostered actors first.** Internal/rostered activity may update or resolve an existing external
 *    item without minting new attention. Checking this before the bot rule keeps our own agents out
 *    of the undetermined branch, where they would accumulate as permanent unanswered questions.
 * 2. **External bots are UNDETERMINED, never inferred.** Bot eligibility is an explicit recorded
 *    disposition; guessing it from actor kind or trust tier is precisely the inference this contract
 *    forbids, so an unrecorded bot stays honestly undecided.
 * 3. **Response-bearing** is required — a label or assignment change carries no one waiting on us.
 *
 * Policy is injected, never defaulted: a silent default here would quietly redefine what the swarm
 * pays attention to.
 * @param {Object}   occurrence
 * @param {Object}   policy
 * @param {String[]} policy.responseBearingKinds Occurrence kinds that can carry someone awaiting a response.
 * @param {String[]} policy.rosteredActorIds     Internal/rostered actor ids.
 * @param {String[]} policy.botActorIds          Known bot actor ids whose disposition is not yet recorded.
 * @param {Object}   [policy.recordedBotDispositions] Explicit per-bot dispositions, when they exist.
 * @returns {{disposition: String, reason: String}}
 * @throws {Error} `ATTENTION_POLICY_REQUIRED` when policy is absent or incomplete.
 */
export function classifyAttention(occurrence, policy) {
    const {responseBearingKinds, rosteredActorIds, botActorIds, recordedBotDispositions = {}} = policy || {};

    if (!Array.isArray(responseBearingKinds) || !Array.isArray(rosteredActorIds) || !Array.isArray(botActorIds)) {
        throw new Error('ATTENTION_POLICY_REQUIRED')
    }

    const {actorId, occurrenceKind} = occurrence;

    if (!actorId) {
        return {disposition: ATTENTION_DISPOSITION.UNDETERMINED, reason: 'actor-unknown'}
    }

    if (rosteredActorIds.includes(actorId)) {
        return {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'rostered-actor'}
    }

    if (botActorIds.includes(actorId)) {
        const recorded = recordedBotDispositions[actorId];

        return recorded
            ? {disposition: recorded, reason: 'bot-disposition-recorded'}
            : {disposition: ATTENTION_DISPOSITION.UNDETERMINED, reason: 'bot-disposition-not-recorded'}
    }

    if (!responseBearingKinds.includes(occurrenceKind)) {
        return {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'not-response-bearing'}
    }

    return {disposition: ATTENTION_DISPOSITION.ELIGIBLE, reason: 'external-response-bearing'}
}
