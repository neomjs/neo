import Button        from '../../../../../src/button/Base.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Toolbar       from '../../../../../src/toolbar/Base.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * Row heights in px, repeating every six rows. `test/playwright/e2e/grid/AnchorCorrection.spec.mjs` mirrors them.
 * @type {Number[]}
 */
const HEIGHTS = [32, 96, 48, 240, 32, 64];

/**
 * @summary Fixture for content-sized anchor corrections: a record carries the height of its row.
 * @class Neo.test.playwright.GridAnchorModel
 * @extends Neo.data.Model
 */
class GridAnchorModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridAnchorModel',
        fields   : [
            {name: 'id',     type: 'Integer'},
            {name: 'height', type: 'Integer'},
            {name: 'name',   type: 'String'}
        ]
    }
}

GridAnchorModel = Neo.setupClass(GridAnchorModel);

/**
 * @summary 300 records whose heights repeat {@link HEIGHTS}.
 * @class Neo.test.playwright.GridAnchorStore
 * @extends Neo.data.Store
 */
class GridAnchorStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridAnchorStore',
        keyProperty: 'id',
        model      : GridAnchorModel,
        data       : Array.from({length: 300}, (_, i) => ({id: i + 1, height: HEIGHTS[i % HEIGHTS.length], name: `Row ${i + 1}`}))
    }
}

GridAnchorStore = Neo.setupClass(GridAnchorStore);

/**
 * @summary A content-sized grid that learns a row's height after the render that first shows the row, in place
 * of measurement.
 *
 * Heights therefore arrive while the grid scrolls, after the rows painted at the estimate, as measured heights do.
 * `resizeTopRows()` changes heights far above a scrolled viewport.
 * @class Neo.test.playwright.GridAnchorGrid
 * @extends Neo.grid.Container
 */
class GridAnchorGrid extends GridContainer {
    static config = {
        className: 'Neo.test.playwright.GridAnchorGrid'
    }

    /**
     * The record ids whose height the grid has learned
     * @member {Set<Number>} #learned
     */
    #learned = new Set()

    /**
     * Scales the heights of the first 20 records
     * @param {Number} factor
     */
    resizeTopRows(factor) {
        let me            = this,
            {store, view} = me;

        view.setRowHeights(new Map(store.items.slice(0, 20).map(record => {
            me.#learned.add(record.id);
            return [view.getRecordId(record), record.height * factor]
        })))
    }

    /**
     * Learns the heights of the mounted rows it has not seen yet
     */
    learnHeights() {
        let me      = this,
            {view}  = me,
            heights = new Map();

        view.bodies.forEach(body => body.items.forEach(({record}) => {
            if (record && !me.#learned.has(record.id)) {
                me.#learned.add(record.id);
                heights.set(view.getRecordId(record), record.height)
            }
        }));

        heights.size > 0 && view.setRowHeights(heights)
    }

    /**
     * Rows reach the DOM through a view update (scrolling, height changes) or a body update (resizing). Both learn
     * once the DOM holds the rows, as a measurement would.
     */
    onConstructed() {
        super.onConstructed();

        let me     = this,
            {view} = me;

        [view, ...view.bodies].forEach(component => {
            let afterUpdate = component.afterExecuteVdomUpdate;

            component.afterExecuteVdomUpdate = function() {
                afterUpdate?.call(this);
                Promise.resolve().then(() => me.isDestroyed || me.learnHeights())
            }
        })
    }
}

GridAnchorGrid = Neo.setupClass(GridAnchorGrid);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                handler: () => Neo.getComponent('grid-anchor').resizeTopRows(2),
                id     : 'grid-anchor-grow',
                text   : 'Double the first 20 rows'
            }, {
                module : Button,
                handler: () => Neo.getComponent('grid-anchor').resizeTopRows(0.5),
                id     : 'grid-anchor-shrink',
                text   : 'Halve the first 20 rows'
            }]
        }, {
            module          : GridAnchorGrid,
            contentSizedRows: true,
            flex            : 1,
            id              : 'grid-anchor',
            rowHeight       : 32,
            store           : GridAnchorStore,
            columns         : [
                {dataField: 'id',     text: '#',      width: 80},
                {dataField: 'name',   text: 'Name',   flex : 1},
                {dataField: 'height', text: 'Height', width: 100}
            ]
        }]
    },
    name: 'Test.Playwright.GridAnchor'
});
