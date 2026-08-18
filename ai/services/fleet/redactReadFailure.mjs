import {redactCredentials} from './redactCredentials.mjs';

/**
 * @module ai/services/fleet/redactReadFailure
 * @summary The ONE reduction from a thrown read failure to a projection-safe diagnostic detail,
 * shared by every fleet source that carries a `detail` beside its constant failure reason.
 *
 * Extracted at the SECOND consumer, deliberately: the sibling `redactCredentials` module exists
 * because five adapters each grew a private copy of one redactor and the copies drifted. This
 * helper refuses to start that story again — the memories source held the first private copy,
 * the session-memories source would have been the second.
 *
 * The order is load-bearing and the shared home is what keeps it uniform: message extracted,
 * whitespace collapsed, credential families masked through the shared redaction authority, and
 * ONLY THEN bounded to 240 chars — redaction replaces, and a replacement can be longer than its
 * match, so a cap applied before it does not bind. Redacting the whole message first is also
 * strictly safer than redacting a truncation of it.
 */

/**
 * @summary Reduce one read failure to a sanitized, bounded diagnostic detail.
 * @param {*} error The thrown value; non-Errors are coerced.
 * @returns {String|null} the sanitized detail, or `null` when nothing legible remains.
 */
export function redactReadFailure(error) {
    // an Error owns its message even when empty — falling through to String(error) would turn a
    // message-less throw into the literal word "Error", a detail that details nothing
    const raw  = typeof error?.message === 'string' ? error.message : error == null ? '' : String(error),
          text = redactCredentials(raw.replace(/\s+/g, ' ').trim()).slice(0, 240);

    return text || null
}

export default redactReadFailure;
