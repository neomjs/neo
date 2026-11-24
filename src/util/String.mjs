import Base from '../core/Base.mjs';

/**
 * @class Neo.util.String
 * @extends Neo.core.Base
 */
class StringUtil extends Base {
    /**
     * @member {Object} charEntityMap
     * @static
     */
    static charEntityMap = {
        '&' : '&amp;',
        '<' : '&lt;',
        '>' : '&gt;',
        '"' : '&quot;',
        '\'': '&apos;',
        '$' : '&dollar;',
        '\\': '&bsol;',
        '/' : '&sol;'
    }
    /**
     * @member {RegExp} charPattern
     * @static
     */
    static charPattern = /[&<>"'$\\]/g
    /**
     * @member {RegExp} entityPattern
     * @static
     */
    static entityPattern = /(&amp;)|(&lt;)|(&gt;)|(&quot;)|(&apos;)|(&dollar;)|(&bsol;)|(&sol;)/g
    /**
     * @member {RegExp} regExpMetaPattern
     * @static
     */
    static regExpMetaPattern = /[\\^$.*+?()[\]{}|/\-]/g

    static config = {
        /**
         * @member {String} className='Neo.util.String'
         * @protected
         */
        className: 'Neo.util.String'
    }

    /**
     * Escape HTML special characters
     * @param {String} value
     */
    static escapeHtml(value) {
        let me = this; // inside a static method, we are pointing to the class prototype

        if (!Neo.isString(value)) {
            return value
        }

        return value.replace(me.charPattern, me.getEntityFromChar.bind(me))
    }

    /**
     * Escapes regular expression metacharacters in a string so it matches literally.
     * @summary Escapes regex metacharacters (`\ ^ $ . * + ? ( ) [ ] { } | / -`) in string inputs.
     * @param {String} value
     * @returns {String}
     */
    static escapeRegExp(value) {
        if (!Neo.isString(value)) {
            return value
        }

        return value.replace(this.regExpMetaPattern, '\\$&')
    }

    /**
     * Get char equivalent of a mapped entity
     * @param {String} entity
     */
    static getCharFromEntity(entity) {
        let mappedChar = Object.keys(this.charEntityMap).find(key => this.charEntityMap[key] === entity);
        return mappedChar || entity
    }

    /**
     * Get entity equivalent of a mapped char
     * @param {String} char
     */
    static getEntityFromChar(char) {
        return this.charEntityMap[char] || char
    }

    /**
     * @summary Formats an internal route string as an anchor `href` for the active `Neo.config.routerMode`.
     *
     * Keeps `'hash'` mode (`'#...'`) unchanged for standalone and `file://` builds, and emits a clean root-relative
     * path prefixed by `Neo.config.routerBasePath` when `Neo.config.routerMode === 'pathname'` so `<base href>` never
     * hijacks hover URLs, clipboard copies, or modified new-tab clicks.
     * @param {String} route
     * @returns {String}
     */
    static toRouteHref(route) {
        if (!Neo.isString(route) || !route) {
            return route
        }

        if (Neo.config.routerMode !== 'pathname') {
            return route.startsWith('#') ? route : '#' + route
        }

        let path = route.startsWith('#') ? route.substring(1) : route;

        return (Neo.config.routerBasePath || '') + (path.startsWith('/') ? path : '/' + path)
    }

    /**
     * Unescape HTML special characters
     * @param {String} value
     */
    static unescapeHtml(value) {
        let me = this; // inside a static method, we are pointing to the class prototype

        if (!Neo.isString(value)) {
            return value
        }

        return value.replace(me.entityPattern, me.getCharFromEntity.bind(me))
    }

    /**
     * Returns the passed string with the first letter uncapitalized.
     * @param {String} value
     * @returns  {String}
     */
    static uncapitalize(value) {
        return value && value[0].toLowerCase() + value.substring(1)
    }
}

export default Neo.setupClass(StringUtil);
