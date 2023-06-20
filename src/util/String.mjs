import Base from '../core/Base.mjs';

/**
 * @class Neo.util.StringUtil
 * @extends Neo.core.Base
 */
class StringUtil extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.StringUtil'
         * @protected
         */
        className: 'Neo.util.StringUtil'
    }
    
     static escapedCharMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
     }

     static escapedCharPattern =  new RegExp(/(&amp;)|(&lt;)|(&gt;)|(&quot;)|(&#039;)/, 'g');

    /**
     * Escape HTML special characters
     * @param {String} value
     */
    static escapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(/[&<>"']/g, (char) => this.escapedCharMap[char] || char);
    }

    static getKeyByValue(value) {
        return Object.keys(this.escapedCharMap).find(key => this.escapedCharMap[key] === value);
    }

    /**
     * Unescape HTML special characters
     * @param {String} value
     */
    static unescapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(this.escapedCharPattern, (entity) => this.getKeyByValue(entity) || entity);
    }
}


Neo.applyClassConfig(StringUtil);

export default StringUtil;
