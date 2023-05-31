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
    
     static escapedChars = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
     }

    /**
     * Escape HTML special characters
     * @param {String} value
     */
    static escapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(/[&<>"']/g, (char) => this.escapedChars[char] || char);
    }

    /**
     * Unescape HTML special characters
     * @param {String} value
     */
    static unescapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(/(&amp;)|(&lt;)|(&gt;)|(&quot;)|(&#039;)/g, (entity) => this.getKeyByValue(entity) || entity);
    }

    static getKeyByValue(value) {
        return Object.keys(this.escapedChars).find(key => this.escapedChars[key] === value);
      }
}


Neo.applyClassConfig(StringUtil);

export default StringUtil;
