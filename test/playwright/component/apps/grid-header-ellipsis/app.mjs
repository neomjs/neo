import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the grid header label overflow contract.
 *
 * One grid whose first two columns carry composed labels (`key · field`) that are wider than their
 * 90 px columns, the shape that painted "observed · Throughput" across "queued · Pulse" in the
 * header. The third column is wide enough for its label, so the spec can prove the rule leaves a
 * fitting label alone.
 * @class Neo.test.playwright.GridHeaderEllipsisModel
 * @extends Neo.data.Model
 */
class GridHeaderEllipsisModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridHeaderEllipsisModel',
        fields   : [
            {name: 'id',         type: 'Integer'},
            {name: 'throughput', type: 'Integer'},
            {name: 'pulse',      type: 'Integer'},
            {name: 'name',       type: 'String'}
        ]
    }
}

GridHeaderEllipsisModel = Neo.setupClass(GridHeaderEllipsisModel);

class GridHeaderEllipsisStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridHeaderEllipsisStore',
        keyProperty: 'id',
        model      : GridHeaderEllipsisModel,
        data       : Array.from({length: 5}, (_, i) => ({
            id        : i + 1,
            throughput: (i * 41) % 100,
            pulse     : (i * 17) % 100,
            name      : `Row ${i + 1}`
        }))
    }
}

GridHeaderEllipsisStore = Neo.setupClass(GridHeaderEllipsisStore);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'fit'},
        items : [{
            module : GridContainer,
            id     : 'grid-header-ellipsis',
            store  : GridHeaderEllipsisStore,
            columns: [
                {dataField: 'throughput', text: 'observed · Throughput', width: 90},
                {dataField: 'pulse',      text: 'queued · Pulse',        width: 90},
                {dataField: 'name',       text: 'Name',                  flex : 1}
            ]
        }]
    },
    name: 'Test.Playwright.GridHeaderEllipsis'
});
