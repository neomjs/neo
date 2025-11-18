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
         * @member {Boolean} debug=false
         */
        debug: true,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @type {null}
     */
    hljs = null;

    /**
     * @param {String} code
     * @param {String} language
     * @returns {Promise<String>}
     */
    async highlight(code, language) {
        await this.load();
        return this.hljs.highlight(code, {language}).value
    }

    /**
     * @param {String} code
     * @returns {Promise<String>}
     */
    async highlightAuto(code) {
        await this.load();
        return this.hljs.highlightAuto(code).value
    }

    /**
     * @param {String} code
     * @param {String} language
     * @param {Number} [windowId]
     * @returns {Promise<String>}
     */
    async highlightLine(code, language, windowId) {
        let value = await this.highlight(code, language);
        return HighlightJsLineNumbers.addLineNumbers(value, windowId)
    }

    /**
     * @param {String} code
     * @param {Number} [windowId]
     * @returns {Promise<String>}
     */
    async highlightAutoLine(code, windowId) {
        let value = await this.highlightAuto(code);
        return HighlightJsLineNumbers.addLineNumbers(value, windowId)
    }

    /**
     * @returns {Promise<void>}
     */
    async load() {
        if (!this.hljs) {
            let path   = Neo.config.basePath + 'dist/highlight/highlight.custom' + (this.debug ? '' : '.min') + '.js',
                module = await import(path);

            this.hljs = module.default
        }
    }
}

export default Neo.setupClass(HighlightJs);
