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
     * @param {String[]|String} rules
     */
    static deleteRules(rules) {
        if (!Array.isArray(rules)) {
            rules = [rules];
        }

        Neo.main.addon.Stylesheet.deleteCssRules({
            rules: rules
        });
    }

    /**
     * @param {String[]|String} rules
     */
    static insertRules(rules) {
        if (!Array.isArray(rules)) {
            rules = [rules];
        }

        Neo.main.addon.Stylesheet.insertCssRules({
            rules: rules
        });
    }
}

Neo.applyClassConfig(Css);

export default Css;
