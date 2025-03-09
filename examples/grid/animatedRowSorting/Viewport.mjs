import BaseViewport  from '../../../src/container/Viewport.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import NumberField   from '../../../src/form/field/Number.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';

/**
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
            style : {marginBottom: '1em', maxWidth: 'fit-content'},

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
                style        : {marginLeft: '1em'},
                value        : 500,
                width        : 180
            }]
        }, {
            module   : GridContainer,
            reference: 'grid',
            store    : MainStore,

            columnDefaults: {
                width: 200
            },

            viewConfig: {
                animatedRowSorting: true
            },

            columns: [
                {dataField: 'id',        text: 'Id', width: 100},
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
     * @param {Object} data
     */
    onTransitionDurationFieldChange(data) {
        this.getReference('grid').view.getPlugin('grid-animate-rows').transitionDuration = data.value
    }
}

export default Neo.setupClass(Viewport);
