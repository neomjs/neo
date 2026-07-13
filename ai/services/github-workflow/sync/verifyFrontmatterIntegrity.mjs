/**
 * Pre-Flight (structural fast-path): authoring `ai/services/github-workflow/sync/verifyFrontmatterIntegrity.mjs`
 * matches the small-utility-helper pattern of `ai/services/github-workflow/shared/contentPath.mjs` and
 * `ai/services/github-workflow/shared/contentIndex.mjs` — pure-function modules consumed by the
 * Discussion / Issue / PullRequest syncers; sibling-file-lift applies; no novel directory choice.
 *
 * @summary Validates that the YAML frontmatter block of serialized markdown carries the expected
 * top-level keys before persistence. Guards the production effect of frontmatter migrations, where
 * green CI alone does not prove that live sync writers are serializing the new keys.
 *
 * Intentionally a pure helper:
 * - Uses `gray-matter` (the same parser the syncer uses) to isolate the frontmatter block from
 *   the markdown body. This eliminates the body-line false-positive class where a body line starting
 *   with `closed:` falsely satisfies a missing-key check against the actual frontmatter.
 * - No Neo runtime dependency (importable from any sync context, including non-Neo callers).
 * - No filesystem IO (operates on the in-memory `content` string just before `fs.writeFile`).
 * - No logger dependency (returns a structured result; caller decides log level + action).
 *
 * Cost model: one `gray-matter` parse per discussion (~100/sync × ~1ms = sub-100ms — far below
 * the network + serialize cost of a sync run).
 */
import matter from 'gray-matter';

/**
 * Checks whether the YAML frontmatter block of `content` carries each of the required keys.
 * Parses via `gray-matter` (same parser the syncer uses) so the check operates on the actual
 * frontmatter substrate, NOT the full markdown document. This prevents the body-line
 * false-positive class where a body line `closed:` would satisfy a frontmatter-`closed:` check.
 *
 * @param {string} content The full serialized markdown (frontmatter + body), as produced by
 *                         `matter.stringify(body, frontmatter)`.
 * @param {string[]} requiredKeys Top-level frontmatter keys that MUST appear.
 * @returns {{ok: boolean, missing: string[]}} `ok=true` when every required key is present in
 *                                              the parsed frontmatter object; otherwise
 *                                              `ok=false` with `missing` listing the keys.
 */
function verifyFrontmatterIntegrity(content, requiredKeys) {
    if (typeof content !== 'string') {
        return {ok: false, missing: Array.isArray(requiredKeys) ? requiredKeys.slice() : []};
    }
    if (!Array.isArray(requiredKeys) || requiredKeys.length === 0) {
        return {ok: true, missing: []};
    }

    let parsed;
    try {
        parsed = matter(content);
    } catch (e) {
        // Malformed YAML or other parse error — treat as missing all keys so caller can
        // decide whether to fail the write or surface the parse failure.
        return {ok: false, missing: requiredKeys.slice()};
    }

    const data    = parsed.data || {};
    const missing = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(data, key));

    return {
        ok     : missing.length === 0,
        missing
    };
}

/**
 * Convenience wrapper for the Discussion syncer's required key set. Centralizes the
 * "what counts as a complete Discussion frontmatter" contract so future migrations
 * can extend this single list instead of grepping all syncers.
 *
 * Mirrors `DiscussionSyncer.#renderDiscussionMarkdown()` frontmatter construction.
 *
 * @param {string} content
 * @returns {{ok: boolean, missing: string[]}}
 */
function verifyDiscussionFrontmatter(content) {
    return verifyFrontmatterIntegrity(content, [
        'number',
        'title',
        'author',
        'category',
        'createdAt',
        'updatedAt',
        'closed',
        'closedAt',
        'routingDispositionSchemaVersion',
        'routingDisposition',
        'routingDispositionReason',
        'routingDispositionEvidence'
    ]);
}

export {verifyDiscussionFrontmatter, verifyFrontmatterIntegrity};
