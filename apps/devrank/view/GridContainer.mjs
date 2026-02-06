import BaseGridContainer  from '../../../src/grid/Container.mjs';
import Contributors       from '../store/Contributors.mjs';
import LocationCell       from './cell/LocationCell.mjs';
import UserCell           from './cell/UserCell.mjs';

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
         * @member {String[]} cls=['devrank-grid-container']
         */
        cls: ['devrank-grid-container'],
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
         * @member {Number} rowHeight=50
         */
        rowHeight: 50,
        /**
         * @member {Object[]} store=Contributors
         * @reactive
         */
        store: Contributors
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.buildDynamicColumns()
    }

    /**
     *
     */
    buildDynamicColumns() {
        const columns = [{
            type     : 'index',
            dataField: 'id',
            text     : '#',
            width    : 60,
            cellAlign: 'right'
        }, {
            dataField: 'login',
            text     : 'User',
            width    : 250,
            type     : 'component',
            component: ({record}) => ({
                module: UserCell,
                record: record
            })
        }, {
            dataField           : 'total_contributions',
            text                : 'Total',
            width               : 100,
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            renderer            : ({value}) => new Intl.NumberFormat().format(value)
        }, {
            dataField         : 'activity',
            text              : 'Activity (15y)',
            width             : 160,
            type              : 'sparkline',
            component         : ({record}) => {
                const data = [];
                // Iterate from 2010 to 2025
                for (let i = 2010; i <= 2025; i++) {
                    data.push(record[`y${i}`] || 0);
                }

                return {
                    values: data
                }
            }
        }, {
            dataField: 'followers',
            text     : 'Followers',
            width    : 100,
            cellAlign: 'right',
            renderer : ({value}) => value ? new Intl.NumberFormat().format(value) : '-'
        }, {
            dataField: 'company',
            text     : 'Company',
            width    : 200,
            renderer : ({value}) => value ? value.replace(/^@/, '') : ''
        }, {
            dataField: 'location',
            text     : 'Location',
            width    : 200,
            type     : 'component',
            component: ({record}) => ({
                module: LocationCell,
                record: record
            })
        }, {
            dataField: 'first_year',
            text     : 'Since', width: 80,
            cellAlign: 'center'
        }, {
            dataField: 'last_updated',
            text     : 'Updated',
            width    : 120,
            cellAlign: 'right',
            renderer : ({value}) => new Date(value).toISOString().split('T')[0]
        }];

        // Add Year Columns
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 2010; year--) {
            columns.push({
                dataField: `y${year}`,
                text     : String(year),
                width    : 80,
                cellAlign: 'center',
                renderer : ({value}) => value || '',
                cellCls  : ({value}) => {
                    if (!value)       return 'heatmap-cell-0';
                    if (value < 100)  return 'heatmap-cell-1';
                    if (value < 1000) return 'heatmap-cell-2';
                    return 'heatmap-cell-3';
                }
            });
        }

        this.columns = columns
    }
}

export default Neo.setupClass(GridContainer);