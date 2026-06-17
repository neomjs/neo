/**
 * @module AgentOSWidget.util.parseEditRequest
 * @summary Bounded, fail-closed parser for a first-widget follow-up EDIT request.
 *
 * After the first widget exists, the chat surface accepts bounded follow-up edits that mutate the
 * EXISTING widget — not a new one. This is the safe boundary: it accepts only a small DETERMINISTIC edit
 * grammar over known widget state and fails closed to a `{accepted:false, reason}` state — never
 * throwing, never letting markup, an overlong payload, an unknown command, or an out-of-bounds value
 * through. No model invocation, no arbitrary code: a fixed grammar over title / row-count / sample-data,
 * so the controller can apply only safe, bounded mutations to the live grid.
 */

/** Max accepted edit length (a follow-up edit is a short instruction). @type {Number} */
const MAX_REQUEST_LENGTH = 200;
/** Max accepted title length. @type {Number} */
const MAX_TITLE_LENGTH = 80;
/** Inclusive row-count bounds. @type {Number} */
const MIN_ROWS = 1;
const MAX_ROWS = 20;

/**
 * Parses a follow-up edit request into a bounded, fail-closed result.
 *
 * @param {String} text the raw user edit text
 * @returns {{accepted: true, edit: Object}|{accepted: false, reason: String}}
 *   On success `{accepted:true, edit}` where `edit` is one of:
 *   `{type:'rename', title:String}` · `{type:'rowCount', count:Number}` · `{type:'reset'}`.
 *   Otherwise `{accepted:false, reason}` for non-string / empty / overlong / markup / unknown command /
 *   out-of-bounds input.
 */
export function parseEditRequest(text) {
    if (typeof text !== 'string') {
        return {accepted: false, reason: 'Edit must be text.'}
    }

    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return {accepted: false, reason: 'Edit is empty — type a change.'}
    }

    if (trimmed.length > MAX_REQUEST_LENGTH) {
        return {accepted: false, reason: `Edit is too long (max ${MAX_REQUEST_LENGTH} characters).`}
    }

    if (/[<>]/.test(trimmed)) {
        return {accepted: false, reason: 'Edit must be plain text (no markup).'}
    }

    // rename [it] to <title>
    let match = trimmed.match(/^rename\s+(?:it\s+)?to\s+(.+)$/i);
    if (match) {
        const title = match[1].trim();

        if (title.length === 0) {
            return {accepted: false, reason: 'New title is empty.'}
        }
        if (title.length > MAX_TITLE_LENGTH) {
            return {accepted: false, reason: `Title is too long (max ${MAX_TITLE_LENGTH} characters).`}
        }

        return {accepted: true, edit: {type: 'rename', title}}
    }

    // show <n> row(s)
    match = trimmed.match(/^show\s+(\d+)\s+rows?$/i);
    if (match) {
        const count = Number(match[1]);

        if (count < MIN_ROWS || count > MAX_ROWS) {
            return {accepted: false, reason: `Row count must be between ${MIN_ROWS} and ${MAX_ROWS}.`}
        }

        return {accepted: true, edit: {type: 'rowCount', count}}
    }

    // reset [sample] data
    if (/^reset(?:\s+sample)?\s+data$/i.test(trimmed)) {
        return {accepted: true, edit: {type: 'reset'}}
    }

    return {accepted: false, reason: 'Unknown edit. Try "rename it to …", "show N rows", or "reset data".'}
}
