import Base from '../core/Base.mjs';

const
    formatRegex = /\{(\d+)\}/g,
    lineRegex   = /\r\n|\r|\n/g;

/**
 * @summary Shared line-number markup for highlighted code in workers and Main.
 *
 * Node.js-capable version of: https://github.com/yauhenipakala/highlightjs-line-numbers.js
 * @class Neo.util.HighlightJsLineNumbers
 * @extends Neo.core.Base
 * @singleton
 */
class HighlightJsLineNumbers extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.HighlightJsLineNumbers'
         * @protected
         */
        className: 'Neo.util.HighlightJsLineNumbers',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    TABLE_NAME         = 'hljs-ln'
    LINE_NAME          = 'hljs-ln-line'
    CODE_BLOCK_NAME    = 'hljs-ln-code'
    NUMBERS_BLOCK_NAME = 'hljs-ln-numbers'
    NUMBER_LINE_NAME   = 'hljs-ln-n'
    DATA_ATTR_NAME     = 'data-line-number'

    /**
     * @param {String} format
     * @param {Array} args
     * @returns {String}
     */
    format(format, args) {
        return format.replace(formatRegex, function(m, n){
            return args[n] !== undefined ? args[n] : m
        })
    }

    /**
     * @summary Numbers highlighted lines without changing their text or multiline token scopes.
     * @param {String} html Highlight.js output with escaped source text.
     * @param {String} [windowId] Worker-owned window requiring the line-number theme.
     * @returns {String}
     */
    addLineNumbers(html, windowId) {
        let me     = this,
            lines  = me.getLines(html),
            breaks = html.match(lineRegex) || [],
            result = '';

        if (lines.length > 0) {
            // Workers load theme files here; the Main addon owns its standalone stylesheet.
            windowId && Neo.currentWorker?.insertThemeFiles(windowId, me.__proto__);

            for (let i = 0; i < lines.length; i++) {
                result += me.format([
                    '<tr>',
                        '<td class="{0} {1}" {3}="{5}">',
                            '<div class="{2}" {3}="{5}"></div>',
                        '</td>',
                        '<td class="{0} {4}" {3}="{5}">',
                            '{6}',
                        '</td>',
                    '</tr>'
                ].join(''), [
                    me.LINE_NAME,
                    me.NUMBERS_BLOCK_NAME,
                    me.NUMBER_LINE_NAME,
                    me.DATA_ATTR_NAME,
                    me.CODE_BLOCK_NAME,
                    i + 1,
                    lines[i] + (breaks[i] || '').replace(/\r/g, '&#13;')
                ])
            }

            return me.format('<table class="{0}">{1}</table>', [me.TABLE_NAME, result])
        }

        return html
    }

    /**
     * @summary Splits real newlines and closes/reopens active Highlight.js spans at each row boundary.
     * @param {String} text Highlight.js output.
     * @returns {String[]}
     */
    getLines(text) {
        if (text.length === 0) return [];
        let spans = [];

        return text.split(lineRegex).map(line => {
            let prefix = spans.join('');

            for (let [tag] of line.matchAll(/<span\b[^>]*>|<\/span>/g)) {
                tag === '</span>' ? spans.pop() : spans.push(tag)
            }

            return prefix + line + '</span>'.repeat(spans.length)
        })
    }
}

export default Neo.setupClass(HighlightJsLineNumbers);
