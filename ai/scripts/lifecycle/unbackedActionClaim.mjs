/**
 * @summary Detects a turn-terminal claim of imminent own-action that no tool call in the same turn backs.
 *
 * The sibling detector in `deferencePhraseMatch.mjs` catches the INTERROGATIVE register — asking
 * permission. This one catches the opposite shape with the same root: announcing an action as though
 * it were underway (`Picking up the next lane now.`) and then ending the turn without taking it.
 * Both are the helpful-assistant prior; only the grammar differs, which is why a phrase list tuned
 * for questions cannot see this one.
 *
 * **The signal is a CORRELATION, never a vocabulary.** A sentence claiming imminent action is not a
 * defect — it is correct narration when the turn contains the work. The defect is the claim with
 * nothing behind it, so detection needs one fact the text cannot supply: how many tool calls the turn
 * actually made. That is why `toolCallCount` is a required input rather than an option, and why a
 * novel wording absent from every list still matches: the verb only has to be a gerund.
 *
 * Three shapes are deliberately NOT flagged, each because it is legitimate:
 *
 * 1. **A claim about a later turn.** `Next turn I will read it.` / a `lane-state:` handoff at a
 *    sunset boundary are the documented way to hand off. The defect is claiming action is happening
 *    NOW while ending; a future tense is an honest promise, not a costume.
 * 2. **A report of completed work.** `Running the suite showed 3 failures.` is gerund-initial and
 *    describes the past. Requiring a now-marker on gerund-initial clauses separates the report from
 *    the announcement without a verb list.
 * 3. **Narration backed by the work.** Any claim at all, when `toolCallCount > 0`. Flagging that
 *    would train agents to stop saying what they are doing, which is strictly worse than the defect:
 *    silent correct work is unreviewable.
 */

const
    // Present progressive in first person: the action is asserted as underway. Shape, not vocabulary —
    // the capture group admits ANY `-ing` verb, so wording absent from every phrase list still matches.
    FIRST_PERSON_PROGRESSIVE = /\b(?:I'?m|I am|we'?re|we are)\s+(?:just\s+|now\s+|already\s+)?([a-z]+ing)\b/i,
    // A gerund-headed clause opening a sentence (`Picking up the next lane now.`). Alone this also
    // matches reports of finished work, so it is gated on a now-marker below.
    GERUND_INITIAL           = /^(?:now\s+|then\s+|next\s+up[,:]?\s+)?([A-Za-z]+ing)\b/,
    // Presents the action as happening at this instant, which is what makes an empty turn a lie.
    NOW_MARKER               = /\b(?:now|right\s+now|immediately|as\s+we\s+speak|starting\s+(?:now|on))\b/i,
    // Any of these move the claim into a LATER turn, where it is a legitimate handoff.
    FUTURE_MARKER            = /\b(?:will|'ll|going\s+to|gonna|next\s+turn|next\s+session|later|tomorrow|once\s+\w+|after\s+\w+|when\s+\w+)\b/i,
    // The documented sunset handoff line — never a defect, whatever its verb shape.
    LANE_STATE_LINE          = /^\s*(?:lane-state|laneContinuation)\s*:/i,
    FENCED_BLOCK             = /```[\s\S]*?```/g,
    INLINE_CODE              = /`[^`\n]*`/g,
    BLOCKQUOTE_LINE          = /^\s*>/;

/**
 * @summary Removes fenced blocks and inline code so a quoted example never reads as a live claim.
 * @param {String} text
 * @returns {String}
 * @private
 */
function stripCode(text) {
    return text.replace(FENCED_BLOCK, ' ').replace(INLINE_CODE, ' ')
}

/**
 * @summary Returns the turn-terminal region — the final non-empty paragraph.
 *
 * The defect is specifically at turn-terminal: a mid-response "picking up X now" followed by the work
 * is ordinary narration. Scoping to the last paragraph is what keeps this from flagging a response
 * that announces and then delivers within the same turn.
 * @param {String} text
 * @returns {String}
 * @private
 */
function terminalRegion(text) {
    const paragraphs = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    return paragraphs.length ? paragraphs[paragraphs.length - 1] : ''
}

/**
 * @summary Splits a region into sentences, dropping blockquotes and handoff lines.
 * @param {String} region
 * @returns {String[]}
 * @private
 */
function candidateSentences(region) {
    return region.split('\n')
        .filter(line => !BLOCKQUOTE_LINE.test(line) && !LANE_STATE_LINE.test(line))
        .join(' ')
        .split(/(?<=[.!?])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean)
}

/**
 * @summary Tests whether one sentence asserts an own-action as happening NOW.
 * @param {String} sentence
 * @returns {Boolean}
 * @private
 */
function assertsImminentAction(sentence) {
    if (FUTURE_MARKER.test(sentence)) return false;
    if (FIRST_PERSON_PROGRESSIVE.test(sentence)) return true;
    return GERUND_INITIAL.test(sentence) && NOW_MARKER.test(sentence)
}

/**
 * @summary Names the terminal imminent-action claim that no tool call in the turn backs.
 *
 * Returns `null` whenever the turn did any work — the correlation, not the wording, is the finding.
 * @param {String} [text=''] The final assistant text of the turn.
 * @param {Object} options
 * @param {Number} options.toolCallCount Tool calls made in THIS turn. Required: without it the
 * function would be a phrase matcher, which is the defect this module exists to avoid.
 * @returns {{claim: String}|null} The offending sentence, so the agent can act rather than re-read
 * its own paragraph, or `null` when there is nothing unbacked.
 */
export function detectUnbackedActionClaim(text = '', {toolCallCount} = {}) {
    if (!Number.isInteger(toolCallCount)) {
        throw new TypeError('detectUnbackedActionClaim requires an integer `toolCallCount` — the correlation is the signal.')
    }
    if (toolCallCount > 0) return null;

    const claim = candidateSentences(terminalRegion(stripCode(text))).find(assertsImminentAction);
    return claim ? {claim} : null
}

/**
 * @summary Builds the reminder naming WHICH claim went unbacked.
 * @param {String} claim
 * @returns {String}
 */
export function buildUnbackedActionReminder(claim = '') {
    return `You ended the turn asserting an action was underway — "${claim}" — and the turn contains no tool call that took it. Announcing is not executing: either do the thing now, or hand it off explicitly as a next-turn lane-state. Stating intent without execution is the deference slip wearing discipline's clothes. This hook is mutable substrate: if it fired wrong, ticket it rather than absorbing it.`
}
