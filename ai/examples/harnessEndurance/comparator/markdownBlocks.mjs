/**
 * @summary Competent single-main-thread markdown → block-HTML renderer for the benchmark comparator
 * (Subject B).
 *
 * The honest comparator does the SAME class of work as Subject A's off-thread Neo parser — block
 * segmentation, inline marks, and HTML escaping (hostile input rendered inert) — but synchronously on
 * the MAIN thread. It returns per-block HTML so the app applies the stream tail-incrementally (append
 * new blocks, re-render only the open last block), never an O(n²) full-`innerHTML` rewrite.
 *
 * Pure (string → string[]), dependency-free, unit-tested. Fairness posture (full rationale + the
 * naive-vs-best-practice fork on the benchmark ticket thread): this parser is competent but simpler than
 * Neo's full grammar, so it does LESS main-thread work — a CONSERVATIVE bias (a lighter parser makes
 * the comparator MORE responsive, shrinking any Neo advantage), which is the honest direction for a
 * falsifier. A real library (`marked`) is the documented alternative if reviewers want tighter
 * parse-work parity.
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

export default parseMarkdownBlocks;
