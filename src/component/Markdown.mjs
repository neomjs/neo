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
}

export default Neo.setupClass(Markdown);
