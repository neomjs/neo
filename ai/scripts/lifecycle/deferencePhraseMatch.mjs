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
 * @plane in-plane
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
 * The tokens that may sit between a citation anchor and the phrase it attributes.
 *
 * The exemption used to be adjacency-anchored (`/\bper\s+$/`), so it matched only the citation-FREE
 * `per your call` and fired on the form §critical_gates #1 mandates — naming the gate that makes a merge
 * the operator's decision. Satisfying that gate and passing this detector were therefore in tension, and
 * the tension resolved the wrong way: the honest phrasing tripped while the phrasing that passed cited
 * nothing.
 *
 * An allowlist, deliberately not a wildcard. Accepting `per` anywhere in the 80-character window would
 * exempt real deference that happens to cite something earlier — the genuine slip this detector exists to
 * catch. Ordinary prose between the anchor and the phrase still fires.
 *
 * Whitespace alone must be able to bridge: a backticked citation is already replaced by a space in
 * `stripMarkdownCode`, so the idiomatic `` per `§critical_gates #1` that's your call `` reaches this
 * predicate with its citation erased.
 *
 * Checked token-by-token rather than as one starred alternation. The alternation form
 * (`/^(?:…|\d+|#\d+|…)*$/`) had AMBIGUOUS alternatives — a run of digits can be partitioned between
 * `\d+` and `#\d+` in exponentially many ways, so a long numeric run drove catastrophic backtracking.
 * CodeQL caught it on this very change (alert 119, "many repetitions of '0'"). Splitting first makes each
 * token match a single anchored pattern with no outer quantifier, which is linear by construction — the
 * separator set is the same one that used to live inside the alternation.
 * @type {RegExp}
 */
const CITATION_BRIDGE_TOKEN = /^(?:§[\w.-]+|#\d+|\d+|gate|rule|that'?s|that|it'?s|is)$/;

/**
 * Splits a bridge into tokens. Empty tokens are expected — a bridge of pure separators (`': '`, or the
 * whitespace left where a backticked citation was) splits to nothing but empties, and must pass.
 * @type {RegExp}
 */
const CITATION_BRIDGE_SEPARATORS = /[\s,;:.()[\]–—-]+/;

/**
 * @summary Checks whether every token between a citation anchor and the phrase is citation-shaped.
 * @param {String} bridge Text between the anchor and the phrase.
 * @returns {Boolean}
 */
function isCitationBridge(bridge) {
    return bridge.split(CITATION_BRIDGE_SEPARATORS)
        .every(token => token === '' || CITATION_BRIDGE_TOKEN.test(token));
}

/**
 * Anchors a citation of a prior operator decision. Matched RIGHTMOST — the greedy head pushes the anchor
 * as late as possible, so `per your call, but honestly, your call?` is judged on the nearest anchor and
 * the trailing deferential use still fires.
 * @type {RegExp}
 */
const CITATION_ANCHOR = /^[\s\S]*\b(?:per|as\s+you\s+(?:said|directed|called))\b([\s\S]*)$/;

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

    const prefix  = text.slice(Math.max(0, startIndex - 80), startIndex).toLowerCase(),
          anchored = CITATION_ANCHOR.exec(prefix);

    return anchored !== null && isCitationBridge(anchored[1]);
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
