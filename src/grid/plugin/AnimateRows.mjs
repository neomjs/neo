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
         * @member {String} transitionEasing_='ease-out'
         */
        transitionEasing_: 'ease-out'
    }

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
     * Triggered after the transitionDuration config got changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetTransitionDuration(value, oldValue) {
        this.isConstructed && this.updateTransitionDetails(Neo.isNumber(oldValue))
    }

    /**
     * Triggered after the transitionEasing config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTransitionEasing(value, oldValue) {
        this.isConstructed && this.updateTransitionDetails(!!oldValue)
    }

    /**
     * Triggered before the transitionEasing config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTransitionEasing(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'transitionEasing')
    }

    /**
     * @param {Object} args
     */
    destroy(...args) {
        CssUtil.deleteRules(this.appName, `#${this.owner.id} .neo-grid-row`);
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.isFiltered
     * @param {Object[]} data.items
     * @param {Object[]} data.oldItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreFilter(data) {
        this.updateView()
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        this.updateView()
    }

    /**
     * We do not want to apply the style to each list item itself,
     * so we are using Neo.util.Css
     * @param {Boolean} deleteRule=false
     * @protected
     */
    async updateTransitionDetails(deleteRule=false) {
        let me       = this,
            duration = me.transitionDuration,
            easing   = me.transitionEasing,
            {id}     = me.owner;

        if (deleteRule) {
            await CssUtil.deleteRules(me.appName, `#${id} .neo-grid-row`)
        }

        CssUtil.insertRules(me.appName, [
            `#${id} .neo-grid-row {`,
                'transition:',
                    `background-color ${duration}ms ${easing},`,
                    `opacity ${duration}ms ${easing},`,
                    `transform ${duration}ms ${easing}`,
            '}'
        ].join(''))
    }

    /**
     *
     */
    updateView() {
        let me            = this,
            {owner}       = me,
            {mountedRows} = owner,
            addedRows     = [],
            hasChange     = false,
            map           = {},
            rowsContainer = owner.getVdomRoot().cn,
            id, mapItem, record, row, rowIndex, transform;

        rowsContainer.forEach(row => {
            map[row.id] = row
        });

        // Creates the new start & end indexes inside mountedRows
        owner.updateMountedAndVisibleRows();

        for (rowIndex=mountedRows[0]; rowIndex < mountedRows[1]; rowIndex++) {
            record  = owner.store.getAt(rowIndex);
            id      = owner.getRowId(record, rowIndex)
            mapItem = map[id];

            if (mapItem) {
                // Inside the map (previous state) & vdom => move OP
                transform = `translate(0px, ${rowIndex * owner.rowHeight}px)`;

                if (mapItem.style.transform !== transform) {
                    mapItem.style.opacity   = .9; // slightly less than 1 to see visual overlays while moving
                    mapItem.style.transform = transform;
                    NeoArray.toggle(mapItem.cls, 'neo-even', rowIndex % 2 !== 0);
                    hasChange = true
                }

                delete map[id]
            } else {
                // Inside the vdom, but not the map => insert OP
                row = owner.createRow({record, rowIndex});

                row.style.opacity = 0;

                addedRows    .push(row);
                rowsContainer.push(row);

                owner.updateDepth = -1; // Added rows might contain components
                hasChange = true
            }
        }

        // Only rows which need to get removed are still inside the map
        Object.values(map).forEach(row => {
            row.style.opacity = 0;
            hasChange = true
        });

        if (hasChange) {
            clearTimeout(me.transitionTimeoutId);

            owner.promiseUpdate().then(() => {
                if (addedRows.length > 0) {
                    // Added rows need a 2nd DOM update to change the opacity from 0 to 1.
                    // If we added them with 1 directly, there would not be a fade-in transition.
                    addedRows.forEach(row => {
                        row.style.opacity = 1
                    });

                    owner.update()
                }
            });

            me.transitionTimeoutId = setTimeout(() => {
                me.transitionTimeoutId = null;
                owner.createViewData()
            }, me.transitionDuration)
        }
    }
}

export default Neo.setupClass(AnimateRows);
