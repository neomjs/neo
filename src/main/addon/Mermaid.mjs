import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon for rendering Mermaid diagrams with dynamic theme support.
 *
 * This addon manages the lifecycle of the Mermaid.js library on the Main Thread. It provides a robust,
 * theme-aware rendering engine that integrates seamlessly with the Neo.mjs component system.
 *
 * Key features:
 * - **Lazy Loading:** Dynamically loads the Mermaid library only when needed.
 * - **SVG Generation:** Uses `mermaid.render()` to generate idempotent SVG output, ensuring reliable DOM updates.
 *
 * It is primarily consumed by:
 * 1. `Neo.component.Markdown`: For rendering ```mermaid``` code blocks embedded in Markdown content.
 * 2. `Neo.component.wrapper.Mermaid`: A standalone component wrapper for displaying Mermaid diagrams.
 *
 * @class Neo.main.addon.Mermaid
 * @extends Neo.main.addon.Base
 * @see Neo.component.wrapper.Mermaid
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
     *
     * This method orchestrates the full rendering pipeline:
     * 1. **SVG Generation:** Generates a fresh SVG string for the diagram code.
     * 2. **DOM Injection:** Safely injects the SVG into the target container.
     *
     * It includes error handling to display rendering failures inline (e.g., syntax errors)
     * instead of crashing the application.
     *
     * @param {Object} data
     * @param {String} [data.code] The mermaid diagram syntax/code.
     * @param {String} data.id The DOM ID of the container element.
     */
    async render(data) {
        const element = document.getElementById(data.id);

        if (element) {
            try {
                // Reset Mermaid state so it accepts the node again
                element.removeAttribute('data-processed');

                if (data.code) {
                    element.textContent = data.code
                }

                mermaid.run({
                    nodes: [element]
                })
            } catch (e) {
                console.error('Mermaid rendering failed:', e);
                element.innerHTML = `<div style="color: red; padding: 10px;">Mermaid Error: ${e.message}</div>`
            }
        }
    }
}

export default Neo.setupClass(Mermaid);
