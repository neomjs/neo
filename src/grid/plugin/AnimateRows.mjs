import Base     from '../../plugin/Base.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @summary Animates the rows of a grid body to their new positions after a sort or a filter.
 *
 * The positions are fixed-height ones (`rowIndex × rowHeight`). With `contentSizedRows` the plugin stands aside:
 * the body handles the store events itself and renders its rows at their geometry offsets, without transitions.
 * The plugin follows the mode through the body's `rowGeometryChange` event, which fires before the rows re-render.
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
         * Time in ms for the background-color, opacity & transform transitions
         * @member {Number} transitionDuration_=500
         * @reactive
         */
        transitionDuration_: 500,
        /**
         * The easing used for fadeIn, fadeOut and position changes.
         * Valid values: 'ease','ease-in','ease-out','ease-in-out','linear'
         * @member {String} transitionEasing_='ease-out'
         * @reactive
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
     * The body's own store handlers, which this plugin replaces. Content-sized rows hand the events back to them.
     * @member {Object|null} #bodyHandlers=null
     */
    #bodyHandlers = null
    /**
     * @member {Boolean} #warned=false
     */
    #warned = false

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

        me.#bodyHandlers = {filter: owner.onStoreFilter, load: owner.onStoreLoad};

        owner.onStoreFilter = me.onStoreFilter.bind(me);
        owner.onStoreLoad   = me.onStoreLoad  .bind(me);

        // Add the re-bound listeners
        owner.store = store;

        owner.on('rowGeometryChange', me.standAside, me);
        me.standAside()
    }

    /**
     * Triggered after the transitionDuration config got changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetTransitionDuration(value, oldValue) {
        this.owner.addStyle({'--neo-duration': value + 'ms'})
    }

    /**
     * Triggered after the transitionEasing config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTransitionEasing(value, oldValue) {
        this.owner.addStyle({'--neo-easing': value})
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
        let me      = this,
            {owner} = me;

        owner.un('rowGeometryChange', me.standAside, me);

        owner.addStyle({
            '--neo-duration': null,
            '--neo-easing'  : null
        });

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
        let me = this;

        me.standAside() ? me.#bodyHandlers.filter.call(me.owner, data) : me.updateView()
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        let me = this;

        me.standAside() ? me.#bodyHandlers.load.call(me.owner, data) : me.updateView()
    }

    /**
     * Content-sized rows have no fixed-height positions to animate to, and this plugin does not read the row
     * geometry. In that mode it takes its row transitions off the body and warns, once, that `animatedRowSorting`
     * is ignored; a store event goes to the body's own handler. Back in fixed-height mode, the transitions return.
     * Runs on every store event, and on `rowGeometryChange`, before the rows re-render for a new mode.
     * @returns {Boolean} True if the plugin stands aside
     * @protected
     */
    standAside() {
        let me           = this,
            {owner}      = me,
            contentSized = !!owner.rowGeometry;

        owner[contentSized ? 'removeCls' : 'addCls']('neo-animate-rows');

        if (contentSized && !me.#warned) {
            me.#warned = true;
            console.warn('grid.plugin.AnimateRows: animatedRowSorting is ignored with contentSizedRows', owner.id)
        }

        return contentSized
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
            id      = owner.getRowId(rowIndex)
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
