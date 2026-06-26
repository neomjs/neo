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
 * Boundary format (verified active+archive — 1579/4121 files carry `## Reviews`, 1354 `## Comments`,
 * 2071 with either boundary; a corpus scan found zero files with content unowned by an element):
 * the body (frontmatter + title + the PR body, which carries its OWN `## Deltas` / `## Test Evidence` /
 * `## Commits` sections) runs until the FIRST review/comment delimiter. Each discussion element is
 * delimited by a backtick-author line:
 *   review  — ``### `@<author>` (<STATE>) reviewed on <ISO>``
 *   comment — ``### `@<author>` commented on <ISO>``
 * Element bodies may contain their own `##`/`###` headings, so the split keys ONLY on these delimiters —
 * never on arbitrary headings. A PR with no delimiter yields a single body element equal to the whole
 * file, so any `## Reviews`/`## Comments` heading + pre-delimiter content is CONSERVED, never dropped.
 */

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
 * `#review-<n>` / `#comment-<n>`). A PR with no review/comment delimiter returns a single body element
 * whose content equals the whole file — so the whole-file chunk is preserved and any section heading +
 * pre-delimiter content is never dropped.
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

    const lines         = content.split('\n');
    let   firstDelimIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (REVIEW_DELIM.test(lines[i]) || COMMENT_DELIM.test(lines[i])) {
            firstDelimIdx = i;
            break;
        }
    }

    // No review/comment delimiter → the whole file is a single body element. This CONSERVES any
    // `## Reviews`/`## Comments` heading + pre-delimiter content (there are no entries to split out).
    if (firstDelimIdx === -1) {
        return [{kind: 'body', ordinal: 0, content: content.trimEnd()}];
    }

    // Body = everything before the first delimiter (frontmatter + title + PR body + the section heading
    // + any pre-delimiter content — no content dropped). Discussion elements split out after it.
    const elements      = [{kind: 'body', ordinal: 0, content: lines.slice(0, firstDelimIdx).join('\n').trimEnd()}],
          discussionEls = [];

    let current = null;

    // From the first delimiter onward: a backtick-author delimiter opens a review / comment element that
    // runs until the next delimiter. A `## Reviews`/`## Comments` heading appearing between sections is
    // non-delimiter content and stays with the current element; element-internal `##`/`###` headings stay
    // in-element. Nothing is dropped — the split keys ONLY on the review/comment delimiters.
    for (let i = firstDelimIdx; i < lines.length; i++) {
        const line = lines[i];

        if (REVIEW_DELIM.test(line)) {
            current = {kind: 'review', lines: [line]};
            discussionEls.push(current);
        } else if (COMMENT_DELIM.test(line)) {
            current = {kind: 'comment', lines: [line]};
            discussionEls.push(current);
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
