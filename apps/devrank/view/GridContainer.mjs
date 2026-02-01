import BaseGridContainer from '../../../src/grid/Container.mjs';
import Contributors      from '../store/Contributors.mjs';

/**
 * @class DevRank.view.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='DevRank.view.GridContainer'
         * @protected
         */
        className: 'DevRank.view.GridContainer',
        /**
         * @member {Object} body
         */
        body: {
            bufferColumnRange: 3,
            bufferRowRange   : 5
        },
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            width               : 100
        },
        /**
         * @member {Object[]} columns
         */
        columns: [
            {
                type: 'index', 
                dataField: 'id', 
                text: '#', 
                width: 60
            },
            {
                cellAlign: 'left', 
                dataField: 'login', 
                text: 'User', 
                width: 250,
                renderer: ({record}) => {
                    return `<div style="display:flex; align-items:center; gap:10px;">
                        <img src="${record.avatar_url}" style="width:24px; height:24px; border-radius:50%;">
                        <span>${record.name || record.login}</span>
                    </div>`
                }
            },
            {
                dataField: 'total_contributions', 
                text: 'Total', 
                width: 150,
                defaultSortDirection: 'DESC'
            },
            {
                dataField: 'first_year', 
                text: 'Since', 
                width: 100
            },
            {
                dataField: 'last_updated', 
                text: 'Last Active', 
                width: 150,
                renderer: ({value}) => new Date(value).toLocaleDateString()
            }
        ],
        /**
         * @member {Object[]} store=Contributors
         * @reactive
         */
        store: Contributors
    }
}

export default Neo.setupClass(GridContainer);
