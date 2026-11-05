import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import {months}      from './MainModel.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const quarter = (text, slice) => ({text, columns: slice.map(month => ({dataField: month, text: month[0].toUpperCase() + month.slice(1), width: 150}))});

/**
 * @summary A grid whose columns sit under shared group headers in every region, also the fixture its e2e specs drive.
 *
 * The geometry is fixed for test math:
 * - locked start: `region` (180px), ungrouped, so its part of the group row holds no cell;
 * - centre: four quarters of three months each, every month 150px, so 1800px that overflows the centre viewport
 *   and scrolls;
 * - locked end: the `Year` group over `total` (140px).
 *
 * @class Neo.examples.grid.headerGroups.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.headerGroups.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.headerGroups.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: GridContainer,
            store : MainStore,

            columns: [
                {dataField: 'region', locked: 'start', text: 'Region', width: 180},
                quarter('Q1', months.slice(0, 3)),
                quarter('Q2', months.slice(3, 6)),
                quarter('Q3', months.slice(6, 9)),
                quarter('Q4', months.slice(9)),
                {text: 'Year', locked: 'end', columns: [{dataField: 'total', text: 'Total', width: 140}]}
            ]
        }]
    }
}

export default Neo.setupClass(MainContainer);
