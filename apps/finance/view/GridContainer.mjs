import BaseGridContainer from '../../../src/grid/Container.mjs';

/**
 * @summary Streaming equity quote grid with flex columns, animated currency diffs, percent change, and share volume.
 * @class Finance.view.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Finance.view.GridContainer'
         * @protected
         */
        className: 'Finance.view.GridContainer',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.companies'
        },
        /**
         * @member {String[]} cls=['finance-grid']
         * @reactive
         */
        cls: ['finance-grid'],
        /**
         * @member {Number} flex=1
         */
        flex: 1,
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'symbol',
            text     : 'Symbol',
            width    : 88
        }, {
            cellAlign   : 'right',
            compareField: 'tickDelta',
            dataField   : 'value',
            locale      : 'en-US',
            text        : 'Price',
            type        : 'animatedCurrency',
            width       : 86
        }, {
            cellAlign: 'right',
            dataField: 'change',
            locale   : 'en-US',
            text     : 'Change',
            type     : 'animatedCurrency',
            width    : 94
        }, {
            cellAlign: 'right',
            dataField: 'changePercent',
            text     : 'Change %',
            width    : 104,
            /**
             * @summary Formats signed percent deltas with tabular semantic styling.
             * @param {Object} data
             * @param {Number} data.value
             * @returns {Object|String}
             */
            renderer : ({value}) => {
                if (value == null || Number.isNaN(value)) {
                    return ''
                }

                const sign = value > 0 ? '+' : '';

                return {
                    cls : [value > 0 ? 'finance-positive' : value < 0 ? 'finance-negative' : 'finance-flat'],
                    text: `${sign}${value.toFixed(2)}%`
                }
            }
        }, {
            dataField: 'name',
            flex     : 2,
            minWidth : 200,
            text     : 'Company'
        }, {
            dataField: 'sector',
            flex     : 1.3,
            minWidth : 160,
            text     : 'Sector'
        }, {
            cellAlign: 'right',
            dataField: 'volume',
            text     : 'Volume',
            width    : 110,
            /**
             * @summary Renders share volume in millions with one decimal place.
             * @param {Object} data
             * @param {Number} data.value
             * @returns {String}
             */
            renderer : ({value}) => value ? `${(value / 1e6).toFixed(1)}M` : ''
        }, {
            cellAlign: 'right',
            dataField: 'id',
            text     : '#',
            type     : 'index',
            width    : 48
        }]
    }
}

export default Neo.setupClass(GridContainer);
