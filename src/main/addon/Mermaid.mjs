import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon to render Mermaid diagrams.
 *
 * This addon is responsible for loading the Mermaid library and rendering diagrams into the DOM.
 * Since Mermaid requires direct DOM access, it must run on the Main Thread.
 *
 * It is primarily consumed by:
 * 1. `Neo.component.Markdown`: For rendering ```mermaid``` code blocks embedded in Markdown content.
 * 2. `Neo.component.wrapper.Mermaid`: A standalone component wrapper for displaying Mermaid diagrams.
 *
 * @class Neo.main.addon.Mermaid
 * @extends Neo.main.addon.Base
 */
class Mermaid extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Mermaid'
         * @protected
         */
        className: 'Neo.main.addon.Mermaid',
        /**
         * List methods which must get cached until the addon reaches its `isReady` state
         * @member {String[]} interceptRemotes
         */
        interceptRemotes: [
            'render'
        ],
        /**
         * @member {String} mermaidPath=Neo.config.basePath+'node_modules/mermaid/dist/mermaid.min.js'
         * @protected
         */
        mermaidPath: Neo.config.basePath + 'node_modules/mermaid/dist/mermaid.min.js',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'render'
            ]
        },
        /**
         * @member {Boolean} useLazyLoading=true
         */
        useLazyLoading: true
    }

    /**
     * Loads the Mermaid library if it is not already present.
     * Initializes the library with `startOnLoad: false` to allow manual control over rendering.
     * @returns {Promise<void>}
     */
    async loadFiles() {
        if (window.mermaid) return;

        await DomAccess.loadScript(this.mermaidPath);
        mermaid.initialize({startOnLoad: false})
    }

    /**
     * Renders a Mermaid diagram into a specific DOM element.
     * @param {Object} data
     * @param {String} [data.code] The mermaid diagram syntax/code. If provided, it will replace the element's text content.
     * @param {String} data.id The DOM ID of the container element.
     */
    render(data) {
        const element = document.getElementById(data.id);

        if (element) {
            if (data.code) {
                element.textContent = data.code
            }

            mermaid.run({
                nodes: [element]
            })
        }
    }
}

export default Neo.setupClass(Mermaid);