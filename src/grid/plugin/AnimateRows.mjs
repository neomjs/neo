import Base     from '../../plugin/Base.mjs';
import CssUtil  from '../../util/Css.mjs';
import NeoArray from '../../util/Array.mjs';

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
        transitionEasing_: 'ease-in-out'
    }

    /**
     * Internally storing the row ids & transform values
     * @member {Object} map={}
     * @protected
     */
    map = {}
    /**
     * The id of the setTimeout() call which gets triggered after a transition is done.
     * @member {Number|null} transitionTimeoutId=null
     * @protected
     */
    transitionTimeoutId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me,
            {store} = owner;

        // Remove the previous view listeners
        owner.store = null;

        owner.onStoreFilter = me.onStoreFilter.bind(me);
        owner.onStoreLoad   = me.onStoreLoad  .bind(me);

        // Add the re-bound listeners
        owner.store = store;

        me.updateTransitionDetails()
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.isFiltered
     * @param {Object[]} data.items
     * @param {Object[]} data.oldItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreFilter(data) {
        let me = this;

        console.log('AnimateRows onStoreFilter')
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        let me      = this,
            {owner} = me,
            {mountedRows} = owner,
            hasChange = false,
            id, mapItem, rowIndex, transform;

        me.map = {};

        owner.getVdomRoot().cn.forEach(row => {
            me.map[row.id] = row
        });

        for (rowIndex=mountedRows[0]; rowIndex < mountedRows[1]; rowIndex++) {
            id      = owner.getRowId(owner.store.getAt(rowIndex), rowIndex)
            mapItem = me.map[id];

            if (mapItem) {
                transform = `translate(0px, ${rowIndex * owner.rowHeight}px)`;

                if (mapItem.style.transform !== transform) {
                    mapItem.style.transform = transform;
                    NeoArray.toggle(mapItem.cls, 'neo-even', rowIndex % 2 !== 0);
                    hasChange = true
                }
            }
        }

        if (hasChange) {
            clearTimeout(me.transitionTimeoutId);

            owner.update();

            me.transitionTimeoutId = setTimeout(() => {
                owner.createViewData()
            }, me.transitionDuration)
        }
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
                    'transition:',
                        `background-color ${duration}ms ${easing},`,
                        `opacity ${duration}ms ${easing},`,
                        `transform ${duration}ms ${easing}`,
                '}'
            ].join(''))
        } else {
            CssUtil.deleteRules(me.appName, `#${id} .neo-grid-row`)
        }
    }
}

export default Neo.setupClass(AnimateRows);
