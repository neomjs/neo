/**
 * @module AgentOSWidget.util.validateRequest
 * @summary Bounded, fail-closed validation for a first-widget chat request.
 *
 * The H2 chat-intake surface captures untrusted user text before it becomes request/evidence
 * state. This is the safe boundary: it accepts only a bounded plain-text request and fails closed
 * to a `{accepted:false, reason}` state — never throwing, never letting markup or an overlong
 * payload through — so the intake surface can render the reason as bounded safe text rather than
 * projecting unvalidated input. Deterministic: no model invocation, no orchestration; this leaf
 * proves the intake boundary, not provider integration.
 */

/**
 * The maximum accepted request length. A first-widget request is a short instruction
 * ("build me a neo grid"); anything longer is rejected as overlong rather than truncated.
 * @type {Number}
 */
const MAX_REQUEST_LENGTH = 200;

/**
 * Validates a first-widget chat request into a bounded, fail-closed result.
 *
 * @param {String} text the raw user request text
 * @returns {{accepted: Boolean, value: String}|{accepted: Boolean, reason: String}}
 *   `{accepted: true, value}` (trimmed) on success, or `{accepted: false, reason}` when the input
 *   is non-string, empty / whitespace-only, longer than {@link MAX_REQUEST_LENGTH}, or contains markup.
 */
export function validateRequest(text) {
    if (typeof text !== 'string') {
        return {accepted: false, reason: 'Request must be text.'}
    }

    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return {accepted: false, reason: 'Request is empty — type what to build.'}
    }

    if (trimmed.length > MAX_REQUEST_LENGTH) {
        return {accepted: false, reason: `Request is too long (max ${MAX_REQUEST_LENGTH} characters).`}
    }

    if (/[<>]/.test(trimmed)) {
        return {accepted: false, reason: 'Request must be plain text (no markup).'}
    }

    return {accepted: true, value: trimmed}
}
