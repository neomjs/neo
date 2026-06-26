/**
 * @module ai/services/knowledge-base/source/pullRequestArchiveElementSplitter
 * @summary Pure splitter that breaks a PR-archive markdown file into per-element pieces — the PR
 * body and each review / comment as separate units — so the Knowledge Base can chunk a multi-round
 * PR at element granularity instead of one growing whole-file blob. Sibling of the ticket splitter
 * (ticketArchiveElementSplitter); the PR format differs.
 *
 * A whole-artifact chunk that crosses the embedding cap is dropped (unindexed) or blind-byte-split
 * (incoherent); on a path without a hard skip it fails to embed and leaves metadata without a vector
 * (the corruption class). Splitting at extract time keeps every element small regardless of how many
 * review rounds a PR accumulates.
 *
 * Boundary format (verified across the archive — 494/4121 files carry `## Reviews`, 243 `## Comments`):
 * frontmatter + title + PR body (which carries its OWN `## Deltas` / `## Test Evidence` / `## Commits`
 * sections — those are body content, NOT boundaries) run until the FIRST of `## Reviews` / `## Comments`.
 * Each discussion element is delimited by a backtick-author line:
 *   review  — ``### `@<author>` (<STATE>) reviewed on <ISO>``
 *   comment — ``### `@<author>` commented on <ISO>``
 * Element bodies may contain their own `##`/`###` headings, so the split keys ONLY on the section
 * boundary + these delimiters. A PR with neither section yields a single body element (the whole file).
 */

/**
 * The PR body→discussion boundary: the first `## Reviews` or `## Comments` section heading.
 * @type {RegExp}
 */
const SECTION_BOUNDARY = /^## (Reviews|Comments)\s*$/;

/**
 * A review delimiter, e.g. ``### `@tobiu` (APPROVED) reviewed on 2026-06-25T21:02:56Z``.
 * @type {RegExp}
 */
const REVIEW_DELIM = /^### `@[A-Za-z0-9_-]+` \(.+\) reviewed on \d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\s*$/;

/**
 * A comment delimiter, e.g. ``### `@neo-gpt` commented on 2026-06-25T18:54:58Z``.
 * @type {RegExp}
 */
const COMMENT_DELIM = /^### `@[A-Za-z0-9_-]+` commented on \d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\s*$/;

/**
 * Splits PR-archive markdown into ordered per-element pieces.
 *
 * Pure — no I/O. Returns the body as element `ordinal: 0` followed by each review / comment in
 * document order. Reviews and comments carry independent 1-based ordinals (so naming can be
 * `#review-<n>` / `#comment-<n>`). A no-discussion PR (no `## Reviews`/`## Comments`) returns a single
 * body element whose content equals the whole file (so the existing whole-file chunk is preserved
 * unchanged for that case).
 *
 * @param {String} content Raw `pr-*.md` file content (frontmatter + body + Reviews/Comments).
 * @returns {Array<{kind: ('body'|'review'|'comment'), ordinal: Number, content: String}>}
 *          `kind` — `'body'` for the single body element, `'review'`/`'comment'` per discussion entry.
 *          `ordinal` — `0` for the body; 1-based per-kind for reviews / comments in document order.
 *          `content` — the element text (trailing whitespace trimmed).
 * @throws {TypeError} when `content` is not a string.
 */
export function splitPullRequestArchiveMarkdown(content) {
    if (typeof content !== 'string') {
        throw new TypeError(`splitPullRequestArchiveMarkdown: content must be a string, got ${typeof content}`);
    }

    const lines       = content.split('\n');
    let   boundaryIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (SECTION_BOUNDARY.test(lines[i])) {
            boundaryIdx = i;
            break;
        }
    }

    // No `## Reviews`/`## Comments` → the whole file is a single body element (no-discussion PR).
    if (boundaryIdx === -1) {
        return [{kind: 'body', ordinal: 0, content: content.trimEnd()}];
    }

    const elements      = [{kind: 'body', ordinal: 0, content: lines.slice(0, boundaryIdx).join('\n').trimEnd()}],
          discussionEls = [];

    let current = null;

    // From the first section boundary onward: a backtick-author delimiter opens a review / comment
    // element that runs until the next delimiter. Section-heading lines (`## Reviews`/`## Comments`)
    // close the current element without opening one; element-internal `##`/`###` headings stay in-element.
    for (let i = boundaryIdx; i < lines.length; i++) {
        const line = lines[i];

        if (REVIEW_DELIM.test(line)) {
            current = {kind: 'review', lines: [line]};
            discussionEls.push(current);
        } else if (COMMENT_DELIM.test(line)) {
            current = {kind: 'comment', lines: [line]};
            discussionEls.push(current);
        } else if (SECTION_BOUNDARY.test(line)) {
            current = null;
        } else if (current) {
            current.lines.push(line);
        }
    }

    let reviewOrdinal  = 0,
        commentOrdinal = 0;

    discussionEls.forEach(el => {
        const ordinal = el.kind === 'review' ? ++reviewOrdinal : ++commentOrdinal;
        elements.push({kind: el.kind, ordinal, content: el.lines.join('\n').trimEnd()});
    });

    return elements;
}
