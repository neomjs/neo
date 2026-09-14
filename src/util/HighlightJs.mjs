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
         * Selects the unminified bundle. The package ships both, so either value resolves for a consumer.
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
     * The npm package is this choice's second consumer: `unit/util/HighlightJs.spec.mjs` packs the
     * repository and runs the loader against the packed files, so a renamed bundle reds there rather
     * than in an installed app.
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
