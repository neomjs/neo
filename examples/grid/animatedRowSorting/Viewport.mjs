import BaseViewport  from '../../../src/container/Viewport.mjs';
import Button        from '../../../src/button/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import Label         from '../../../src/component/Label.mjs';
import MainStore     from './MainStore.mjs';
import NumberField   from '../../../src/form/field/Number.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';

/**
 * @summary Viewport for the animated row sorting example featuring a live leaderboard,
 * transition speed adjustments, and pause/resume controls.
 * @class Neo.examples.grid.animatedRowSorting.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.animatedRowSorting.Viewport'
         * @protected
         */
        className: 'Neo.examples.grid.animatedRowSorting.Viewport',
        /**
         * @member {Object} style={padding:'1em'}
         */
        style: {padding: '1em'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            layout: {
                ntype: 'flexbox',
                wrap : 'wrap',
                align: 'center',
                gap  : '0.75em'
            },
            style : {marginBottom: '1em'},

            items : [{
                ntype        : 'textfield',
                labelPosition: 'inline',
                labelText    : 'Firstname',
                listeners    : {change: 'up.onFirstnameFieldChange'},
                width        : 120
            },{
                module       : NumberField,
                clearable    : false,
                labelPosition: 'inline',
                labelText    : 'Transition Duration',
                listeners    : {change: 'up.onTransitionDurationFieldChange'},
                maxValue     : 1000,
                minValue     : 200,
                stepSize     : 100,
                value        : 500,
                width        : 180
            },{
                module   : Button,
                reference: 'pauseButton',
                iconCls  : 'fa fa-pause',
                text     : 'Pause',
                handler  : 'up.onPauseButtonClick',
                style    : {
                    '--button-outline-active': '2px solid var(--textfield-border-color-active, #5d83a7)',
                    outlineOffset            : '1px'
                }
            },{
                module: Label,
                text  : 'Rows re-sort as scores change. Click a header to sort by another column.',
                style : {
                    fontSize  : '0.9em',
                    lineHeight: '1.4',
                    maxWidth  : '100%',
                    opacity   : 0.8,
                    whiteSpace: 'normal'
                }
            }]
        }, {
            module   : GridContainer,
            reference: 'grid',
            store    : MainStore,

            body: {
                animatedRowSorting: true
            },

            columnDefaults: {
                width: 200
            },

            columns: [
                {dataField: 'id',        locked: 'start', text: 'Id', width: 100},
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'progress',  text: 'Progress', type: 'progress'},
                {dataField: 'country',   text: 'Country'}
            ]
        }]
    }

    /**
     * @param {Object} data
     */
    onFirstnameFieldChange(data) {
        this.getReference('grid').store.getFilter('firstname').value = data.value
    }

    /**
     * @summary Toggles automatic leaderboard updates and updates button appearance.
     * @param {Object} data
     */
    onPauseButtonClick(data) {
        let me          = this,
            store       = me.getReference('grid').store,
            isPaused    = store.togglePause(),
            pauseButton = me.getReference('pauseButton');

        pauseButton.set({
            iconCls: isPaused ? 'fa fa-play' : 'fa fa-pause',
            text   : isPaused ? 'Resume' : 'Pause'
        })
    }

    /**
     * Each body owns its AnimateRows plugin, the locked Id body included, so every body takes the new duration
     * @param {Object} data
     */
    onTransitionDurationFieldChange(data) {
        this.getReference('grid').view.bodies.forEach(body => {
            body.getPlugin('grid-animate-rows').transitionDuration = data.value
        })
    }
}

export default Neo.setupClass(Viewport);
