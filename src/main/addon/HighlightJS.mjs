import Base from '../../core/Base.mjs';

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
             * Remote method access for other workers
             * @member {Object} remote={app: [//...]}
             * @private
             */
            remote: {
                app: [
                    'syntaxHighlight',
                    'syntaxHighlightInit',
                    'syntaxHighlightLine'
                ]
            },
            /**
             * @member {Boolean} singleton=true
             * @private
             */
            singleton: true
        }
    }

    /**
     *
     */
    onDomContentLoaded() {
        console.log('onDomContentLoaded HighlightJS');
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