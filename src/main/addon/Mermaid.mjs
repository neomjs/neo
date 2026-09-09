import Base from './Base.mjs';

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
         * OUR build of mermaid, not the published one.
         *
         * `main.addon.MonacoEditor` installs Monaco's AMD loader and the portal preloads that addon,
         * so a global `define` is live on every route. Mermaid's published chunks carry vendored UMD
         * wrappers — `fastdom` among them — which hand that loader an ANONYMOUS factory and get
         * refused with `Can only have one anonymous define call per script file`.
         *
         * Switching the entry from the UMD bundle to the published ESM one removed the registration
         * at LOAD time and left it at first RENDER, because the 30 KB entry lazily imports 206
         * chunks and ten of them still register. `buildScripts/build/mermaid.mjs` rebuilds the
         * package with esbuild, substituting the `define` identifier across the whole module graph,
         * and refuses to emit an artifact that still carries one.
         *
         * Pointing at `dist/` rather than `node_modules/` is also what makes the library reachable
         * in a deployed build, where `node_modules` is not part of the tree. Same shape as
         * `util.HighlightJs#load` consuming `dist/highlight/`.
         * @member {String} mermaidPath=Neo.config.basePath+'dist/mermaid.mjs'
         * @protected
         */
        mermaidPath: Neo.config.basePath + 'dist/mermaid.mjs',
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
     * The imported library, held here rather than on `window`.
     *
     * A UMD bundle publishes itself as a global; a module export does not, and inventing the global
     * back would re-create a name any other script on the page can collide with. Same shape as
     * `util.HighlightJs#hljs`.
     * @member {Object|null} mermaid=null
     * @protected
     */
    mermaid = null

    /**
     * Imports the Mermaid library if it is not already loaded.
     * Initializes it with `startOnLoad: false` to keep rendering under this addon's control.
     * @returns {Promise<void>}
     */
    async loadFiles() {
        let me = this;

        if (me.mermaid) return;

        // Resolved against the DOCUMENT, not against this module. `Neo.config.basePath` is written
        // for `DomAccess.loadScript`, whose `<script src>` is document-relative; a dynamic import
        // resolves against the importing module's own URL instead, so a bare `../../` from
        // `src/main/addon/` lands on `/src/node_modules/...` and 404s. Depth-independent here, so
        // moving this file cannot silently break the path.
        //
        // `webpackIgnore`, so the bundler leaves the specifier alone and it resolves at runtime —
        // the same treatment `util.HighlightJs#load` gives its library.
        const path   = new URL(me.mermaidPath, document.baseURI).href,
              module = await import(/* webpackIgnore: true */ path);

        me.mermaid = module.default;
        me.mermaid.initialize({startOnLoad: false})
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

                this.mermaid.run({
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
