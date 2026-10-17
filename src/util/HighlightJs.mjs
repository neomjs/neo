import Base                   from '../core/Base.mjs';
import HighlightJsLineNumbers from './HighlightJsLineNumbers.mjs';

/**
 * @class Neo.util.HighlightJs
 * @extends Neo.core.Base
 * @singleton
 */
class HighlightJs extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.HighlightJs'
         * @protected
         */
        className: 'Neo.util.HighlightJs',
        /**
         * Selects the unminified bundle. `build-highlightjs` generates both variants in the installed Engine.
         * @member {Boolean} debug=true
         */
        debug: true,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * The custom windowIs (timestamp) this component belongs to
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * @type {null}
     */
    hljs = null;

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * @summary The `Neo.config.basePath`-relative bundle {@link #load} imports, chosen by `debug`.
     *
     * `unit/util/HighlightJs.spec.mjs` checks both loader paths with isolated module stand-ins.
     * The consumer-build guard verifies both real files after generation in the installed Engine.
     * @returns {String}
     */
    getBundlePath() {
        return 'dist/highlight/highlight.custom' + (this.debug ? '' : '.min') + '.js'
    }

    /**
     * @param {String} code
     * @param {String} language
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async highlight(code, language, windowId) {
        let me = this;

        me.windowId = windowId;

        await me.load();
        return me.hljs.highlight(code, {language}).value
    }

    /**
     * @param {String} code
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async highlightAuto(code, windowId) {
        let me = this;

        me.windowId = windowId;

        await me.load();
        return me.hljs.highlightAuto(code).value
    }

    /**
     * @param {String} code
     * @param {String} language
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async highlightLine(code, language, windowId) {
        let value = await this.highlight(code, language, windowId);
        return HighlightJsLineNumbers.addLineNumbers(value, windowId)
    }

    /**
     * @param {String} code
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async highlightAutoLine(code, windowId) {
        let value = await this.highlightAuto(code, windowId);
        return HighlightJsLineNumbers.addLineNumbers(value, windowId)
    }

    /**
     * @returns {Promise<void>}
     */
    async load() {
        if (!this.hljs) {
            let module = await import(/* webpackIgnore: true */ Neo.config.basePath + this.getBundlePath());

            this.hljs = module.default
        }
    }
}

export default Neo.setupClass(HighlightJs);
