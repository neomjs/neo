import Component from './Base.mjs';

/**
 * @summary A specialized component for rendering Markdown content.
 *
 * This component acts as a wrapper around the `Neo.code.renderer.Markdown` logic, providing a
 * declarative way to display Markdown within a Neo.mjs application. It encapsulates the
 * rendering logic and styling, ensuring consistency across different views.
 *
 * It supports:
 * - **Reactive Content**: Updates automatically when the `value` config changes.
 * - **Interactive Elements**: Properly mounts and manages embedded Neo.mjs components (`live-preview`, `neo-component`).
 * - **Lifecycle Management**: Handles the destruction of embedded components when this component is destroyed.
 *
 * @class Neo.component.Markdown
 * @extends Neo.component.Base
 */
class Markdown extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Markdown'
         * @protected
         */
        className: 'Neo.component.Markdown',
        /**
         * @member {String} ntype='markdown'
         * @protected
         */
        ntype: 'markdown',
        /**
         * @member {String[]} baseCls=['neo-markdown-component']
         * @protected
         */
        baseCls: ['neo-markdown-component'],
        /**
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * @member {Neo.code.renderer.Markdown|null} renderer=null
     */
    renderer = null

    /**
     * @member {RegExp} regexInlineCode=/`([^`]+)`/g
     * @protected
     * @static
     */
    static regexInlineCode = /`([^`]+)`/g

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.renderer?.updateComponentState(value)
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    async afterSetValue(value, oldValue) {
        if (value) {
            let me = this;

            value = me.modifyMarkdown(value);

            if (!me.renderer) {
                const module = await import('../code/renderer/Markdown.mjs');
                me.renderer = Neo.create(module.default);
            }

            // Clean up previous instances
            me.renderer.destroyComponents();

            await me.renderer.render({
                code     : value,
                container: me,
                context: {
                    appName        : me.appName,
                    windowId       : me.windowId,
                    parentComponent: me
                }
            });
        }
    }

    /**
     * Destroy all created child instances
     */
    destroy(...args) {
        this.renderer?.destroyComponents();
        super.destroy(...args)
    }

    /**
     * Modifies the markdown content before rendering.
     * Default implementation parses headlines to add specific classes.
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me            = this,
            rows          = content.split('\n'),
            i             = 0,
            len           = rows.length,
            headlineIndex = 1,
            row, tag;

        for (; i < len; i++) {
            row = rows[i];
            tag = null;

            if (row.startsWith('#') && row.charAt(1) !== '#') {
                row = row.substring(1).trim();
                tag = 'h1'
            } else if (row.startsWith('##') && row.charAt(2) !== '#') {
                row = row.substring(2).trim();
                tag = 'h2'
            } else if (row.startsWith('###') && row.charAt(3) !== '#') {
                row = row.substring(3).trim();
                tag = 'h3'
            }

            if (tag) {
                rows[i] = me.onHeadline(tag, row, headlineIndex);
                headlineIndex++
            }
        }

        return rows.join('\n')
    }

    /**
     * @param {String} tag
     * @param {String} text
     * @param {Number} index
     * @returns {String}
     */
    onHeadline(tag, text, index) {
        text = text.replace(this.constructor.regexInlineCode, '<code>$1</code>');
        return `<${tag} class="neo-${tag}">${text}</${tag}>`
    }
}

export default Neo.setupClass(Markdown);
