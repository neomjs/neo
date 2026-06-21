/**
 * @module Neo.ai.services.github-workflow.shared.redactSensitiveContent
 * @summary Pure, config-driven redaction of sensitive terms from content text. Sensitive terms
 * (commercial-partner names, external contributor handles) must never appear in public artifacts
 * (the core no-client-names gate). This module carries NO hardcoded sensitive term — the deny-pairs are supplied by
 * the caller (gitignored config / argv), so the tracked source stays name-clean. It is reused by the
 * synced-mirror redaction migration (surface D) and the sync-writer guard (surface E) so both redact
 * identically, and the guard can prevent re-introduction on the next hourly sync.
 */

/**
 * @summary Applies ordered, literal `from → to` deny-pairs to `text`. Literal (not regex) so there are
 * no metachar surprises; ordered so a longer term / handle (e.g. `@kmunk-foo`) is redacted BEFORE its
 * substring (`foo`) — pass the longest/handle terms first. Fail-SAFE: a non-string `text`, a non-array
 * `denyPairs`, or a malformed pair is returned/skipped unchanged (never throws, never partially mangles).
 * @param {String} text The content to redact.
 * @param {Array} [denyPairs=[]] Ordered `[from, to]` string pairs (longest/handle terms first).
 * @returns {String} The redacted text, or `text` unchanged when it is not a string.
 */
export function redactSensitiveContent(text, denyPairs = []) {
    if (typeof text !== 'string')   return text;
    if (!Array.isArray(denyPairs))  return text;

    let out = text;
    for (const pair of denyPairs) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [from, to] = pair;
        if (typeof from !== 'string' || !from || typeof to !== 'string') continue;
        out = out.split(from).join(to);
    }
    return out;
}
