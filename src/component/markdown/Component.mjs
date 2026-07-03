import BaseComponent  from '../Base.mjs';
import MarkdownParser from './Parser.mjs';

/**
 * @summary Streaming-first markdown component rendering through pure VDOM block subtrees.
 *
 * The transcript-grade counterpart to `Neo.component.Markdown` (which is docs-grade: marked-based
 * HTML-string rendering with the portal's embedded-block pipeline). This component never touches
 * an HTML string: its `MarkdownParser` emits per-block vdom subtrees with stable memoized ids, so
 * a streaming `value` append diffs as one insert-only tail batch while the settled prefix no-ops,
 * and growth of the open tail block lands as in-place `updateVtext` mutation. That makes it the
 * right primitive for LLM/agent response surfaces — including hostile input, which the parser
 * renders inert by construction (escaped-text raw HTML, protocol-allowlisted links).
 *
 * **Marathon transcripts — settled-block windowing:** with `virtualize: true` (the default) only
 * the blocks intersecting the viewport plus `bufferPages` of slack mount into the DOM; evicted
 * ranges collapse into two spacer divs sized from ESTIMATED block heights (`unitHeights` × the
 * parser's structural `units` — content lines, list items, table rows). Deliberately not
 * pixel-perfect: the over-mounted buffer absorbs estimate drift, which is the right trade for
 * hundreds-of-pages sessions. Eviction and scroll-back re-entry ride the engine's legitimate
 * remove→re-insert lifecycle with reference-memoized subtrees, and the streaming tail window
 * follows appends whenever the user has not scrolled away from the bottom. Settled blocks are
 * immutable by parser contract, so every estimate is a measure-once fact.
 *
 * The component stays deliberately thin: streaming intelligence (append detection, settled-block
 * memoization, id stability) lives in the realm-pure parser; this class binds the reactive
 * `value` config to the parser's output and owns only the windowing geometry.
 * @class Neo.component.markdown.Component
 * @extends Neo.component.Base
 */
class MarkdownComponent extends BaseComponent {
    static config = {
        /**
         * @member {String} className='Neo.component.markdown.Component'
         * @protected
         */
        className: 'Neo.component.markdown.Component',
        /**
         * @member {String} ntype='markdown-vdom'
         * @protected
         */
        ntype: 'markdown-vdom',
        /**
         * @member {String[]} baseCls=['neo-markdown-vdom']
         * @protected
         */
        baseCls: ['neo-markdown-vdom'],
        /**
         * Pages of estimated viewport height mounted ABOVE and BELOW the visible range.
         * Generous on purpose: one extra page each way costs little and hides estimate drift.
         * @member {Number} bufferPages_=1
         * @reactive
         */
        bufferPages_: 1,
        /**
         * Estimated pixel height per structural unit, keyed by the parser's block types.
         * `fallbackViewport` seeds the window math before the first scroll event delivers a
         * real `clientHeight`. Estimates, not measurements — see the class summary.
         * @member {Object} unitHeights
         */
        unitHeights: {
            break          : 34,
            code           : 21,
            fallbackViewport: 800,
            heading        : 52,
            list           : 30,
            paragraph      : 26,
            quote          : 28,
            table          : 38
        },
        /**
         * The markdown source. Streaming producers re-assign the GROWING full source
         * (`value = previous + chunk`); the parser detects the append and re-parses only the
         * open tail block. Any non-append assignment resets the block ledger with fresh ids.
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
        /**
         * False renders every parsed block unconditionally (the pre-windowing behavior).
         * @member {Boolean} virtualize_=true
         * @reactive
         */
        virtualize_: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.addDomListeners([
            {scroll: this.onTranscriptScroll, scope: this}
        ])
    }

    /**
     * Last observed viewport height (px); 0 until the first scroll event reports one.
     * @member {Number} clientHeight=0
     * @protected
     */
    clientHeight = 0
    /**
     * True while the component follows the streaming tail (the initial state). Follow-mode
     * transitions ride REAL scroll geometry only — direction deltas between scroll events —
     * never estimate-space comparisons: the tail pin itself fires scroll events (echoes), and
     * mixing those with estimated heights creates a feedback loop that drifts the window.
     * A genuine upward jump (more than half a viewport against the last position) exits
     * follow-mode; scrolling back within 1.5 viewports of the deepest position seen re-enters.
     * @member {Boolean} followMode=true
     * @protected
     */
    followMode = true
    /**
     * The scrollTop reported by the previous scroll event — the direction-delta baseline.
     * @member {Number} lastScrollTop=0
     * @protected
     */
    lastScrollTop = 0
    /**
     * The deepest scrollTop observed (real geometry) — the re-enter-follow reference.
     * @member {Number} maxScrollSeen=0
     * @protected
     */
    maxScrollSeen = 0
    /**
     * The currently mounted block index range `[start, endExclusive]` — the `mountedRows`
     * analog of `Neo.grid.Body`.
     * @member {Number[]} mountedBlocks=[0,0]
     * @protected
     */
    mountedBlocks = [0, 0]
    /**
     * Last observed scrollTop (px).
     * @member {Number} scrollTop=0
     * @protected
     */
    scrollTop = 0

