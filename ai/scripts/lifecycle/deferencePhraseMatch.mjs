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
export const DEFERENCE_REMINDER = 'It looks like you slipped into the "helpful assistant" bias. You are a neo repo maintainer and an equal peer. If you need validation or input, you can A2A message with peers or use the ideation-sandbox skill. Domain-scoping: naming a strictly human-owned decision (merge execution, credentials, release direction) as the human\'s is correct role-attribution and is exempt — this fired because the phrase attached to a decision maintainers own. And friction->gold applies to this hook itself: if it fired wrong - a false positive, or it reads as a leash not a mirror - open a ticket to sharpen it rather than silently absorbing it. The hook is mutable substrate, not a command.';

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
 * @summary Checks whether a match's DECISION ATTACHMENT names a strictly human-owned domain.
 *
 * Attachment is resolved in stages, nearest-first, and the FIRST stage carrying any domain signal
 * decides — mere keyword co-occurrence farther out cannot override the phrase's actual object:
 *
 *  1. **Object segment** — a complement directly after the phrase (`your call on the next lane`),
 *     up to the next comma/dash/clause boundary.
 *  2. **Predicate segment** — the comma/dash-delimited segment immediately before the phrase
 *     (`…, ask for the stamp, your call`).
 *  3. **Clause window** — the previous sentence/clause boundary to the next, capped at 120
 *     characters each way (natural phrasing like `the release direction is yours — ship or hold,
 *     your call` carries its signal here).
 *
 * At the decisive stage the exemption applies ONLY to a pure human-domain signal; a competing
 * signal (both domains present) or a maintainer signal fires the hook, and a fully neutral chain
 * fires too — ambiguity fails toward firing, so a historical merge/release fact in the same
 * sentence can never suppress lane/review deference.
 * @param {String} text Searchable assistant final-turn text.
 * @param {Number} startIndex Match start index.
 * @param {Number} endIndex Match end index.
 * @returns {Boolean}
 */
function isHumanOnlyDomainContext(text, startIndex, endIndex) {
    const before       = text.slice(Math.max(0, startIndex - 120), startIndex),
          after        = text.slice(endIndex, Math.min(text.length, endIndex + 120)),
          clauseBefore = before.split(/[.!?\n;]/).pop() || '',
          clauseAfter  = after.split(/[.!?\n;]/, 1)[0]  || '';

    // Stage 1: the phrase's direct object ("your call on/about/whether …") up to a segment break.
    const objectMatch  = clauseAfter.match(/^\s*(?:on|about|whether|which|for|regarding)\b[^,—:()]*/i),
          objectSignal = objectMatch ? classifyDomainSegment(objectMatch[0]) : null;
    if (objectSignal) return objectSignal === 'human';

    // Stage 2: the predicate segment immediately before the phrase.
    const predicate       = clauseBefore.split(/[,—:()]/).filter(s => s.trim()).pop() || '',
          predicateSignal = classifyDomainSegment(predicate);
    if (predicateSignal) return predicateSignal === 'human';

    // Stage 3: the full bounded clause window.
    return classifyDomainSegment(`${clauseBefore} ${clauseAfter}`) === 'human';
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
                !isHumanOnlyDomainContext(searchableText, startIndex, endIndex)) {
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
