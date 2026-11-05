import Base        from './Base.mjs';
import DomAccess   from '../DomAccess.mjs';
import HighlightJs from '../../util/HighlightJs.mjs';

/**
 * Required for the docs app which uses highlight.js for the source views
 * @class Neo.main.addon.HighlightJS
 * @extends Neo.main.addon.Base
 * @summary Main-thread DOM highlighting with the Engine bundle and optional classic-script overrides.
 */
class HighlightJS extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.HighlightJS'
         * @protected
         */
        className: 'Neo.main.addon.HighlightJS',
        /**
         * An explicit classic-script override; null reuses the Engine's generated module bundle.
         * @member {String|null} highlightJsPath=null
         * @protected
         */
        highlightJsPath: null,
        /**
         * @member {String} highlightJsLineNumbersPath=Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js'
         * @protected
         */
        highlightJsLineNumbersPath: Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js',
        /**
         * Disabling the auto-preload to honor custom paths.
         * @member {Boolean|Number} preloadFilesDelay=false
         * @protected
         */
        preloadFilesDelay: false,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'highlightAuto',
                'loadFiles',
                'scrollIntoView',
                'syntaxHighlight',
                'switchTheme',
                'syntaxHighlightInit',
                'syntaxHighlightLine'
            ]
        },
        /**
         * @member {String} themePath='./resources/lib/highlightjs-custom-github-theme.css'
         * @protected
         */
        themePath: './resources/lib/highlightjs-custom-github-theme.css'
    }

    /**
     * See: https://highlightjs.readthedocs.io/en/latest/api.html#highlightauto
     * @param {Object} data
     * @param {String} data.html
     * @returns {Object} value
     */
    highlightAuto(data) {
        if (!this.isReady) {
            return this.cacheMethodCall({fn: 'highlightAuto', data})
        }

        return hljs.highlightAuto(data.html).value
    }

    /**
     * @summary Loads the shared highlighter before the classic line-number plugin, which consumes window.hljs.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async loadFiles(data) {
        let me = this;

        if (data) {
            delete data.appName;
            delete data.windowId;

            me.set(data);
        }

        if (me.highlightJsPath) {
            await DomAccess.loadScript(me.highlightJsPath)
        } else {
            await HighlightJs.load(new URL(Neo.config.basePath, document.baseURI).href);
            globalThis.hljs = HighlightJs.hljs
        }

        await Promise.all([
            DomAccess.loadScript(me.highlightJsLineNumbersPath),
            Neo.main.addon.Stylesheet.createStyleSheet({
                id  : 'hljs-theme',
                href: me.themePath
            })
        ])
    }

    /**
     * @param {Object} data
     * @param {String} data.text
     * @param {String} data.vnodeId
     * @protected
     */
    scrollIntoView(data) {
        if (!this.isReady) {
            return this.cacheMethodCall({fn: 'scrollIntoView', data})
        }

        let parentEl = DomAccess.getElement(data.vnodeId),
            el       = parentEl.querySelector('[data-list-header="' + data.text + '"]');

        el?.previousSibling.scrollIntoView({
            behavior: 'smooth',
            block   : 'start',
            inline  : 'nearest'
        })
    }

    /**
     * You can pass in 'light', 'dark', or a path for a custom theme
     * @param {Object} data
     * @param {String} data.theme
     */
    switchTheme({theme}) {
        let definedThemes = {
                dark : './resources/lib/highlightjs-custom-dark-theme.css',
                light: './resources/lib/highlightjs-custom-github-theme.css'
            },
            switchToTheme = definedThemes[theme];

        switchToTheme ??= theme;
        this.themePath = switchToTheme;
        Neo.main.addon.Stylesheet.createStyleSheet({
            id  : 'hljs-theme',
            href: switchToTheme
        })
    }

    /**
     * @summary Highlights a code leaf, including new contents published into an already highlighted element.
     * @param {Object} data
     * @param {String} data.vnodeId
     */
    syntaxHighlight(data) {
        if (!this.isReady) {
            return this.cacheMethodCall({fn: 'syntaxHighlight', data})
        }

        let node = document.getElementById(data.vnodeId);

        if (node && !node.querySelector('.hljs-ln')) {
            // VDOM can replace the contents while retaining the code element and this library marker.
            // An existing line table is already processed; feeding it back loses the source newlines.
            delete node.dataset.highlighted;
            hljs.highlightBlock(node);
            // Finish the bundled plugin before another mount/source callback can queue the same work.
            if (hljs.lineNumbersBlockSync) {
                hljs.lineNumbersBlockSync(node)
            } else {
                hljs.lineNumbersBlock(node)
            }
        }
    }

    /**
     * @param {Object} data
     */
    syntaxHighlightInit(data) {
        if (!this.isReady) {
            return this.cacheMethodCall({fn: 'syntaxHighlightInit', data})
        }

        let blocks = document.querySelectorAll('pre code:not(.hljs)');
        Array.prototype.forEach.call(blocks, hljs.highlightBlock)
    }

    /**
     * @param {Object} data
     * @param {Number} data.addLine
     * @param {String} data.vnodeId
     * @param {Number} data.removeLine
     */
    syntaxHighlightLine(data) {
        if (!this.isReady) {
            return this.cacheMethodCall({fn: 'syntaxHighlightLine', data})
        }

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
                })
            }
        }

        if (Neo.isNumber(data.removeLine)) {
            el = parentEl.querySelector('[data-line-number="' + data.removeLine + '"]');
            el?.parentNode.classList.remove(cls)
        }
    }
}

export default Neo.setupClass(HighlightJS);
