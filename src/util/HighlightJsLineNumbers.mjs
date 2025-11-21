import Base from '../core/Base.mjs';

const
    formatRegex = /\{(\d+)\}/g,
    lineRegex   = /\\r\\n|\\r|\\n/g;

/**
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
     * @param {String} html
     * @param {String} windowId
     * @returns {String}
     */
    addLineNumbers(html, windowId) {
        let me     = this,
            lines  = me.getLines(html),
            result = '';

        if (lines.length > 0) {
            // This instance is not a component and should load related CSS files into the used windows.
            windowId && Neo.currentWorker.insertThemeFiles(windowId, me.__proto__);

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
                    lines[i].length > 0 ? lines[i] : ' '
                ])
            }

            return me.format('<table class="{0}">{1}</table>', [me.TABLE_NAME, result])
        }

        return html
    }

    /**
     * @param {String} text
     * @returns {String[]}
     */
    getLines(text) {
        if (text.length === 0) return [];
        const lines = text.split(lineRegex);

        if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop()
        }

        return lines
    }
}

export default Neo.setupClass(HighlightJsLineNumbers);
