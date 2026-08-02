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
    // Composition of the two neighbours above; listed separately because neither matches it. Catches the
    // lane-handback shape ("that is next unless you'd rather I took something else") - offering back a
    // lane the agent already owns, which §swarm_topology_anchor assigns to the agent, not the operator.
    "unless you'd rather",
    'or steer me elsewhere',
    'your call',
    'your move'
];

/**
 * The peer-identity reminder injected when a deference phrase matches on an autonomous turn-end.
 * Self-explaining at point of contact: it names the slip, the peer identity, the peer-input recovery
 * route, and the friction->gold path for false positives.
 * @type {String}
 */
export const DEFERENCE_REMINDER = 'It looks like you slipped into the "helpful assistant" bias. You are a neo repo maintainer and an equal peer. If you need validation or input, you can A2A message with peers or use the ideation-sandbox skill. And friction->gold applies to this hook itself: if it fired wrong - a false positive, or it reads as a leash not a mirror - open a ticket to sharpen it rather than silently absorbing it. The hook is mutable substrate, not a command.';

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
            const startIndex = match.index + match[1].length;

            if (!isReportedMentionContext(searchableText, startIndex) &&
                !isAttributiveCitationContext(phrase, searchableText, startIndex)) {
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
