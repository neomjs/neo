import BaseViewport  from '../../../src/container/Viewport.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import TextField     from '../../../src/form/field/Text.mjs';

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
            module       : TextField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Firstname',
            listeners    : {change: 'up.onFirstnameFieldChange'},
            style        : {marginBottom: '1em', maxWidth: '150px'}
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
}

export default Neo.setupClass(Viewport);
