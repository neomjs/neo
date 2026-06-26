/**
 * @module ai/services/knowledge-base/source/ticketArchiveElementSplitter
 * @summary Pure splitter that breaks an issue-archive markdown file into per-element pieces —
 * the issue body and each Timeline comment as separate units — so the Knowledge Base can chunk
 * a multi-cycle ticket at element granularity instead of one growing whole-file blob.
 *
 * A whole-artifact chunk that crosses the embedding cap is either dropped (unindexed) or
 * blind-byte-split mid-content (semantically incoherent); on a path without a hard skip it fails
 * to embed and leaves metadata without a vector (the corruption class). Splitting at extract time
 * keeps every element small (a body / a single comment), so coverage stays complete regardless of
 * how many comment cycles a ticket accumulates.
 *
 * Boundary format (verified across the archive): the body runs until the FIRST
 * `### @<author> - <ISO-timestamp>` comment delimiter; each comment is delimited by that line.
 * Comment bodies may themselves contain `##`/`###` headings, so the split keys ONLY on the
 * author-timestamp delimiter — never on arbitrary headings. A file with no comment delimiter
 * (including a `## Timeline` carrying only event rows — the majority of the corpus) yields a single
 * body element equal to the whole file, so non-comment Timeline events are CONSERVED, never dropped.
 */

/**
 * Matches a Timeline comment delimiter line, e.g. `### @neo-opus-vega - 2026-06-26T02:16:08Z`.
 * @type {RegExp}
 */
const COMMENT_DELIMITER = /^### @[A-Za-z0-9_-]+ - \d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\s*$/;

/**
 * Splits issue-archive markdown into ordered per-element pieces.
 *
 * Pure — no I/O. Returns the body as element `ordinal: 0` followed by each comment as
 * `ordinal: 1..N` in document order. A ticket with no comment delimiter (including a `## Timeline`
 * carrying only event rows) returns a single body element whose content equals the whole file — so
 * the whole-file chunk is preserved and non-comment Timeline content is never dropped.
 *
 * @param {String} content Raw `issue-*.md` file content (frontmatter + title + body + Timeline).
 * @returns {Array<{kind: ('body'|'comment'), ordinal: Number, content: String}>}
 *          `kind` — `'body'` for the single body element, `'comment'` for each Timeline comment.
 *          `ordinal` — `0` for the body, `1..N` for comments in document order.
 *          `content` — the element text (trailing whitespace trimmed).
 * @throws {TypeError} when `content` is not a string.
 */
export function splitTicketArchiveMarkdown(content) {
    if (typeof content !== 'string') {
        throw new TypeError(`splitTicketArchiveMarkdown: content must be a string, got ${typeof content}`);
    }

    const lines           = content.split('\n');
    let   firstCommentIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (COMMENT_DELIMITER.test(lines[i])) {
            firstCommentIdx = i;
            break;
        }
    }

    // No `### @author - <ISO>` comment delimiter → the whole file is a single body element. This
    // CONSERVES a `## Timeline` section that carries only event rows (no comments): its content stays
    // in the body rather than being dropped.
    if (firstCommentIdx === -1) {
        return [{kind: 'body', ordinal: 0, content: content.trimEnd()}];
    }

    // Body = everything before the first comment (frontmatter + title + issue body + the `## Timeline`
    // heading + any pre-comment event rows — no content dropped). Comments split out after it.
    const elements      = [{kind: 'body', ordinal: 0, content: lines.slice(0, firstCommentIdx).join('\n').trimEnd()}],
          commentBlocks = [];

    let current = null;

    // From the first comment onward: a `### @author - <ISO>` line opens a comment block that runs until
    // the next delimiter or EOF. Comment bodies may carry their own `##`/`###` headings + trailing event
    // rows, so we split ONLY on the author-timestamp delimiter.
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