    /**
     * The lazily-created streaming parser. Lazy on purpose: reactive config processing fires
     * `afterSetValue` during `super.construct()`, before any field initializer on this class
     * would have run — the getter sidesteps that ordering hazard and binds the parser's id
     * namespace to this component's id exactly once.
     * @returns {MarkdownParser}
     */
    get parser() {
        return this._parser ??= new MarkdownParser({idPrefix: this.id})
    }

    /**
     * Triggered after the value config got changed: swaps the rendered block set to the
     * parser's output (windowed when `virtualize` is on). Settled blocks come back
     * reference-identical, so the vdom engine no-ops them; only genuine tail changes produce
     * deltas.
     *
     * A nullish value is a RESET boundary, not just an empty render: the parser ledger resets
     * with it, so replaying even the identical source afterwards births fresh block ids — the
     * cleared ids never resurrect across the wipe (the no-id-reuse-across-reset contract; the
     * block sequence keeps counting by design).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        if (value) {
            me.renderWindow(me.parser.update(value), true)
        } else {
            // The reset boundary covers BOTH state owners: the parser's block ledger AND this
            // component's windowing state machine. A fresh stream after a wipe must start in
            // follow-mode at the tail — stale reader-mode state (followMode false, old scroll
            // depths) would mount the HEAD window for the new transcript. The viewport size
            // survives on purpose: the element did not change.
            me.parser.reset();
            me.followMode    = true;
            me.lastScrollTop = 0;
            me.maxScrollSeen = 0;
            me.scrollTop     = 0;
            me.mountedBlocks = [0, 0];
            me.vdom.cn       = [];
            me.update()
        }
    }

    /**
     * Triggered after the virtualize config got changed at runtime: re-renders the current
     * block set under the new mode.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetVirtualize(value, oldValue) {
        let me = this;

        if (oldValue !== undefined && me.value) {
            me.renderWindow(me.parser.update(me.value), false)
        }
    }

    /**
     * Estimated pixel height of one block from its structural units — never a DOM measurement.
     * @param {Object} meta A `parser.blockMeta` entry `{id, type, units, open}`
     * @returns {Number}
     */
    estimateHeight(meta) {
        const {unitHeights} = this;

        return (unitHeights[meta.type] ?? unitHeights.paragraph) * meta.units
    }

    /**
     * Scroll listener — the follow-mode state machine over REAL geometry:
     *
     * - In follow-mode, scroll events are mostly the tail pin's own echoes and are ignored
     *   for windowing; only a genuine upward jump (half a viewport against the previous
     *   position) exits follow and hands the window to the reader.
     * - Outside follow-mode, returning within 1.5 viewports of the deepest position seen
     *   re-enters follow (tail window + pin); otherwise the page-quantized window recomputes
     *   and re-renders ONLY when the mounted range actually moved — scrolling inside the
     *   buffer is delta-free.
     * @param {Object} data Main-thread scroll payload
     * @param {Number} data.scrollTop
     * @param {Number} [data.clientHeight]
     * @protected
     */
    onTranscriptScroll({scrollTop, clientHeight}) {
        let me = this;

        clientHeight && (me.clientHeight = clientHeight);

        const
            viewport = me.clientHeight || me.unitHeights.fallbackViewport,
            upJump   = me.lastScrollTop - scrollTop > viewport / 2;

        me.scrollTop     = scrollTop;
        me.lastScrollTop = scrollTop;
        me.maxScrollSeen = Math.max(me.maxScrollSeen, scrollTop);

        if (!me.virtualize || !me.value) {
            return
        }

        if (me.followMode) {
            if (upJump) {
                me.followMode = false;
                me.renderWindow(me.parser.update(me.value), false)
            }
            // else: pin echo / minor drift — no windowing reaction.
        } else if (me.maxScrollSeen - scrollTop < viewport * 1.5) {
            me.followMode = true;
            me.renderWindow(me.parser.update(me.value), true)
        } else {
            const range = me.windowRange(me.parser.blockMeta);

            if (range[0] !== me.mountedBlocks[0] || range[1] !== me.mountedBlocks[1]) {
                me.renderWindow(me.parser.update(me.value), false)
            }
        }
    }

