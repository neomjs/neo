import Base from './Base.mjs';

/**
 * @summary Main Thread Addon for rendering Mermaid diagrams with dynamic theme support.
 *
 * This addon manages the lifecycle of the Mermaid.js library on the Main Thread. It provides a robust,
 * theme-aware rendering engine that integrates seamlessly with the Neo.mjs component system.
 *
 * Key features:
 * - **Lazy Loading:** Dynamically loads the Mermaid library only when needed.
 * - **SVG Generation:** Awaits serialized `mermaid.run()` calls, keeping the latest queued source per element.
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
         * Mermaid's published chunks carry vendored UMD wrappers — `fastdom` among them — which hand
         * any global AMD loader an ANONYMOUS factory and get refused with `Can only have one anonymous
         * define call per script file`. Monaco's AMD distribution put such a loader on every portal route.
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
     * The library shares document state across diagrams, so only one render may own it at a time.
     * @member {Promise<void>} renderQueue=Promise.resolve()
     * @protected
     */
    renderQueue = Promise.resolve()
    /**
     * Latest admitted source and exact element for each queued target id.
     * @member {Map<String,Object>} pendingRenders=new Map()
     * @protected
     */
    pendingRenders = new Map()

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
     * @summary Serializes library rendering and coalesces queued source updates for each exact DOM element.
     * A queued edit never rewrites a node while the library renders it. Removed or replaced targets and
     * superseded requests are skipped; only a current request may display its awaited failure inline.
     * @param {Object} data
     * @param {String} [data.code] The mermaid diagram syntax/code.
     * @param {String} data.id The DOM ID of the container element.
     * @returns {Promise<void>}
     */
    async render(data) {
        const me = this;

        if (me.isDestroyed) return;

        const {id} = data, element = document.getElementById(id);

        if (!element) return;

        const requests = me.pendingRenders,
              library  = me.mermaid,
              request  = {element, code: data.code ?? element.textContent},
              current  = () => !me.isDestroyed && requests.get(id) === request &&
                  element.isConnected && document.getElementById(id) === element;

        requests.set(id, request);

        const run = async () => {
            try {
                if (!current()) return;

                element.removeAttribute('data-processed');
                element.textContent = request.code;

                await library.run({nodes: [element]})
            } catch (e) {
                if (current()) {
                    console.error('Mermaid rendering failed:', e);
                    const error = document.createElement('div');

                    error.style.cssText = 'color: red; padding: 10px;';
                    error.textContent = `Mermaid Error: ${e?.message ?? String(e)}`;
                    element.replaceChildren(error)
                }
            } finally {
                // The captured map survives CoreBase.destroy deleting this instance's own fields.
                requests.get(id) === request && requests.delete(id)
            }
        };

        me.renderQueue = me.renderQueue.then(run, run);
        await me.renderQueue
    }
}

export default Neo.setupClass(Mermaid);
