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
    
     static charEntityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
     }

     static charPattern = new RegExp(/[&<>"']/, 'g');

     static entityPattern = new RegExp(/(&amp;)|(&lt;)|(&gt;)|(&quot;)|(&#039;)/, 'g');

     static getCharFromEntity(entity) {
        const mappedChar = Object.keys(this.charEntityMap).find(key => this.charEntityMap[key] === entity);
        return mappedChar || entity;
     }

     static getEntityFromChar(char) {
        return this.charEntityMap[char] || char;
     }

    /**
     * Escape HTML special characters
     * @param {String} value
     */
    static escapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(this.charPattern, this.getEntityFromChar.bind(this));
    }

    /**
     * Unescape HTML special characters
     * @param {String} value
     */
    static unescapeHtml(value) {
        if (Neo.typeOf(value) !== 'String') {
            return value;
        }

        return value.replace(this.entityPattern, this.getCharFromEntity.bind(this));
    }
}

Neo.applyClassConfig(StringUtil);

export default StringUtil;