    /**
     * Renders the current block set: every block when `virtualize` is off, otherwise the
     * mounted window framed by two estimate-sized spacer divs. The spacers carry STABLE ids,
     * so window movement diffs as spacer-height `updateNode`s plus inserts/removes at the
     * window edges — never wholesale churn.
     * @param {Object[]} blocks The parser's full block vdom array
     * @param {Boolean} followTail True (value appends) keeps the tail mounted when the user
     * is at/near the bottom; false (scroll/mode changes) preserves the scrolled window.
     * @protected
     */
    renderWindow(blocks, followTail) {
        let me = this;

        if (!me.virtualize) {
            me.mountedBlocks = [0, blocks.length];
            me.vdom.cn       = blocks;
            me.update();
            return
        }

        const
            meta     = me.parser.blockMeta,
            viewport = me.clientHeight || me.unitHeights.fallbackViewport,
            atTail   = me.followMode;

        let range;

        if (followTail && atTail) {
            // Streaming follow: mount the tail window (last viewport + buffer pages worth).
            range = me.tailRange(meta, viewport)
        } else {
            range = me.windowRange(meta)
        }

        const
            topHeight    = me.rangeEstimate(meta, 0, range[0]),
            bottomHeight = me.rangeEstimate(meta, range[1], meta.length);

        me.mountedBlocks = range;

        me.vdom.cn = [
            {tag: 'div', id: `${me.id}__md-top-spacer`, cls: ['neo-md-spacer'], style: {height: `${topHeight}px`}},
            ...blocks.slice(range[0], range[1]),
            {tag: 'div', id: `${me.id}__md-bottom-spacer`, cls: ['neo-md-spacer'], style: {height: `${bottomHeight}px`}}
        ];

        if (followTail && atTail) {
            // Pin the DOM scroll position to the tail, not just the mounted window: the
            // browser clamps the overshoot to the real maximum, which makes the estimate
            // error irrelevant — overshoot IS "bottom". Without this, a streaming reader
            // would sit at scrollTop 0 staring into the top spacer.
            me.vdom.scrollTop = topHeight + me.rangeEstimate(meta, range[0], meta.length) + 100000
        }

        me.update()
    }

    /**
     * Sums estimated heights over a block index range.
     * @param {Object[]} meta
     * @param {Number} start
     * @param {Number} end Exclusive
     * @returns {Number}
     * @protected
     */
    rangeEstimate(meta, start, end) {
        let sum = 0,
            i   = start;

        for (; i < end; i++) {
            sum += this.estimateHeight(meta[i])
        }

        return sum
    }

    /**
     * The mounted range for a tail-following render: walks backwards from the last block
     * until viewport + buffer pages of estimated height accumulate.
     * @param {Object[]} meta
     * @param {Number} viewport
     * @returns {Number[]} `[start, endExclusive]`
     * @protected
     */
    tailRange(meta, viewport) {
        const target = viewport * (1 + this.bufferPages);

        let height = 0,
            start  = meta.length;

        while (start > 0 && height < target) {
            start--;
            height += this.estimateHeight(meta[start])
        }

        return [start, meta.length]
    }

    /**
     * The mounted range for the current scroll position: all blocks whose estimated extent
     * intersects the PAGE-QUANTIZED window `[(page - buffer) ... (page + 1 + buffer)]` pages.
     * Quantizing to viewport pages is the load-bearing trick: scrolling within a page never
     * moves the range (zero deltas), and crossing a page boundary slides it by whole pages —
     * the literal "mount one more page" semantics. Linear scan on purpose — block counts sit
     * in the thousands and the scan is microseconds; binary search over prefix sums is
     * complexity this estimate-grade math does not need.
     * @param {Object[]} meta
     * @returns {Number[]} `[start, endExclusive]`
     * @protected
     */
    windowRange(meta) {
        let me = this;

        const
            viewport = me.clientHeight || me.unitHeights.fallbackViewport,
            page     = Math.floor(me.scrollTop / viewport),
            lower    = Math.max(0, (page - me.bufferPages) * viewport),
            upper    = (page + 1 + me.bufferPages) * viewport;

        let cursor = 0,
            start  = 0,
            end    = meta.length,
            startFound = false,
            i = 0;

        for (; i < meta.length; i++) {
            const next = cursor + me.estimateHeight(meta[i]);

            if (!startFound && next > lower) {
                start      = i;
                startFound = true
            }

            if (cursor > upper) {
                end = i;
                break
            }

            cursor = next
        }

        return [start, end]
    }
}

export default Neo.setupClass(MarkdownComponent);
