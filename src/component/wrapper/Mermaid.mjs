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
         * The mermaid diagram code.
         * Changing this value will automatically trigger a re-render of the diagram.
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
        /**
         * @member {Object} _vdom={cls: ['neo-mermaid']}
         */
        _vdom: {cls: ['neo-mermaid']}
    }

    /**
     * Stores the remote proxy instance of the Mermaid addon.
     * This proxy is retrieved during `initAsync` and is used to invoke methods on the Main thread.
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
     * Renders the Mermaid diagram.
     * This method waits for the component to be fully initialized (ready) and then invokes
     * the `render` method on the remote addon proxy.
     * @returns {Promise<void>}
     */
    async render() {
        let me = this;

        if (me.mounted && me.value) {
            await me.ready();

            await me.addon.render({
                code    : me.value,
                id      : me.id,
                windowId: me.windowId
            })
        }
    }
}

export default Neo.setupClass(Mermaid);