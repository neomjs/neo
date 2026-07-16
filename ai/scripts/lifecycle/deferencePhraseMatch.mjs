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
 * Human-only-domain token source, from the identity firewall's Tier-4 enumeration: decisions the
 * substrate itself assigns to the operator — merge execution (critical gate: agents never merge),
 * credentials, release direction. ONE vocabulary source builds both the presence regex and the
 * copular-ownership relation, so the two can never drift. A phrase that ATTRIBUTES one of these
 * decisions to the human is role-attribution (the required honesty about who decides), not the
 * helpful-assistant slip; refusing it would pressure agents toward hedged prose that obscures the
 * human gate — the worse failure.
 * @type {String}
 */
const HUMAN_ONLY_TOKENS = "merge(?:s|d|-eligible)?|squash|credentials?|release|stamp";

/**
 * Human-only-domain presence test, built from {@link HUMAN_ONLY_TOKENS}.
 * @type {RegExp}
 */
const HUMAN_ONLY_DOMAIN_RE = new RegExp(`\\b(?:${HUMAN_ONLY_TOKENS})\\b`, 'i');

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
 * The negation vocabulary — contractions and modals included, with BOTH ASCII and typographic
 * apostrophes (`isn't` / `isn’t`). Applied relation-scoped, never segment-wide: negation kills an
 * attribution only when it sits INSIDE the relation that would supply it.
 * @type {String}
 */
const NEGATION_WORDS = "(?:not|no|never|neither|nor|don['’]?t|doesn['’]?t|didn['’]?t|can['’]?t|cannot|couldn['’]?t|won['’]?t|wouldn['’]?t|shouldn['’]?t|mustn['’]?t|isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t|without)";

/**
 * @summary Tests one text span for negation ({@link NEGATION_WORDS}).
 * @param {String} span Text span to test.
 * @returns {Boolean}
 */
function isNegatedSpan(span) {
    return new RegExp(`\\b${NEGATION_WORDS}\\b`, 'i').test(span);
}

/**
 * @summary OBJECT-form attribution: the eligible phrase's own possessive (`your call/move/steer`)
 * already assigns the decision — the exemption question reduces to whether the phrase's OBJECT is
 * a pure human-only decision. The object runs from the phrase to the clause end (coordinations
 * intact — a comma before `or`/`whether` continues the SAME object, so a mixed continuation is
 * never truncated away). It exempts only when it:
 *
 *  - names a human-only domain and NO maintainer surface;
 *  - contains no first-person agent clause (`… or whether I update docs` is mixed authority);
 *  - contains no negation (`whether the merge should not proceed` fires);
 *  - coordinates only human-anchored or bare single-word alternatives (`merge or hold` exempts;
 *    `merge or update the docs` coordinates an unenumerated agent task and fires).
 * @param {String} objectText The phrase's object span (clause-bounded, coordinations intact).
 * @returns {Boolean}
 */
function isHumanDecisionObject(objectText) {
    if (!/\w/.test(objectText))                    return false;
    if (!HUMAN_ONLY_DOMAIN_RE.test(objectText))    return false;
    if (MAINTAINER_DOMAIN_RE.test(objectText))     return false;
    if (isNegatedSpan(objectText))                 return false;
    if (/\b(?:I|me|we)\b/.test(objectText))        return false;

    // Coordinated alternatives: every `or`-branch must be human-anchored or a bare option word.
    for (const alternative of objectText.split(/\bor\b/i).map(s => s.trim())) {
        if (!alternative) continue;
        if (HUMAN_ONLY_DOMAIN_RE.test(alternative)) continue;
        // A bare counter-option of the same decision ("hold", "now") — at most one content word.
        if (alternative.replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(w => w && !/^(?:the|a|an|to|now|it|this|that)$/i.test(w)).length <= 1) continue;
        return false;
    }

    return true;
}

