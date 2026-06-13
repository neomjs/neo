/**
 * Streaming-first markdown → VDOM parsing for transcript-grade surfaces.
 *
 * Converts markdown source into pure VDOM block subtrees — no HTML string exists at any stage,
 * so the engine's text safety applies by construction: text lands in `vtype: 'text'` nodes via
 * the vdom `text` property, which the DomApi renderer writes through `createTextNode` and the
 * string renderer HTML-escapes at VNode construction. Emitting `html` / `innerHTML` anywhere in
 * this module would reopen the injection surface it exists to remove.
 *
 * **The stable-id contract (the load-bearing design element):** every block subtree carries a
 * deterministic root id born from a monotonic sequence, memoized against the block's raw source
 * slice. A settled block re-emits the *same object* with the *same ids* on every subsequent
 * parse, so the differ no-ops the settled prefix; a streaming append therefore costs exactly one
 * insert-only tail batch (sequential same-parent appends ride the consumer's insertNode batching
 * natively), and growth of the open tail block diffs as in-place `updateVtext` / `updateNode`
 * mutation. Block sequence numbers never recycle — not within a value lifetime and not across
 * resets — so a reset cannot birth two-nodes-one-id across batches.
 *
 * **Streaming model:** `update(source)` detects appends (`source.startsWith(previous)`); the
 * settled prefix is reused untouched, only the open tail block (an unterminated fence or the
 * trailing paragraph) re-parses merged with the appended slice. Any non-append change resets the
 * ledger and re-parses fully with fresh ids. ATX headings only — setext underlines are
 * deliberately unsupported because they retro-promote an already-settled paragraph, which breaks
 * the settled-prefix invariant streaming depends on.
 *
 * **Security defaults (transcript-grade):** raw HTML lines render as inert text; link and image
 * destinations pass a protocol allowlist (`http`, `https`, `mailto`, fragment, relative) —
 * everything else renders as plain text.
 *
 * **Plain-module discipline:** no class lifecycle, no `Neo` globals, no DOM access — importable
 * from the App Worker, the Node unit-test environment, and the Node-side SSR/SSG pipeline alike.
 * @module component/markdown/Parser
 */

/**
 * Block-level grammar types the segmenter distinguishes.
 * @type {Object}
 */
export const BLOCK_TYPES = Object.freeze({
    break    : 'break',
    code     : 'code',
    heading  : 'heading',
    list     : 'list',
    paragraph: 'paragraph',
    quote    : 'quote',
    table    : 'table'
});

/**
 * Link / image destinations must match one of these shapes; everything else (notably
 * `javascript:` and `data:` schemes) renders as plain text instead of a live reference.
 * A leading scheme is only accepted from the allowlist; scheme-less destinations
 * (`/path`, `./rel`, `#fragment`, `bare-word`) are inherently inert and pass.
 * @type {RegExp}
 */
export const SAFE_DESTINATION = /^(?:https?:|mailto:)[^\s]*$|^[^\s:]*$|^#/;

