import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * Words the texts are built from. The last one is longer than the `text` column is wide, so it has to break
 * inside the cell.
 * @type {String[]}
 */
const WORDS = ['grid', 'rows', 'wrap', 'their', 'text', 'and', 'grow', 'to', 'fit', 'content', 'neo', 'worker',
    'PneumonoultramicroscopicsilicovolcanoconiosisSupercalifragilisticexpialidocious'];

/**
 * @summary Fixture for measured content-sized rows: records with texts of very different lengths.
 * @class Neo.test.playwright.GridWrapTextModel
 * @extends Neo.data.Model
 */
class GridWrapTextModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridWrapTextModel',
        fields   : [
            {name: 'id',   type: 'Integer'},
            {name: 'tag',  type: 'String'},
            {name: 'text', type: 'String'}
        ]
    }
}

GridWrapTextModel = Neo.setupClass(GridWrapTextModel);

/**
 * @summary 300 records: `text` runs from 1 to 40 words, `tag` from 1 to 6, and every tenth text holds the long word.
 * @class Neo.test.playwright.GridWrapTextStore
 * @extends Neo.data.Store
 */
class GridWrapTextStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridWrapTextStore',
        keyProperty: 'id',
        model      : GridWrapTextModel,
        data       : Array.from({length: 300}, (_, i) => ({
            id  : i + 1,
            tag : Array.from({length: 1 + i % 6}, (_, w) => WORDS[(i + w) % 6]).join(' '),
            text: Array.from({length: 1 + (i * 7) % 40}, (_, w) => WORDS[(i + w) % (i % 10 === 9 ? 13 : 12)]).join(' ')
        }))
    }
}

GridWrapTextStore = Neo.setupClass(GridWrapTextStore);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: 'fit',
        items : [{
            module          : GridContainer,
            contentSizedRows: true,
            id              : 'grid-wrap-text',
            store           : GridWrapTextStore,
            columns         : [
                {dataField: 'tag',  locked: 'start', text: 'Tag',  width: 120, wrapText: true},
                {dataField: 'id',                    text: '#',    width: 80},
                {dataField: 'text',                  text: 'Text', width: 240, wrapText: true}
            ]
        }]
    },
    name: 'Test.Playwright.GridWrapText'
});
