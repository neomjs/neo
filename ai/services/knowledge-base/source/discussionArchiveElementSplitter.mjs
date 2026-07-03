/**
 * @module ai/services/knowledge-base/source/discussionArchiveElementSplitter
 * @summary Pure splitter that breaks a discussion-archive markdown file into per-element pieces — the
 * converged-model body and each maintainer comment as separate units — so the Knowledge Base can chunk
 * a large converged Discussion at element granularity instead of one growing whole-file blob. Sibling of
 * the ticket / PR splitters; discussions reuse the PR comment delimiter.
 *
 * A whole-artifact chunk that crosses the embedding cap is dropped (unindexed) or blind-byte-split
 * (incoherent); on a path without a hard skip it fails to embed and leaves metadata without a vector
 * (the corruption class). The big converged Discussions (the most-referenced architectural docs)
 * accumulate a rich body + many maintainer comments; per-element chunks keep each small and make each
 * maintainer's reasoning separately retrievable.
 *
 * Boundary format (verified active+archive — 155/176 files carry the comment delimiter, 84 active + 71
 * archive; a corpus scan found zero files with content unowned by an element): the body (frontmatter +
 * the converged-model doc, which carries its OWN `## Converged Model` / `## Decision Record` /
 * `## Signal Ledger` / … sections) runs until the FIRST comment delimiter; each comment is delimited by a
 * backtick-author line ``### `@<author>` commented on <ISO>`` (the same delimiter as PR comments). Comment
 * bodies may contain their own `##`/`###` headings, so the split keys ONLY on the delimiter — never on
 * arbitrary headings. A discussion with no comment delimiter yields a single body element equal to the
 * whole file, so the converged-model body + any section content is CONSERVED, never dropped.
 */

/**
 * A discussion comment delimiter, e.g. ``### `@neo-gpt` commented on 2026-06-20T05:13:58Z``.
 * @type {RegExp}
 */
const COMMENT_DELIMITER = /^### `@[A-Za-z0-9_-]+` commented on \d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\s*$/;

/**
 * Splits discussion-archive markdown into ordered per-element pieces.
 *
 * Pure — no I/O. Returns the body as element `ordinal: 0` followed by each comment as `ordinal: 1..N` in
 * document order. A discussion with no comment delimiter returns a single body element whose content equals
 * the whole file — so the whole-file chunk is preserved and the converged-model body is never dropped.
 *
 * @param {String} content Raw `discussion-*.md` file content (frontmatter + converged-model body + comments).
 * @returns {Array<{kind: ('body'|'comment'), ordinal: Number, content: String}>}
 *          `kind` — `'body'` for the single body element, `'comment'` for each maintainer comment.
 *          `ordinal` — `0` for the body, `1..N` for comments in document order.
 *          `content` — the element text (trailing whitespace trimmed).
 * @throws {TypeError} when `content` is not a string.
 */
export function splitDiscussionArchiveMarkdown(content) {
    if (typeof content !== 'string') {
        throw new TypeError(`splitDiscussionArchiveMarkdown: content must be a string, got ${typeof content}`);
    }

    const lines           = content.split('\n');
    let   firstCommentIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (COMMENT_DELIMITER.test(lines[i])) {
            firstCommentIdx = i;
            break;
        }
    }

    // No comment delimiter → the whole file is a single body element. This CONSERVES the converged-model
    // body + any `## Comments`/section content (there are no entries to split out).
    if (firstCommentIdx === -1) {
        return [{kind: 'body', ordinal: 0, content: content.trimEnd()}];
    }

    // Body = everything before the first comment (frontmatter + the converged-model doc + the `## Comments`
    // heading + any pre-comment content — no content dropped). Comments split out after it.
    const elements      = [{kind: 'body', ordinal: 0, content: lines.slice(0, firstCommentIdx).join('\n').trimEnd()}],
          commentBlocks = [];

    let current = null;

    // From the first comment onward: a backtick-author delimiter opens a comment block that runs until the
    // next delimiter or EOF. Comment bodies may carry their own `##`/`###` headings, so we split ONLY on the
    // author delimiter.
    for (let i = firstCommentIdx; i < lines.length; i++) {
        const line = lines[i];

        if (COMMENT_DELIMITER.test(line)) {
            current = [line];
            commentBlocks.push(current);
        } else if (current) {
            current.push(line);
        }
    }

    commentBlocks.forEach((blockLines, index) => {
        elements.push({kind: 'comment', ordinal: index + 1, content: blockLines.join('\n').trimEnd()});
    });

    return elements;
}
