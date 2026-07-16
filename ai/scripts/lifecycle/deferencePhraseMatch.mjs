/**
 * @module ai.scripts.lifecycle.deferencePhraseMatch
 * @summary Detects the linguistic "helpful assistant" deference register in an assistant turn.
 *
 * This is the phrased half of the deference instinct: strings like "do you want me driving next?"
 * hand maintainer-owned judgment back to the operator. The structural / phraseless half is not
 * catchable by phrase matching; that remains the no-hold gate and value-floor domain.
 *
 * Consumed by Stop hooks on autonomous turn-ends only. A deference phrase in live operator dialogue
 * can be a legitimate Tier-4 operator ask; the same phrase on an autonomous turn is the slip.
 */

/**
 * Tight deference phrases, grounded in live session fixtures. Deliberately excludes broad near-misses
 * like "should I", "shall I", "happy to", "no rush", and "whenever you want"; broadening requires a
 * falsifier-backed follow-up so the hook stays a mirror, not a noisy leash.
 * @type {String[]}
 */
export const DEFERENCE_PHRASES = [
    'would you like me to',
    'unless you want me',
    'want me to',
    'do you want me',
    'Your steer on',
    "if you'd rather",
    'or steer me elsewhere',
    'your call',
    'your move'
];

/**
 * The peer-identity reminder injected when a deference phrase matches on an autonomous turn-end.
 * Self-explaining at point of contact: it names the slip, the peer identity, the peer-input recovery
 * route, the domain-scoping boundary, and the friction->gold path for false positives.
 * @type {String}
 */
export const DEFERENCE_REMINDER = 'It looks like you slipped into the "helpful assistant" bias. You are a neo repo maintainer and an equal peer. If you need validation or input, you can A2A message with peers or use the ideation-sandbox skill. Domain-scoping: a phrase that itself attributes a strictly human-owned decision (merge execution, credentials, release direction) to the human is correct role-attribution and is exempt — this fired because the attachment was to a maintainer-owned, ambiguous, or agent-offered decision instead. And friction->gold applies to this hook itself: if it fired wrong - a false positive, or it reads as a leash not a mirror - open a ticket to sharpen it rather than silently absorbing it. The hook is mutable substrate, not a command.';

/**
 * Human-only-domain terms, from the identity firewall's Tier-4 enumeration: decisions the substrate
 * itself assigns to the operator — merge execution (critical gate: agents never merge), credentials,
 * release direction. A deference phrase whose CLAUSE names one of these is role-attribution (the
 * required honesty about who decides), not the helpful-assistant slip; refusing it would pressure
 * agents toward hedged prose that obscures the human gate — the worse failure.
 * @type {RegExp}
 */
const HUMAN_ONLY_DOMAIN_RE = /\bmerge(?:s|d|-eligible)?\b|\bsquash\b|\bcredentials?\b|\brelease\b|\bstamp\b/i;

/**
 * Maintainer-owned decision surfaces — the work agents decide and drive themselves (lanes, reviews,
 * tickets, designs, epics, discussions, specs, implementations). A deference phrase attaching to one
 * of these is the genuine helpful-assistant slip even when a human-owned FACT (a merge that landed,
 * a live release) sits in the same clause: historical keyword co-occurrence is not decision
 * attribution. Deliberately excludes bare `PR` — pull requests appear in both postures (an agent
 * decides its shape; the human merges it), so it carries no attachment signal on its own.
 * @type {RegExp}
 */
const MAINTAINER_DOMAIN_RE = /\blanes?\b|\bre-?reviews?\b|\breviews?\b|\btickets?\b|\bdesigns?\b|\bepics?\b|\bdiscussions?\b|\bspecs?\b|\bimplementations?\b|\brefactors?\b|\bbacklog\b/i;

/**
 * @summary Replaces markdown code spans and fences before deference phrase matching.
 * @param {String} text Assistant final-turn text.
 * @returns {String}
 */
function stripMarkdownCode(text) {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ');
}

/**
 * @summary Replaces quoted prose spans that report a phrase instead of using it.
 * @param {String} text Assistant final-turn text with code spans already removed.
 * @returns {String}
 */
function stripQuotedMentions(text) {
    return text
        .replace(/"[^"\n]*"/g, ' ')
        .replace(/(^|[^a-zA-Z0-9_])'[^'\n]*'(?=$|[^a-zA-Z0-9_])/g, '$1 ');
}

/**
 * @summary Checks whether a local match is a reported phrase rather than deference.
 * @param {String} text Searchable assistant final-turn text.
 * @param {Number} startIndex Match start index.
 * @returns {Boolean}
 */
function isReportedMentionContext(text, startIndex) {
    const prefix = text.slice(Math.max(0, startIndex - 80), startIndex).toLowerCase();

    return /\b(?:the|this|that)\s+(?:literal\s+)?(?:phrase|text|string|trigger|matched\s+text|wording)\s*$/.test(prefix) ||
           /\b(?:quoted|reported|mention(?:ed|ing)?|document(?:ed|ing)?)\s*$/.test(prefix);
}

/**
 * The exemption-ELIGIBLE deference phrases — the attribution-shaped ones, where the phrase can
 * genuinely assign a decision to the human (`your call`, `your move`, `Your steer on`). Offer-shaped
 * phrases (`would you like me to …`, `want me to …`, `do you want me …`) propose AGENT execution;
 * a human-only action as their object ("would you like me to merge this PR?") is the agent offering
 * to cross the human-only gate — the opposite of role-attribution — so they are never eligible.
 * @type {RegExp}
 */
const EXEMPTION_ELIGIBLE_PHRASE_RE = /^(?:your call|your move|your steer on)$/i;

