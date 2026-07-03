/**
 * @summary Competent single-main-thread markdown → block-HTML renderer for the benchmark comparator
 * (Subject B), with blank-line-incremental parsing.
 *
 * The honest comparator does the SAME class of work as Subject A's off-thread Neo parser — block
 * segmentation, inline marks, and HTML escaping (hostile input rendered inert) — but synchronously on
 * the MAIN thread. {@link parseMarkdownBlocks} parses a full string; the streaming driver
 * {@link createIncrementalBlocks} MEMOIZES — it settles completed blocks once and re-parses only the
 * open region from the deltas it is fed.
 *
 * Why blank-line granularity (not per-block): a blank line is the ONLY block boundary a forward-only
 * token stream can never un-merge — a mid-stream `- a` followed by `-` parses as list + paragraph, yet
 * becomes ONE list once `- b` arrives, so settling per-block would corrupt the output. Blocks before
 * the last blank line are permanently separated; everything after it is the open region, re-parsed each
 * delta. Per-`push` work is therefore bounded by the blank-line cadence of the stream (the benchmark's
 * `LoadProfile` corpus emits `\n\n` separators regularly), NOT by the whole transcript — keeping the
 * comparator's parse cost off the O(n²) full-re-parse path.
 *
 * Why incremental matters for the falsifier (the benchmark's naive-vs-best-practice fork → best practice): a full
 * re-parse of the growing source each tick is O(n²) over a session AND conflates Neo's parser
 * memoization with the worker-topology variable under test. Memoizing here leaves the lag delta
 * measuring ONLY where the work runs (main thread vs worker) — the variable this benchmark isolates. No
 * `innerHTML` O(n²) rewrite on render either (the app applies tail-incrementally).
 *
 * Fairness posture: this parser is competent but simpler than Neo's full grammar, so it does LESS
 * main-thread work per block — a CONSERVATIVE bias (a lighter parser makes the comparator MORE
 * responsive, shrinking any Neo advantage), the honest direction for a falsifier. Residual: a multi-block
 * run with no blank line between (e.g. a heading immediately followed by a paragraph) re-parses together
 * until the next blank line — a bounded, negligible over-count. A real library (`marked`) is the
 * documented alternative if reviewers want tighter parse-work parity.
 *
 * Pure (no DOM / Neo / Playwright), dependency-free, unit-tested.
 */

const ESCAPE = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

/**
 * @param {String} s
 * @returns {String}
 * @private
 */
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ESCAPE[c]);
}

/**
 * Inline marks applied to ESCAPED text (so hostile HTML is already inert): `code`, **bold**,
 * *italic*, and [text](url) restricted to http/https (javascript: etc. stay plain text).
 * @param {String} text
 * @returns {String}
 * @private
 */
function renderInline(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g,                              '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,                        '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g,                            '<em>$1</em>')
        .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g,    '<a href="$2">$1</a>');
}

/**
 * Parse markdown source into an array of per-block HTML strings (one entry per block: heading,
 * paragraph, list, blockquote). Block boundaries are blank lines + line-level block starts.
 * @param {String} source
 * @returns {String[]}
 */
export function parseMarkdownBlocks(source) {
    const
        lines  = String(source ?? '').split('\n'),
        blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {                                       // blank line → block boundary
            i++;
            continue
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {                                                  // ATX heading
            const level = heading[1].length;
            blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            i++;
            continue
        }

        if (/^\s*>\s?/.test(line)) {                                    // blockquote (consecutive >)
            const quote = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                quote.push(renderInline(lines[i].replace(/^\s*>\s?/, '')));
                i++
            }
            blocks.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
            continue
        }

        const
            ordered = /^\s*\d+\.\s+/.test(line),
            bullet  = /^\s*[-*]\s+/.test(line);
        if (ordered || bullet) {                                        // list (consecutive same-type)
            const
                items = [],
                re    = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
            while (i < lines.length && re.test(lines[i])) {
                items.push(`<li>${renderInline(re.exec(lines[i])[1])}</li>`);
                i++
            }
            blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
            continue
        }

        const para = [];                                               // paragraph (consecutive plain lines)
        while (
            i < lines.length && lines[i].trim() !== '' &&
            !/^#{1,6}\s|^\s*>\s?|^\s*\d+\.\s|^\s*[-*]\s/.test(lines[i])
        ) {
            para.push(renderInline(lines[i]));
            i++
        }
        blocks.push(`<p>${para.join(' ')}</p>`)
    }

    return blocks
}

/**
 * Index just after the LAST blank line in `source` — the highest offset before which every block is
 * permanently settled (a forward-only append can never merge a block across a blank line). Returns 0
 * when no blank line is present yet (nothing settled). A blank line is a newline, an optional run of
 * spaces/tabs, then a newline.
 * @param {String} source
 * @returns {Number}
 * @private
 */
function lastBlankBoundary(source) {
    const re = /\n[ \t]*\n/g;
    let boundary = 0, match;

    while ((match = re.exec(source)) !== null) {
        boundary    = match.index + match[0].length;
        re.lastIndex = match.index + 1;   // step one char so consecutive blank-line runs keep advancing
    }

    return boundary
}

/**
 * @summary A stateful, delta-fed incremental block parser — the memoizing front-end for streaming.
 *
 * Feed it appended deltas via {@link push}; it keeps only the OPEN source after the last blank line,
 * settles the blocks before that boundary exactly once, and returns the current full block-HTML list
 * each call. Per-`push` work is bounded by the open region (since the last blank line), NOT the whole
 * transcript — the property that keeps the comparator's parse cost off the O(n²) full-re-parse path and
 * isolates the worker-topology variable the benchmark measures.
 *
 * @returns {{push: (function(String): String[])}}
 */
export function createIncrementalBlocks() {
    let settledHtml = [],
        openSource  = '';

    return {
        /**
         * Append a streamed delta and return the current block-HTML list (settled blocks + the open
         * region's blocks). Pass the DELTA, not the accumulated source.
         * @param {String} [textDelta='']
         * @returns {String[]}
         */
        push(textDelta = '') {
            openSource += textDelta;

            const boundary = lastBlankBoundary(openSource);

            if (boundary > 0) {
                // Everything before the last blank line can never change → settle it once.
                settledHtml.push(...parseMarkdownBlocks(openSource.slice(0, boundary)));
                openSource = openSource.slice(boundary);
            }

            return [...settledHtml, ...parseMarkdownBlocks(openSource)]
        }
    };
}

export default parseMarkdownBlocks;
