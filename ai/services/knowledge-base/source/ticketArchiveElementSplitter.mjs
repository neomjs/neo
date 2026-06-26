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
 * Boundary format (verified across the archive — 709/711 files carry a `## Timeline` section):
 * frontmatter + title + body run until `## Timeline`; each comment is delimited by a
 * `### @<author> - <ISO-timestamp>` line. Comment bodies may themselves contain `##`/`###`
 * headings, so the split keys ONLY on the `## Timeline` boundary + the author-timestamp delimiter
 * — never on arbitrary headings. A file with no `## Timeline` (a no-comment ticket) yields a single
 * body element whose content equals the whole file.
 */

/**
 * Matches a Timeline comment delimiter line, e.g. `### @neo-opus-vega - 2026-06-26T02:16:08Z`.
 * @type {RegExp}
 */
const COMMENT_DELIMITER = /^### @[A-Za-z0-9_-]+ - \d{4}-\d{2}-\d{2}T[0-9:.Z+-]+\s*$/;

/**
 * Matches the `## Timeline` section heading that separates the issue body from its comments.
 * @type {RegExp}
 */
const TIMELINE_HEADING = /^## Timeline\s*$/;

/**
 * Splits issue-archive markdown into ordered per-element pieces.
 *
 * Pure — no I/O. Returns the body as element `ordinal: 0` followed by each comment as
 * `ordinal: 1..N` in document order. A no-comment ticket (no `## Timeline`) returns a single
 * body element whose content equals the whole file (so the existing whole-file chunk is preserved
 * unchanged for that case).
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

    const lines       = content.split('\n');
    let   timelineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (TIMELINE_HEADING.test(lines[i])) {
            timelineIdx = i;
            break;
        }
    }

    // No `## Timeline` section → the whole file is a single body element (no-comment ticket).
    if (timelineIdx === -1) {
        return [{kind: 'body', ordinal: 0, content: content.trimEnd()}];
    }

    const elements      = [{kind: 'body', ordinal: 0, content: lines.slice(0, timelineIdx).join('\n').trimEnd()}],
          commentBlocks = [];

    let current = null;

    // Everything after `## Timeline`: a `### @author - <ISO>` line opens a comment block that runs
    // until the next delimiter or EOF. Comment bodies may carry their own `##`/`###` headings, so we
    // split ONLY on the author-timestamp delimiter. Lines before the first delimiter (the Timeline
    // preamble / bare heading) belong to no comment and are skipped.
    for (let i = timelineIdx + 1; i < lines.length; i++) {
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
