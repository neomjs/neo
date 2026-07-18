/**
 * @summary Attention dispositions. Three-valued: an explicit reviewed disposition may record any of
 * the three, but the classifier's own computed defaults are only `eligible` or `ineligible` — v1
 * never leaves a computed row `undetermined`, it fails closed to `ineligible` with a reason.
 * @member {Object<String,String>}
 */
export const ATTENTION_DISPOSITION = {
    ELIGIBLE    : 'eligible',
    INELIGIBLE  : 'ineligible',
    UNDETERMINED: 'undetermined'
};

/**
 * @summary The provider actor-kind axis, independent of security/content trust.
 * Attention eligibility branches on this; trust tier never does.
 * @member {Set<String>}
 */
export const ACTOR_KINDS = new Set(['user', 'bot', 'organization', 'mannequin', 'enterprise-user', 'unknown']);

/**
 * @summary Classifies whether an admitted occurrence is an attention-eligible community item, per the
 * durable-community-activity v1 policy table — actor-class driven and fail-closed.
 *
 * **Zero authority.** A disposition assigns no work, enters no frontier, and creates no Task. It is a
 * recorded judgement, written in the admission transaction, distinct from occurrence kind, provider
 * actor kind, and trust projection — informed by all three, decided by none alone.
 *
 * The rules, verbatim from the v1 policy table:
 * 1. **Rostered / internal** (any actor kind): admitted for reconstruction, but **never mints new
 *    attention**. Checked first, so an internal agent is never mistaken for an external human.
 * 2. **External human** (`user`, not rostered): eligible **iff response-bearing**. First-time and
 *    trusted-repeat are identical here — trust changes prose projection, never eligibility (AC12).
 * 3. **Bot**: **not attention-eligible in v1** — the explicit least-authority default the
 *    durable-community-activity decision records. Not inferred from a list; decided by the actor kind
 *    the provider reports.
 * 4. **Organization / mannequin / enterprise-user / unknown**: **fail closed** for attention absent an
 *    explicit source-specific reviewed disposition.
 *
 * "Actor id absent from a bot list" is never treated as proof of external-human eligibility — only a
 * provider-reported `actorKind === 'user'` reaches the eligible branch. Policy is injected, never
 * defaulted.
 * @param {Object}   occurrence
 * @param {String}   occurrence.actorId
 * @param {String}   occurrence.actorKind One of {@link ACTOR_KINDS}.
 * @param {String}   occurrence.occurrenceKind
 * @param {Object}   policy
 * @param {String[]} policy.responseBearingKinds Occurrence kinds that can carry someone awaiting a response.
 * @param {String[]} policy.rosteredActorIds     Internal/rostered actor ids (the "never mints attention" set).
 * @param {Object}   [policy.recordedActorDispositions] Explicit per-actor reviewed dispositions, when they exist.
 * @returns {{disposition: String, reason: String}}
 * @throws {Error} `ATTENTION_POLICY_REQUIRED` when policy is absent or incomplete.
 * @throws {Error} `ATTENTION_INVALID_RECORDED_DISPOSITION` when an injected disposition is off-enum.
 */
export function classifyAttention(occurrence, policy) {
    const {responseBearingKinds, rosteredActorIds, recordedActorDispositions = {}} = policy || {};

    if (!Array.isArray(responseBearingKinds) || !Array.isArray(rosteredActorIds)) {
        throw new Error('ATTENTION_POLICY_REQUIRED')
    }

    const {actorId, actorKind, occurrenceKind} = occurrence;

    // An explicit reviewed disposition wins, but must be a valid three-value enum member — a
    // malformed injected policy fails loud rather than silently admitting an off-contract state.
    if (actorId && Object.prototype.hasOwnProperty.call(recordedActorDispositions, actorId)) {
        const recorded = recordedActorDispositions[actorId];

        if (!Object.values(ATTENTION_DISPOSITION).includes(recorded)) {
            throw new Error('ATTENTION_INVALID_RECORDED_DISPOSITION')
        }

        return {disposition: recorded, reason: 'explicit-reviewed-disposition'}
    }

    // Rule 1 — rostered/internal never mints attention, whatever the actor kind.
    if (actorId && rosteredActorIds.includes(actorId)) {
        return {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'rostered-actor'}
    }

    // Rule 3 — bots: explicit v1 not-eligible, decided by kind, never inferred from a list.
    if (actorKind === 'bot') {
        return {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'bot-not-attention-eligible-v1'}
    }

    // Rule 2 — external human: eligible iff response-bearing; trust is not consulted (AC12).
    if (actorKind === 'user') {
        return responseBearingKinds.includes(occurrenceKind)
            ? {disposition: ATTENTION_DISPOSITION.ELIGIBLE,   reason: 'external-response-bearing'}
            : {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'not-response-bearing'}
    }

    // Rule 4 — organization/mannequin/enterprise-user/unknown, and any unrecognized kind: fail closed.
    return {disposition: ATTENTION_DISPOSITION.INELIGIBLE, reason: 'actor-kind-not-reviewed-fail-closed'}
}
