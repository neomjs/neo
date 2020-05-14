import Base from '../../core/Base.mjs';

/**
 * A markdown mixin to convert markdown to html by using showdown.js
 * https://github.com/showdownjs/showdown
 * script tag with the markdown lib has to be added before the Main.mjs script tag in the index.html
 * <script src="https://cdn.jsdelivr.net/npm/showdown@1.9.1/dist/showdown.min.js"></script>
 * @class Neo.main.mixin.Markdown
 * @extends Neo.core.Base
 * @singleton
 */
class Markdown extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.mixin.Markdown'
             * @private
             */
            className: 'Neo.main.mixin.Markdown'
        }
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

export {Markdown as default};
