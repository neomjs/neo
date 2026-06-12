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
 * The component stays deliberately thin: streaming intelligence (append detection, settled-block
 * memoization, id stability) lives in the realm-pure parser; this class only binds the reactive
 * `value` config to the parser's output.
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
         * The markdown source. Streaming producers re-assign the GROWING full source
         * (`value = previous + chunk`); the parser detects the append and re-parses only the
         * open tail block. Any non-append assignment resets the block ledger with fresh ids.
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null
    }

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
     * parser's output. Settled blocks come back reference-identical, so the vdom engine
     * no-ops them; only genuine tail changes produce deltas.
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
            me.vdom.cn = me.parser.update(value)
        } else {
            me.parser.reset();
            me.vdom.cn = []
        }

        me.update()
    }
}

export default Neo.setupClass(MarkdownComponent);
