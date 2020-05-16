import Base       from '../../core/Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import Stylesheet from './Stylesheet.mjs'

/**
 * Required for the docs app which uses highlight.js for the source views
 * @class Neo.main.addon.HighlightJS
 * @extends Neo.core.Base
 * @singleton
 */
class HighlightJS extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.HighlightJS'
             * @private
             */
            className: 'Neo.main.addon.HighlightJS',
            /**
             * @member {String} highlightJsPath='./resources/highlight/highlight.pack.js'
             * @private
             */
            highlightJsPath: './resources/highlight/highlight.pack.js',
            /**
             * @member {String} highlightJsLineNumbersPath=Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js'
             * @private
             */
            highlightJsLineNumbersPath: Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js',
            /**
             * Remote method access for other workers
             * @member {Object} remote={app: [//...]}
             * @private
             */
            remote: {
                app: [
                    'scrollIntoView',
                    'syntaxHighlight',
                    'syntaxHighlightInit',
                    'syntaxHighlightLine'
                ]
            },
            /**
             * @member {Boolean} singleton=true
             * @private
             */
            singleton: true,
            /**
             * @member {String} themePath='./resources/highlightjs-custom-github-theme.css'
             * @private
             */
            themePath: './resources/highlightjs-custom-github-theme.css'
        }
    }

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        DomAccess.addScript({src: me.highlightJsPath});
        DomAccess.addScript({src: me.highlightJsLineNumbersPath});
        Stylesheet.createStyleSheet(null, 'hljs-theme', me.themePath);
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.text
     * @param {String} data.vnodeId
     * @private
     */
    scrollIntoView(data) {
        let parentEl = DomAccess.getElement(data.vnodeId),
            el       = parentEl.querySelector('[data-list-header="' + data.text + '"]');

        if (el) {
            el.previousSibling.scrollIntoView({
                behavior: 'smooth',
                block   : 'start',
                inline  : 'nearest'
            });
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.vnodeId
     */
    syntaxHighlight(data) {
        if (hljs) {
            let node = document.getElementById(data.vnodeId);

            hljs.highlightBlock(node);
            hljs.lineNumbersBlock(node);
        } else {
            console.error('highlight.js is not included inside the main thread.');
        }
    }

    /**
     *
     * @param {Object} data
     */
    syntaxHighlightInit(data) {
        if (hljs) {
            let blocks = document.querySelectorAll('pre code:not(.hljs)');
            Array.prototype.forEach.call(blocks, hljs.highlightBlock);
        } else {
            console.error('highlight.js is not included inside the main thread.');
        }
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.addLine
     * @param {String} data.vnodeId
     * @param {Number} data.removeLine
     */
    syntaxHighlightLine(data) {
        let parentEl = document.getElementById(data.vnodeId),
            cls      = 'neo-highlighted-line',
            el;

        if (Neo.isNumber(data.addLine)) {
            el = parentEl.querySelector('[data-line-number="' + data.addLine + '"]');

            if (el) {
                el.parentNode.classList.add(cls);

                el.parentNode.scrollIntoView({
                    behavior: 'smooth',
                    block   : 'start',
                    inline  : 'nearest'
                });
            }
        }

        if (Neo.isNumber(data.removeLine)) {
            el = parentEl.querySelector('[data-line-number="' + data.removeLine + '"]');

            if (el) {
                el.parentNode.classList.remove(cls);
            }
        }
    }
}

Neo.applyClassConfig(HighlightJS);

let instance = Neo.create(HighlightJS);

Neo.applyToGlobalNs(instance);

export default instance;