import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';
import Stylesheet from "src/main/addon/Stylesheet";

/**
 * A markdown mixin to convert markdown to html by using showdown.js
 * https://github.com/showdownjs/showdown
 * script tag with the markdown lib has to be added before the Main.mjs script tag in the index.html
 * <script src="https://cdn.jsdelivr.net/npm/showdown@1.9.1/dist/showdown.min.js"></script>
 * @class Neo.main.addon.Markdown
 * @extends Neo.core.Base
 * @singleton
 */
class Markdown extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.Markdown'
             * @private
             */
            className: 'Neo.main.addon.Markdown',
            /**
             * Remote method access for other workers
             * @member {Object} remote={app: [//...]}
             * @private
             */
            remote: {
                app: [
                    'markdownToHtml'
                ]
            },
            /**
             * @member {String} showdownPath='https://cdn.jsdelivr.net/npm/showdown@1.9.1/dist/showdown.min.js'
             * @private
             */
            showdownPath: 'https://cdn.jsdelivr.net/npm/showdown@1.9.1/dist/showdown.min.js',
            /**
             * @member {Boolean} singleton=true
             * @private
             */
            singleton: true
        }
    }

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        DomAccess.addScript({src: this.showdownPath});
    }

    /**
     * Markdown to HTML converter
     * @param {String} markdown string to convert
     * @private
     */
    markdownToHtml(markdown) {
        let converter = new showdown.Converter();

        return converter.makeHtml(markdown);
    }
}

Neo.applyClassConfig(Markdown);

let instance = Neo.create(Markdown);

Neo.applyToGlobalNs(instance);

export default instance;