/**
 * @summary PREDICATE-form attribution: with no object after the phrase, the predicate before it
 * must POSITIVELY assign the open decision to the human through one of three explicit relations —
 * loose token co-presence (`You merged it yesterday`, `The merge broke your build`, `the
 * merge-eligible label disappeared`) never exempts:
 *
 *  1. **Copular ownership** — a human-domain noun and `yours` / `your <noun>` bound in ONE copular
 *     span (`the merge is your decision`, `the credentials are yours to rotate`); negation INSIDE
 *     that span kills it (`the merge isn't yours` — either apostrophe), while negation elsewhere
 *     in the predicate does not (`the merge is yours though CI is not green` still exempts).
 *  2. **All-human option list** — an alternation where EVERY branch is human-anchored or a bare
 *     option word (`merge on the exception or ask for the stamp`, `merge now or hold`); one
 *     unenumerated task branch (`merge or update the docs`) fires.
 *  3. **Copular eligibility** — `is/remains merge-eligible` as a predicate adjective (the decision
 *     is open); attributive uses (`the merge-eligible label`) are facts about labels and fire.
 * @param {String} predicate The comma/dash-delimited segment immediately before the phrase.
 * @param {String} clauseBefore The full clause before the phrase (copular relations may span
 *        segment punctuation, e.g. `the merge is yours though CI is not green`).
 * @returns {Boolean}
 */
function isHumanDecisionPredicate(predicate, clauseBefore) {
    // Relation 1: copular ownership — search the WHOLE preceding clause so an unrelated trailing
    // segment cannot hide it; negation is scoped to the copular span itself.
    const copular = clauseBefore.match(new RegExp(
        `\\b(?:${HUMAN_ONLY_TOKENS})\\b[^.!?;]{0,40}?\\b(?:is|are|was|were|stays?|remains?)\\b[^.!?;,]{0,30}?\\b(?:yours|your\\s+\\w+)`, 'i'));

    if (copular && !isNegatedSpan(copular[0])) return true;

    // Relation 3: copular eligibility — `is/remains merge-eligible` as predicate adjective.
    if (/\b(?:is|are|was|remains?|stays?)\s+(?:merge-eligible|eligible)\b/i.test(clauseBefore) &&
        !isNegatedSpan(clauseBefore)) return true;

    // Relation 2: all-human option list within the immediate predicate.
    if (/\bor\b/i.test(predicate) && HUMAN_ONLY_DOMAIN_RE.test(predicate) &&
        !MAINTAINER_DOMAIN_RE.test(predicate) && !isNegatedSpan(predicate) &&
        !/\b(?:I|me|we)\b/.test(predicate)) {
        return predicate.split(/\bor\b/i).map(s => s.trim()).every(alternative =>
            !alternative ||
            HUMAN_ONLY_DOMAIN_RE.test(alternative) ||
            alternative.replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(w => w && !/^(?:the|a|an|to|now|it|this|that)$/i.test(w)).length <= 1
        );
    }

    return false;
}

/**
 * @summary Checks whether a match POSITIVELY attributes a strictly human-owned decision — as a
 * grammatical RELATION, never as token co-presence:
 *
 *  1. Only attribution-shaped phrases are eligible ({@link EXEMPTION_ELIGIBLE_PHRASE_RE}) —
 *     offer-shaped phrases propose agent execution and always fire.
 *  2. **Object-attached form** ({@link isHumanDecisionObject}): the phrase's own possessive
 *     supplies the attribution (`Your call on the merge.` exempts), so the object — clause-bounded,
 *     coordinations intact, reachable through `on/about/whether` or `:`/`—` punctuation — must be a
 *     pure, negation-free, human-only decision.
 *  3. **Predicate-attached form** ({@link isHumanDecisionPredicate}): the predicate must carry an
 *     explicit relation (copular ownership · all-human option list · copular eligibility).
 *     Historical facts with loose `you/or/whether/eligible` tokens fire.
 *
 * There is NO wider clause-window fallback, and ambiguity fails toward firing, mechanically.
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

    // Object-attached: the object spans the WHOLE clause after the phrase (coordinations intact);
    // leading complement punctuation (`:`, `—`, a comma before `whether`) attaches, so
    // `Your call: whether to merge.` and `Your move — merge or hold.` reach their objects.
    const objectText = clauseAfter.replace(/^[\s,:—-]+/, '');

    if (/\w/.test(objectText)) {
        return isHumanDecisionObject(objectText);
    }

    // Predicate-attached: the segment immediately before the phrase + the full clause for
    // copular relations that span segment punctuation.
    const predicate = clauseBefore.split(/[,—:()]/).filter(s => s.trim()).pop() || '';

    return isHumanDecisionPredicate(predicate, clauseBefore);
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
