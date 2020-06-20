import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Css
 * @extends Neo.core.Base
 */
class Css extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.util.Css'
         * @protected
         */
        className: 'Neo.util.Css'
    }}

    /**
     *
     * @param {Array} rules
     */
    static insertRules(rules) {
        Neo.main.addon.Stylesheet.insertCssRules({
            rules: rules
        }).then(function(data) {
            // console.log('inserted CSS rules', data);
        }).catch(function(err) {
            console.log('App: Got error attempting to insert CSS rules', err, rules);
        });
    }
}

Neo.applyClassConfig(Css);

export default Css;