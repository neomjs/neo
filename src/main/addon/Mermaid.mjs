import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
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
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async loadFiles() {
        if (window.mermaid) return;

        await DomAccess.loadScript(this.mermaidPath);
        mermaid.initialize({startOnLoad: false})
    }

    /**
     * @param {Object} data
     * @param {String} [data.code]
     * @param {String} data.id
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
