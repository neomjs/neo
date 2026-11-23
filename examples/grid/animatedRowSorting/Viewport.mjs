import BaseViewport  from '../../../src/container/Viewport.mjs';
import Button        from '../../../src/button/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import Label         from '../../../src/component/Label.mjs';
import MainStore     from './MainStore.mjs';
import NumberField   from '../../../src/form/field/Number.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
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
                handler  : 'up.onPauseButtonClick'
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
            }, '->', {
                module: ThemeSwitcher,
                flex  : 'none'
            }]
        }, {
            module   : GridContainer,
            reference: 'grid',
            store    : MainStore,

            body: {
                animatedRowSorting: true
            },

            columns: [
                {dataField: 'id',        locked: 'start', text: 'Id', width: 70},
                {dataField: 'firstname', text: 'Firstname', flex: 1, minWidth: 130},
                {dataField: 'progress',  text: 'Progress',  flex: 1, minWidth: 140, type: 'progress'},
                {dataField: 'lastname',  text: 'Lastname',  flex: 1, minWidth: 130},
                {dataField: 'country',   text: 'Country',   width: 100}
            ]
        }]
    }

    /**
     * @member {Number|null} intervalId=null
     * @protected
     */
    intervalId = null

    /**
     * @member {Boolean} isPaused=false
     */
    isPaused = false

    /**
     * @summary Cleans up the background update timer and destroys the viewport.
     */
    destroy() {
        clearInterval(this.intervalId);
        super.destroy()
    }

    /**
     * @summary Starts the 1500ms leaderboard update timer after viewport construction.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.intervalId = setInterval(() => {
            if (!me.isPaused && !me.isDestroyed) {
                me.getReference('grid').store.updateRankings()
            }
        }, 1500)
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
            isPaused    = me.togglePause(),
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

    /**
     * @summary Toggles automatic leaderboard updates between paused and active.
     * @returns {Boolean} The current paused state
     */
    togglePause() {
        this.isPaused = !this.isPaused;
        return this.isPaused
    }
}

export default Neo.setupClass(Viewport);