const
    REGEX_BLANK      = /^[ \t]*$/,
    // Checked BEFORE list items: `- - -` is a thematic break, not a list.
    REGEX_BREAK      = /^[ \t]*([-_*])[ \t]*(?:\1[ \t]*){2,}$/,
    REGEX_FENCE_OPEN = /^(`{3,}|~{3,})[ \t]*([\w-]*)[ \t]*$/,
    REGEX_HEADING    = /^(#{1,6})[ \t]+(.*)$/,
    REGEX_OL_ITEM    = /^[ \t]{0,3}\d{1,9}[.)][ \t]+(.*)$/,
    REGEX_QUOTE      = /^[ \t]{0,3}>[ \t]?(.*)$/,
    REGEX_UL_ITEM    = /^[ \t]{0,3}[-*+][ \t]+(.*)$/;

/**
 * A GFM table delimiter row: at least two `:?---:?` cells separated by pipes.
 * The two-column floor keeps prose containing a stray `|` unambiguous.
 * @param {String} line
 * @returns {Boolean}
 */
function isTableDelimiter(line) {
    if (!line?.includes('|')) {
        return false
    }

    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');

    return cells.length >= 2 && cells.every(cell => /^:?-+:?$/.test(cell.trim()))
}

/**
 * Splits a table row into trimmed cell strings (outer pipes optional).
 * @param {String} line
 * @returns {String[]}
 */
function splitTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}

/**
 * Inline tokenizer order matters: code spans are atomic (their interior is protected from
 * every other pass), links capture before emphasis so labels can contain it, strong before
 * em so `**` is not consumed as two `*`.
 * @type {RegExp}
 */
const REGEX_INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|!?\[([^\]]*)\]\(([^)\s]*)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

/**
 * @summary The per-component streaming markdown parser with a stable-id block ledger.
 *
 * Plain ES class on purpose — instances are trivially constructable in any realm; the owning
 * component (or a Node-side prerenderer) holds one instance per rendered source lifetime.
 */
export default class MarkdownParser {
    /**
     * Ordered ledger of parsed blocks: `{id, type, source, open, vdom}` — `source` is the raw
     * slice the block was parsed from (the memo key), `open` marks the streaming tail (an
     * unterminated fence or the trailing paragraph) which the next append re-parses.
     * @member {Object[]} #blocks
     * @private
     */
    #blocks = [];
    /**
     * Monotonic block-id sequence. Never recycled — including across `reset()` — so a reset
     * cannot re-birth a previously-live block id (the cross-batch two-nodes-one-id defect class).
     * @member {Number} #seq
     * @private
     */
    #seq = 0;
    /**
     * The full source of the last `update()` call, for append detection.
     * @member {String} #source
     * @private
     */
    #source = '';

    /**
     * @param {Object} [config]
     * @param {String} [config.idPrefix='neo-md'] Unique prefix (typically the owning component
     * id) namespacing every emitted vdom id.
     */
    constructor({idPrefix = 'neo-md'} = {}) {
        /**
         * @member {String} idPrefix
         */
        this.idPrefix = idPrefix
    }

    /**
     * The current block count (diagnostics / tests).
     * @returns {Number}
     */
    get blockCount() {
        return this.#blocks.length
    }

    /**
     * The virtualization index: one `{id, type, units, open}` entry per block, in render order.
     * `units` is the block's structural content size (content lines for code/paragraphs/quotes,
     * items for lists, rows+header for tables, 1 for headings/breaks) — the owner maps units to
     * estimated pixel heights. Settled blocks are immutable, so their `units` are measure-once
     * facts; only the open tail entry can still change.
     * @returns {Object[]}
     */
    get blockMeta() {
        return this.#blocks.map(block => ({
            id   : block.id,
            type : block.type,
            units: block.units,
            open : block.open
        }))
    }

    /**
     * Clears the block ledger and source memory. The id sequence deliberately keeps counting —
     * see `#seq`.
     */
    reset() {
        this.#blocks = [];
        this.#source = ''
    }

    /**
     * @summary Parses the full markdown source, reusing settled blocks on streaming appends.
     *
     * Append path (`source.startsWith(previous)`): settled blocks are returned by reference
     * (same objects, same ids — the differ no-ops them); the open tail block re-parses merged
     * with the appended slice and keeps its id (growth = in-place mutation, not re-birth).
     * Non-append path: full reset, fresh ids for every block.
     * @param {String} source The complete markdown source seen so far
     * @returns {Object[]} The ordered block vdom array (the owning component's `cn`)
     */
    update(source) {
        const me = this;

        source ??= '';

        if (source !== me.#source) {
            const previous = me.#source;

            if (previous.length > 0 && source.startsWith(previous)) {
                me.#appendParse(source, source.slice(previous.length))
            } else {
                me.reset();
                me.#blocks = me.#segment(source).map(raw => me.#createBlock(raw))
            }

            me.#source = source
        }

        return me.#blocks.map(block => block.vdom)
    }

    /**
     * Incremental tail re-parse: drop the open tail block (its id is reused for its grown
     * continuation), keep every settled block untouched, segment only the tail slice.
     * @param {String} source The new full source
     * @param {String} appended The appended slice
     * @private
     */
    #appendParse(source, appended) {
        const
            me   = this,
            tail = me.#blocks.at(-1);

        let reuseId   = null,
            tailSlice = appended;

        if (tail?.open) {
            me.#blocks.pop();
            reuseId   = tail.id;
            tailSlice = tail.source + appended
        }

        me.#segment(tailSlice).forEach((raw, index) => {
            me.#blocks.push(me.#createBlock(raw, index === 0 ? reuseId : null))
        })
    }

    /**
     * Parses one raw block slice into its ledger entry. The optional id reuse serves exactly
     * one case: the open tail block growing across appends (same identity, in-place diff).
     * @param {Object} raw `{type, lines, lang, open, source}` from the segmenter
     * @param {String|null} [reuseId=null]
     * @returns {Object} The ledger entry `{id, type, source, open, units, vdom}`
     * @private
     */
    #createBlock(raw, reuseId = null) {
        const
            me = this,
            id = reuseId ?? `${me.idPrefix}__md-${me.#seq++}`;

        let child = 0;

        const childId = () => `${id}-c${child++}`;

        let vdom;

        switch (raw.type) {
            case BLOCK_TYPES.break:
                vdom = {tag: 'hr', id};
                break
            case BLOCK_TYPES.code:
                vdom = {
                    tag: 'pre',
                    id,
                    cls: ['neo-md-code'],
                    cn : [{
                        tag: 'code',
                        id : childId(),
                        ...(raw.lang ? {cls: [`language-${raw.lang}`]} : {}),
                        cn : [{vtype: 'text', id: childId(), text: raw.lines.join('\n')}]
                    }]
                };
                break
            case BLOCK_TYPES.heading:
                vdom = {
                    tag: `h${raw.level}`,
                    id,
                    cls: [`neo-h${raw.level}`],
                    cn : me.#parseInline(raw.lines[0], childId)
                };
                break
            case BLOCK_TYPES.list:
                vdom = {
                    tag: raw.ordered ? 'ol' : 'ul',
                    id,
                    cn : raw.items.map(item => ({
                        tag: 'li',
                        id : childId(),
                        cn : me.#parseInline(item, childId)
                    }))
                };
                break
            case BLOCK_TYPES.quote:
                vdom = {
                    tag: 'blockquote',
                    id,
                    cls: ['neo-md-quote'],
                    cn : me.#parseInline(raw.lines.join(' '), childId)
                };
                break
            case BLOCK_TYPES.table:
                vdom = {
                    tag: 'table',
                    id,
                    cls: ['neo-md-table'],
                    cn : [
                        {tag: 'thead', id: childId(), cn: [{
                            tag: 'tr',
                            id : childId(),
                            cn : raw.header.map(cell => ({tag: 'th', id: childId(), cn: me.#parseInline(cell, childId)}))
                        }]},
                        {tag: 'tbody', id: childId(), cn: raw.rows.map(row => ({
                            tag: 'tr',
                            id : childId(),
                            cn : row.map(cell => ({tag: 'td', id: childId(), cn: me.#parseInline(cell, childId)}))
                        }))}
                    ]
                };
                break
            default:
                vdom = {
                    tag: 'p',
                    id,
                    cn : me.#parseInline(raw.lines.join(' '), childId)
                }
        }

        // Structural size units for virtualization estimates: content lines for code /
        // paragraphs / quotes, items for lists, rows + header for tables, 1 for the rest.
        // Settled-immutability makes these measure-once facts.
        const units = raw.type === BLOCK_TYPES.list  ? raw.items.length :
                      raw.type === BLOCK_TYPES.table ? raw.rows.length + 1 :
                      raw.lines                      ? Math.max(raw.lines.length, 1) :
                      1;

        return {id, type: raw.type, source: raw.source, open: raw.open, units, vdom}
    }

    /**
     * Inline pass: code spans (atomic), links/images (allowlisted destinations), strong, em.
     * Everything outside a token — including raw HTML, which the engine renders inert via
     * `textContent` — lands in text nodes.
     * @param {String} content
     * @param {Function} childId The block-scoped deterministic id dispenser
     * @returns {Object[]} vdom `cn` array
     * @private
     */
    #parseInline(content, childId) {
        const
            cn   = [],
            text = value => value && cn.push({vtype: 'text', id: childId(), text: value});

        let cursor = 0;

        for (const match of content.matchAll(REGEX_INLINE)) {
            const [full, , codeSpan, label, destination, strong, em] = match;

            text(content.slice(cursor, match.index));
            cursor = match.index + full.length;

            if (codeSpan !== undefined) {
                cn.push({tag: 'code', id: childId(), cls: ['neo-md-inline-code'], cn: [
                    {vtype: 'text', id: childId(), text: codeSpan.trim()}
                ]})
            } else if (destination !== undefined) {
                if (!SAFE_DESTINATION.test(destination) || full.startsWith('!')) {
                    // Disallowed scheme — or an image, which v1 renders as its inert source
                    // text (image policy ships with the component leaf, not the nucleus).
                    text(full)
                } else {
                    cn.push({
                        tag : 'a',
                        id  : childId(),
                        href: destination,
                        cn  : [{vtype: 'text', id: childId(), text: label || destination}]
                    })
                }
            } else if (strong !== undefined) {
                cn.push({tag: 'strong', id: childId(), cn: [{vtype: 'text', id: childId(), text: strong}]})
            } else if (em !== undefined) {
                cn.push({tag: 'em', id: childId(), cn: [{vtype: 'text', id: childId(), text: em}]})
            }
        }

        text(content.slice(cursor));

        return cn
    }

    /**
     * Line-based block segmentation. Fences consume everything until their closing marker —
     * or the end of input, which leaves them `open` (the streaming state the next append
     * continues). A trailing paragraph with no blank-line terminator is equally `open`.
     * @param {String} source
     * @returns {Object[]} raw blocks `{type, lines, level?, lang?, open, source}`
     * @private
     */
    #segment(source) {
        const
            blocks = [],
            lines  = source.split('\n');

        let index = 0;

        while (index < lines.length) {
            const line = lines[index];

            if (REGEX_BLANK.test(line)) {
                index++;
                continue
            }

            const fence = line.match(REGEX_FENCE_OPEN);

            if (fence) {
                const
                    marker  = fence[1],
                    // A closing fence is marker characters ONLY (at least as many as the opener,
                    // same character, no info string) — `\`\`\`js` inside a fence must NOT close it.
                    closeRe = new RegExp(`^${marker[0]}{${marker.length},}[ \\t]*$`),
                    start   = index,
                    content = [];

                let closed = false;

                index++;

                while (index < lines.length) {
                    if (closeRe.test(lines[index])) {
                        closed = true;
                        index++;
                        break
                    }

                    content.push(lines[index]);
                    index++
                }

                blocks.push({
                    type  : BLOCK_TYPES.code,
                    lines : content,
                    lang  : fence[2] || null,
                    open  : !closed,
                    source: lines.slice(start, index).join('\n')
                });
                continue
            }

            const heading = line.match(REGEX_HEADING);

            if (heading) {
                blocks.push({
                    type  : BLOCK_TYPES.heading,
                    lines : [heading[2].trim()],
                    level : heading[1].length,
                    open  : false,
                    source: line
                });
                index++;
                continue
            }

            if (REGEX_BREAK.test(line)) {
                blocks.push({type: BLOCK_TYPES.break, open: false, source: line});
                index++;
                continue
            }

            const listMatch = line.match(REGEX_UL_ITEM) ? 'ul' : line.match(REGEX_OL_ITEM) ? 'ol' : null;

            if (listMatch) {
                const
                    ordered = listMatch === 'ol',
                    itemRe  = ordered ? REGEX_OL_ITEM : REGEX_UL_ITEM,
                    start   = index,
                    items   = [];

                while (index < lines.length) {
                    const current = lines[index],
                          item    = current.match(itemRe);

                    if (item) {
                        items.push(item[1].trim())
                    } else if (items.length > 0 && !this.#opensBlock(current)) {
                        // Soft-wrapped continuation of the previous item.
                        items[items.length - 1] += ' ' + current.trim()
                    } else {
                        break
                    }

                    index++
                }

                blocks.push({
                    type  : BLOCK_TYPES.list,
                    items,
                    ordered,
                    open  : index >= lines.length,
                    source: lines.slice(start, index).join('\n')
                });
                continue
            }

            if (REGEX_QUOTE.test(line)) {
                const
                    start   = index,
                    content = [];

                while (index < lines.length && REGEX_QUOTE.test(lines[index])) {
                    content.push(lines[index].match(REGEX_QUOTE)[1]);
                    index++
                }

                blocks.push({
                    type  : BLOCK_TYPES.quote,
                    lines : content,
                    open  : index >= lines.length,
                    source: lines.slice(start, index).join('\n')
                });
                continue
            }

            if (line.includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
                const
                    start  = index,
                    header = splitTableRow(line),
                    rows   = [];

                index += 2; // header + delimiter row

                while (index < lines.length && lines[index].includes('|') && !REGEX_BLANK.test(lines[index])) {
                    // Pad / truncate body rows to the header's column count.
                    const cells = splitTableRow(lines[index]);

                    while (cells.length < header.length) {
                        cells.push('')
                    }

                    rows.push(cells.slice(0, header.length));
                    index++
                }

                blocks.push({
                    type  : BLOCK_TYPES.table,
                    header,
                    rows,
                    open  : index >= lines.length,
                    source: lines.slice(start, index).join('\n')
                });
                continue
            }

            const
                start   = index,
                content = [];

            while (index < lines.length && !this.#opensBlock(lines[index])) {
                content.push(lines[index]);
                index++
            }

            blocks.push({
                type  : BLOCK_TYPES.paragraph,
                lines : content,
                // A paragraph is only "settled" once a terminator (blank line / next block
                // opener) exists after it — the trailing paragraph stays open for appends.
                open  : index >= lines.length,
                source: lines.slice(start, index).join('\n')
            })
        }

        return blocks
    }

    /**
     * True when a line opens a non-paragraph block — the paragraph terminator and the
     * list-continuation boundary share this single definition. Table headers are deliberately
     * absent: a `|`-containing line is paragraph text until its delimiter row exists, which is
     * what lets a streamed table promote from the open tail paragraph when the delimiter
     * arrives in a later chunk.
     * @param {String} line
     * @returns {Boolean}
     * @private
     */
    #opensBlock(line) {
        return REGEX_BLANK.test(line)      ||
            REGEX_FENCE_OPEN.test(line)    ||
            REGEX_HEADING.test(line)       ||
            REGEX_BREAK.test(line)         ||
            REGEX_UL_ITEM.test(line)       ||
            REGEX_OL_ITEM.test(line)       ||
            REGEX_QUOTE.test(line)
    }
}
