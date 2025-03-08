import BaseViewport  from '../../../src/container/Viewport.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';

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
            module: GridContainer,
            store : MainStore,

            columnDefaults: {
                width: 200
            },

            columns: [
                {dataField: 'id',        text: 'Id'},
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'country',   text: 'Country'}
            ]
        }]
    }
}

export default Neo.setupClass(Viewport);
