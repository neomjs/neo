/**
 * Pre-Flight (structural fast-path): authoring `ai/services/github-workflow/sync/verifyFrontmatterIntegrity.mjs`
 * matches the small-utility-helper pattern of `ai/services/github-workflow/shared/contentPath.mjs` and
 * `ai/services/github-workflow/shared/contentIndex.mjs` — pure-function modules consumed by the
 * Discussion / Issue / PullRequest syncers; sibling-file-lift applies; no novel directory choice.
 *
 * @summary Validates that serialized markdown content carries the expected frontmatter keys
 * before persistence (#11573). Closes the V-B-A gap where #11554's frontmatter-emit fix shipped
 * with green CI but the production effect was never verified — 0 of 104 on-disk Discussion
 * markdown files carried the new `closed` / `closedAt` keys despite the merged code path.
 *
 * Intentionally a pure helper:
 * - No Neo runtime dependency (importable from any sync context, including non-Neo callers).
 * - No filesystem IO (operates on the in-memory `content` string just before `fs.writeFile`).
 * - No logger dependency (returns a structured result; caller decides log level + action).
 *
 * Cost model: one regex test per required key per discussion. For ~100 discussions × 5 keys
 * the overhead is sub-millisecond — far below the network + serialize cost of a sync run.
 *
 * @see #11573 (this ticket) / #11554 (originally fixed frontmatter shape)
 */

/**
 * Checks whether the serialized markdown `content` carries each of the required frontmatter keys.
 * Match is anchored at line start (`^key:` with multi-line flag), matching `gray-matter`'s YAML
 * serialization output (top-level keys are always rendered as `key: value` on their own line).
 *
 * @param {string} content The full serialized markdown (frontmatter + body), as produced by
 *                         `matter.stringify(body, frontmatter)`.
 * @param {string[]} requiredKeys Top-level frontmatter keys that MUST appear.
 * @returns {{ok: boolean, missing: string[]}} `ok=true` when every required key is present;
 *                                              otherwise `ok=false` with `missing` listing the
 *                                              keys that did not appear.
 */
function verifyFrontmatterIntegrity(content, requiredKeys) {
    if (typeof content !== 'string') {
        return {ok: false, missing: requiredKeys.slice()};
    }
    if (!Array.isArray(requiredKeys) || requiredKeys.length === 0) {
        return {ok: true, missing: []};
    }

    const missing = requiredKeys.filter(key => {
        // `key:` at the start of any line — covers both inline (`closed: false`) and
        // block-scalar styles (`title: |`). Escapes regex metacharacters in the key just
        // in case a caller passes a value containing them.
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return !new RegExp(`^${escapedKey}:`, 'm').test(content);
    });

    return {
        ok     : missing.length === 0,
        missing
    };
}

/**
 * Convenience wrapper for the Discussion syncer's required key set. Centralizes the
 * "what counts as a complete Discussion frontmatter" contract so future regression
 * tickets can extend this single list instead of grepping all syncers.
 *
 * Currently mirrors `DiscussionSyncer.mjs:241-250` frontmatter object construction.
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
        'closedAt'
    ]);
}

export {verifyDiscussionFrontmatter, verifyFrontmatterIntegrity};
