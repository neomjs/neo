import Base    from '../../plugin/Base.mjs';
import CssUtil from '../../util/Css.mjs';

/**
 * @class Neo.grid.plugin.AnimateRows
 * @extends Neo.plugin.Base
 */
class AnimateRows extends Base {
    /**
     * Valid values for transitionEasing
     * @member {String[]} transitionEasings=['ease','ease-in','ease-out','ease-in-out','linear']
     * @protected
     * @static
     */
    static transitionEasings = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']

    static config = {
        /**
         * @member {String} className='Neo.grid.plugin.AnimateRows'
         * @protected
         */
        className: 'Neo.grid.plugin.AnimateRows',
        /**
         * @member {String} ntype='plugin-grid-animate-rows'
         * @protected
         */
        ntype: 'plugin-grid-animate-rows',
        /**
         * Time in ms. Please ensure to match the CSS based value, in case you change the default.
         * @member {Number} transitionDuration_=500
         */
        transitionDuration_: 500,
        /**
         * The easing used for fadeIn, fadeOut and position changes.
         * Valid values: 'ease','ease-in','ease-out','ease-in-out','linear'
         * @member {String} transitionEasing_='ease-in-out'
         */
        transitionEasing_: 'ease-in-out',
        /**
         * The id of the setTimeout() call which gets triggered after a transition is done.
         * @member {Number|null} transitionTimeoutId=null
         */
        transitionTimeoutId: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me;

        // owner.onStoreFilter = me.onStoreFilter.bind(me);
        // owner.onStoreSort   = me.onStoreSort  .bind(me);

        me.updateTransitionDetails()
    }

    /**
     * We do not want to apply the style to each list item itself,
     * so we are using Neo.util.Css
     * @param {Boolean} addRule=true
     * @protected
     */
    updateTransitionDetails(addRule=true) {
        let me       = this,
            duration = me.transitionDuration,
            easing   = me.transitionEasing,
            {id}     = me.owner;

        if (addRule) {
            CssUtil.insertRules(me.appName, [
                `#${id} .neo-grid-row {`,
                `transition: opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`,
                '}'
            ].join(''))
        } else {
            CssUtil.deleteRules(me.appName, `#${id} .neo-list-item`)
        }
    }
}

export default Neo.setupClass(AnimateRows);