/**
 * @summary Detects a NEGATED human-domain mention inside one segment (`not a merge decision`).
 * A negated mention is not positive attribution — the segment fires.
 * @param {String} segment Text segment to test.
 * @returns {Boolean}
 */
function isNegatedHumanMention(segment) {
    return /\b(?:not|no|never|isn'?t|wasn'?t|aren'?t|without)\b[^.!?;]*?\b(?:merge|squash|credentials?|release|stamp)/i.test(segment);
}

/**
 * @summary Classifies one attachment segment's domain signal.
 * @param {String} segment Text segment to classify.
 * @returns {('human'|'maintainer'|'competing'|null)} The decisive signal, or `null` when neutral.
 */
function classifyDomainSegment(segment) {
    const human      = HUMAN_ONLY_DOMAIN_RE.test(segment),
          maintainer = MAINTAINER_DOMAIN_RE.test(segment);

    if (human && maintainer) return 'competing';
    if (human)               return 'human';
    if (maintainer)          return 'maintainer';
    return null;
}

/**
 * @summary Checks whether a match POSITIVELY attributes a strictly human-owned decision.
 *
 * The exemption requires positive evidence, never the absence of a maintainer noun:
 *
 *  1. Only attribution-shaped phrases are eligible ({@link EXEMPTION_ELIGIBLE_PHRASE_RE}) —
 *     offer-shaped phrases propose agent execution and always fire.
 *  2. The DECISIVE segment is the phrase's own attachment: the object segment directly after the
 *     phrase (up to a comma/dash/clause break — covers phrase-internal complements like
 *     `your steer on the next lane` too) when it carries prose, else the predicate segment
 *     immediately before the phrase. There is NO wider clause-window fallback: an outer historical
 *     fact (`the merge landed, …`) can never lend authority to a neutral attachment.
 *  3. The decisive segment exempts ONLY on a pure, non-negated human-domain signal. Neutral,
 *     unenumerated, competing, maintainer, or negated segments (`not a merge decision`) all fire —
 *     ambiguity fails toward firing, mechanically.
 * @param {String} phrase Matched deference phrase.
 * @param {String} text Searchable assistant final-turn text.
 * @param {Number} startIndex Match start index.
 * @param {Number} endIndex Match end index.
 * @returns {Boolean}
 */
function isHumanOnlyDomainContext(phrase, text, startIndex, endIndex) {
    if (!EXEMPTION_ELIGIBLE_PHRASE_RE.test(phrase)) return false;

    const before       = text.slice(Math.max(0, startIndex - 120), startIndex),
          after        = text.slice(endIndex, Math.min(text.length, endIndex + 120)),
          clauseBefore = before.split(/[.!?\n;]/).pop() || '',
          clauseAfter  = after.split(/[.!?\n;]/, 1)[0]  || '';

    // The phrase's own object when present, else its immediate predicate — never the wide window.
    const objectSegment = clauseAfter.split(/[,—:()]/, 1)[0] || '',
          decisive      = /\w/.test(objectSegment)
              ? objectSegment
              : (clauseBefore.split(/[,—:()]/).filter(s => s.trim()).pop() || '');

    return classifyDomainSegment(decisive) === 'human' && !isNegatedHumanMention(decisive);
}

/**
 * @summary Checks whether a local "your call" match cites a prior operator decision.
 * @param {String} phrase Matched deference phrase.
 * @param {String} text Searchable assistant final-turn text.
 * @param {Number} startIndex Match start index.
 * @returns {Boolean}
 */
function isAttributiveCitationContext(phrase, text, startIndex) {
    if (phrase.toLowerCase() !== 'your call') {
        return false;
    }

    const prefix = text.slice(Math.max(0, startIndex - 80), startIndex).toLowerCase();

    return /\bper\s+$/.test(prefix) ||
           /\bas\s+you\s+(?:said|directed|called)\W*$/.test(prefix);
}

/**
 * @summary Returns the first deference phrase found in text, using case-insensitive boundary match.
 * @param {String} text Assistant final-turn text.
 * @param {String[]} [phrases=DEFERENCE_PHRASES]
 * @returns {String|null}
 */
export function matchDeferencePhrase(text = '', phrases = DEFERENCE_PHRASES) {
    if (typeof text !== 'string' || !text) {
        return null;
    }

    const searchableText = stripQuotedMentions(stripMarkdownCode(text));

    return phrases.find(phrase => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
              matcher = new RegExp(`(^|[^a-z0-9_])${escaped}(?=$|[^a-z0-9_])`, 'ig');
        let match;

        while ((match = matcher.exec(searchableText)) !== null) {
            const startIndex = match.index + match[1].length,
                  endIndex   = matcher.lastIndex;

            if (!isReportedMentionContext(searchableText, startIndex) &&
                !isAttributiveCitationContext(phrase, searchableText, startIndex) &&
                !isHumanOnlyDomainContext(phrase, searchableText, startIndex, endIndex)) {
                return true;
            }
        }

        return false;
    }) || null;
}

/**
 * @summary Applies the autonomous-turn carve before phrase matching.
 * @param {String} text Assistant final-turn text.
 * @param {Object} [options]
 * @param {Boolean} [options.operatorInLoop=false]
 * @returns {String|null}
 */
export function detectDeferencePhrase(text = '', {
    operatorInLoop = false
} = {}) {
    return operatorInLoop ? null : matchDeferencePhrase(text);
}

/**
 * @summary Builds the Stop-hook directive for a deference-register block.
 * @param {String|null} phrase Matched deference phrase, if known.
 * @returns {String}
 */
export function buildDeferenceReminder(phrase = null) {
    const trigger = phrase ? `\n\n(Stop-hook trigger: deference phrase "${phrase}" at turn-terminal)` : '';

    return `${DEFERENCE_REMINDER}${trigger}`;
}
