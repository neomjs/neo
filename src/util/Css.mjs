import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Css
 * @extends Neo.core.Base
 */
class Css extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Css'
         * @protected
         */
        className: 'Neo.util.Css'
    }

    /**
     * Pass the selectorText of the rules which you want to remove
     * @param {String} appName
     * @param {String[]|String} rules
     */
    static deleteRules(appName, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules]
        }

        Neo.main.addon.Stylesheet.deleteCssRules({appName, rules})
    }

    /**
     * @param {String} appName
     * @param {String[]|String} rules
     */
    static insertRules(appName, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules]
        }

        Neo.main.addon.Stylesheet.insertCssRules({appName, rules})
    }
}

export default Neo.setupClass(Css);
