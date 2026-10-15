import GridContainer from '../../../../../src/grid/Container.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

const fields  = [{name: 'id', type: 'Integer'}, {name: 'name'}, {name: 'team'}, {name: 'city'}, {name: 'state'}],
      records = [
          {id: 1, name: 'Ada',    team: 'Grid',  city: 'London', state: 'Open'},
          {id: 2, name: 'Grace',  team: 'Build', city: 'Boston', state: 'Closed'},
          {id: 3, name: 'Vega',   team: 'Grid',  city: 'Lyra',   state: 'Open'},
          {id: 4, name: 'Euclid', team: 'Core',  city: 'Athens', state: 'Closed'}
      ];

/**
 * @summary Fixture for header menus configured at construction: `columnMenu: true` is in a grid's config, so the
 * lazily loaded menu plugin meets headers whose first render is still in flight.
 *
 * `grid-column-menu-plain` is the minimal form. `grid-column-menu-locked` adds locked start and end columns and a
 * per-column `columnMenu: false`. Both flex their `city` column, so a resize re-measures their headers.
 * `grid-column-menu-runtime` starts without menus and sizes its columns by their content. Each header's text names its
 * data field.
 * @class Neo.test.playwright.GridColumnMenuViewport
 * @extends Neo.container.Viewport
 */
class GridColumnMenuViewport extends Viewport {
    static config = {
        className: 'Neo.test.playwright.GridColumnMenuViewport',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module    : GridContainer,
            columnMenu: true,
            flex      : 1,
            id        : 'grid-column-menu-plain',
            store     : {module: Store, model: {fields}, data: records},
            columns   : [
                {dataField: 'name', text: 'Name'},
                {dataField: 'team', text: 'Team'},
                {dataField: 'city', text: 'City', flex: 1}
            ]
        }, {
            module    : GridContainer,
            columnMenu: true,
            flex      : 1,
            id        : 'grid-column-menu-locked',
            store     : {module: Store, model: {fields}, data: records},
            columns   : [
                {dataField: 'id',    locked: 'start', text: 'Id', columnMenu: false},
                {dataField: 'name',  locked: 'start', text: 'Name'},
                {dataField: 'team',                   text: 'Team'},
                {dataField: 'city',                   text: 'City', flex: 1},
                {dataField: 'state', locked: 'end',   text: 'State'}
            ]
        }, {
            module : GridContainer,
            flex   : 1,
            id     : 'grid-column-menu-runtime',
            store  : {module: Store, model: {fields}, data: records},
            columns: [
                {dataField: 'name', text: 'Name'},
                {dataField: 'team', text: 'Team'},
                {dataField: 'city', text: 'City'}
            ]
        }]
    }
}

GridColumnMenuViewport = Neo.setupClass(GridColumnMenuViewport);

export const onStart = () => Neo.app({
    mainView: GridColumnMenuViewport,
    name    : 'GridColumnMenu'
});
