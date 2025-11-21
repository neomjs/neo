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
     * @param {String} windowId
     * @param {String[]|String} rules
     */
    static deleteRules(windowId, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules]
        }

        Neo.main.addon.Stylesheet.deleteCssRules({rules, windowId})
    }

    /**
     * @param {String} windowId
     * @param {String[]|String} rules
     */
    static insertRules(windowId, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules]
        }

        Neo.main.addon.Stylesheet.insertCssRules({rules, windowId})
    }
}

export default Neo.setupClass(Css);
