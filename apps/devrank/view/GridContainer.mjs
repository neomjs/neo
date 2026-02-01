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
            cellAlign           : 'left',
            defaultSortDirection: 'DESC',
            width               : 150
        },
        /**
         * @member {Object[]} columns
         */
        columns: [
            {
                type: 'index', 
                dataField: 'id', 
                text: '#', 
                width: 60,
                cellAlign: 'right'
            },
            {
                dataField: 'login', 
                text: 'User', 
                width: 250,
                renderer: ({record}) => {
                    return `<div style="display:flex; align-items:center; gap:10px;">
                        <img src="${record.avatar_url}" style="width:32px; height:32px; border-radius:50%;">
                        <div style="display:flex; flex-direction:column; line-height: 1.2;">
                            <a href="https://github.com/${record.login}" target="_blank" style="font-weight:bold; color:inherit; text-decoration:none;">${record.login}</a>
                            ${record.name && record.name !== record.login ? `<span style="font-size:0.85em; opacity:0.8;">${record.name}</span>` : ''}
                        </div>
                    </div>`
                }
            },
            {
                dataField: 'total_contributions', 
                text: 'Contributions', 
                width: 130,
                cellAlign: 'right',
                defaultSortDirection: 'DESC',
                renderer: ({value}) => new Intl.NumberFormat().format(value)
            },
            {
                dataField: 'followers', 
                text: 'Followers', 
                width: 100,
                cellAlign: 'right',
                renderer: ({value}) => value ? new Intl.NumberFormat().format(value) : '-'
            },
            {
                dataField: 'company', 
                text: 'Company', 
                width: 200,
                renderer: ({value}) => value ? value.replace(/^@/, '') : ''
            },
            {
                dataField: 'location', 
                text: 'Location', 
                width: 200
            },
            {
                dataField: 'first_year', 
                text: 'Since', 
                width: 80,
                cellAlign: 'center'
            },
            {
                dataField: 'last_updated', 
                text: 'Updated', 
                width: 120,
                cellAlign: 'right',
                renderer: ({value}) => new Date(value).toISOString().split('T')[0]
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