import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';

/**
 * Required for the docs app which uses highlight.js for the source views
 * @class Neo.main.addon.HighlightJS
 * @extends Neo.main.addon.Base
 */
class HighlightJS extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.HighlightJS'
         * @protected
         */
        className: 'Neo.main.addon.HighlightJS',
        /**
         * @member {String} highlightJsPath='./resources/highlight/highlight.pack.js'
         * @protected
         */
        highlightJsPath: './resources/highlight/highlight.pack.js',
        /**
         * @member {String} highlightJsLineNumbersPath=Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js'
         * @protected
         */
        highlightJsLineNumbersPath: Neo.config.basePath + 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'highlightAuto',
                'loadLibrary',
                'scrollIntoView',
                'syntaxHighlight',
                'switchTheme',
                'syntaxHighlightInit',
                'syntaxHighlightLine'
            ]
        },
        /**
         * @member {String} themePath='./resources/highlightjs-custom-github-theme.css'
         * @protected
         */
        themePath: './resources/highlightjs-custom-github-theme.css'
    }

    /**
     * See: https://highlightjs.readthedocs.io/en/latest/api.html#highlightauto
     * @param {String} html
     * @returns {Object} of the form {language, relevance, value, secondBest}
     */
    highlightAuto(html) {
        if (hljs) {
            return hljs.highlightAuto(html)
        } else {
            console.error('highlight.js is not included inside the main thread.')
        }
    }

    /**
     * @param {Object} data
     * @returns {Boolean}
     */
    async loadLibrary(data) {
        delete data.appName;

        let me = this;

        me.set(data);

        await DomAccess.loadScript(me.highlightJsPath).then(() => {
            DomAccess.addScript({src: me.highlightJsLineNumbersPath})
        });

        Neo.main.addon.Stylesheet.createStyleSheet(null, 'hljs-theme', me.themePath);

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.text
     * @param {String} data.vnodeId
     * @protected
     */
    scrollIntoView(data) {
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
     * @param {String} theme
     */
    switchTheme(theme) {
        let definedThemes = {
                dark : './resources/highlightjs-custom-dark-theme.css',
                light: './resources/highlightjs-custom-github-theme.css'
            },
            switchToTheme = definedThemes[theme];

        switchToTheme ??= theme;
        this.themePath = switchToTheme;
        Neo.main.addon.Stylesheet.createStyleSheet(null, 'hljs-theme', switchToTheme)
    }

    /**
     * @param {Object} data
     * @param {String} data.vnodeId
     */
    syntaxHighlight(data) {
        if (hljs) {
            let node = document.getElementById(data.vnodeId);

            hljs.highlightBlock(node);
            hljs.lineNumbersBlock(node)
        } else {
            console.error('highlight.js is not included inside the main thread.')
        }
    }

    /**
     * @param {Object} data
     */
    syntaxHighlightInit(data) {
        if (hljs) {
            let blocks = document.querySelectorAll('pre code:not(.hljs)');
            Array.prototype.forEach.call(blocks, hljs.highlightBlock)
        } else {
            console.error('highlight.js is not included inside the main thread.')
        }
    }

    /**
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
                })
            }
        }

        if (Neo.isNumber(data.removeLine)) {
            el = parentEl.querySelector('[data-line-number="' + data.removeLine + '"]');
            el?.parentNode.classList.remove(cls)
        }
    }
}

Neo.setupClass(HighlightJS);

export default HighlightJS;
