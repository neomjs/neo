import Component from '../Base.mjs';

/**
 * @summary A wrapper component for rendering Mermaid diagrams.
 *
 * This class abstracts the communication with the Main thread `Mermaid` addon, allowing developers
 * to use a declarative component to display Mermaid diagrams. It handles the lifecycle management,
 * ensuring the addon is loaded and the diagram is re-rendered when the `value` config changes.
 *
 * It uses the `Neo.main.addon.Mermaid` remote API to perform the actual rendering on the Main thread,
 * passing the diagram code and the target element ID.
 *
 * @class Neo.component.wrapper.Mermaid
 * @extends Neo.component.Base
 */
class Mermaid extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.Mermaid'
         * @protected
         */
        className: 'Neo.component.wrapper.Mermaid',
        /**
         * @member {String} ntype='mermaid'
         * @protected
         */
        ntype: 'mermaid',
        /**
         * @member {String[]} baseCls=['neo-mermaid']
         */
        baseCls: ['neo-mermaid'],
        /**
         * @member {String|null} mermaidTheme=null
         */
        mermaidTheme: null,
        /**
         * @member {Object} themeMap
         */
        themeMap: {
            'neo-theme-cyberpunk': 'dark',
            'neo-theme-dark'     : 'dark',
            'neo-theme-light'    : 'default',
            'neo-theme-neo-dark' : 'dark',
            'neo-theme-neo-light': 'default'
        },
        /**
         * The mermaid diagram code.
         * Changing this value will automatically trigger a re-render of the diagram.
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null
    }

    /**
     * Stores the remote proxy instance of the Mermaid addon.
     * Retrieved during initialization and refreshed after admitting the current window before rendering.
     * @member {Object|null} addon=null
     * @protected
     */
    addon = null

    /**
     * Triggered after the component is mounted.
     * Checks if there is a value to render and triggers the rendering process.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            this.render()
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);
        this.render()
    }

    /**
     * Triggered when the mermaid code value changes.
     * Triggers a re-render to update the diagram.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.render()
        }
    }

    /**
     * Initializes the component asynchronously.
     * Retrieves the Mermaid addon proxy from the current worker for the specific window.
     * This ensures the addon is loaded and ready for communication.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        this.addon = await Neo.currentWorker.getAddon('Mermaid', this.windowId)
    }

    /**
     * @returns {Promise<void>}
     */
    async loadFiles() {
        return this.addon.loadFiles()
    }

    /**
     * @summary Renders through the current window's addon after its per-window admission. A moved component
     * must load the addon in its destination even when the global proxy already exists. Source, window and
     * owner checks prevent late admission results from dispatching or replacing a newer borrowed proxy.
     * @returns {Promise<void>}
     */
    async render() {
        let me = this;

        if (me.mounted && me.value) {
            const windowId = me.windowId,
                  value    = me.value,
                  current  = () => !me.isDestroyed && me.mounted && me.windowId === windowId && me.value === value;

            try {
                await me.ready();

                if (!current()) return;

                const addon = await Neo.currentWorker.getAddon('Mermaid', windowId);

                if (!current()) return;

                me.addon = addon;

                await addon.render({
                    code: `---\nconfig:\n  theme: ${me.resolveTheme()}\n---\n${value}`,
                    id  : me.id,
                    windowId
                })
            } catch (error) {
                if (current()) throw error
            }
        }
    }

    /**
     * @summary Maps this component's resolved theme onto one of mermaid's own theme names.
     *
     * Resolution goes through {@link Neo.component.Base#getTheme}, never the `theme` config, which is
     * `null` for precisely the components that inherit a theme — reading it rendered mermaid's light
     * `'default'` in a dark app on every path except a toggle. Shape:
     * {@link Neo.component.wrapper.MonacoEditor#resolveEditorTheme}.
     * @returns {String}
     * @protected
     */
    resolveTheme() {
        let me = this;

        return me.mermaidTheme || me.themeMap[me.getTheme()] || 'default'
    }
}

export default Neo.setupClass(Mermaid);
