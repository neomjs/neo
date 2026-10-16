import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * Words the texts are built from
 * @type {String[]}
 */
const WORDS = ['grid', 'rows', 'wrap', 'their', 'text', 'and', 'grow', 'to', 'fit', 'content', 'neo', 'worker'];

/**
 * @param {Number} count
 * @param {Number} offset
 * @returns {String}
 */
const words = (count, offset) => Array.from({length: count}, (_, w) => WORDS[(offset + w) % WORDS.length]).join(' ');

/**
 * @summary Fixture for content-sized rows sized by a locked column: one wrapped text per region.
 * @class Neo.test.playwright.GridLockedWrapModel
 * @extends Neo.data.Model
 */
class GridLockedWrapModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridLockedWrapModel',
        fields   : [
            {name: 'id',   type: 'Integer'},
            {name: 'lead', type: 'String'},
            {name: 'note', type: 'String'},
            {name: 'text', type: 'String'}
        ]
    }
}

GridLockedWrapModel = Neo.setupClass(GridLockedWrapModel);

/**
 * @summary 120 records that rotate which region holds the long text: `lead` (locked start), `text` (center) or
 * `note` (locked end). The other two hold one or two words, so every three rows each body sizes one of them.
 * @class Neo.test.playwright.GridLockedWrapStore
 * @extends Neo.data.Store
 */
class GridLockedWrapStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridLockedWrapStore',
        keyProperty: 'id',
        model      : GridLockedWrapModel,
        data       : Array.from({length: 120}, (_, i) => {
            // 6 to 15 words in the 120px locked columns, twice as many in the 240px center column
            const long = 6 + (i % 4) * 3;

            return {
                id  : i + 1,
                lead: i % 3 === 0 ? words(long, i)     : words(1, i),
                text: i % 3 === 1 ? words(long * 2, i) : words(2, i),
                note: i % 3 === 2 ? words(long, i)     : words(1, i)
            }
        })
    }
}

GridLockedWrapStore = Neo.setupClass(GridLockedWrapStore);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: 'fit',
        items : [{
            module          : GridContainer,
            contentSizedRows: true,
            id              : 'grid-locked-wrap',
            store           : GridLockedWrapStore,
            columns         : [
                {dataField: 'lead', locked: 'start', text: 'Lead', width: 120, wrapText: true},
                {dataField: 'id',                    text: '#',    width: 64},
                {dataField: 'text',                  text: 'Text', width: 240, wrapText: true},
                {dataField: 'note', locked: 'end',   text: 'Note', width: 120, wrapText: true}
            ]
        }]
    },
    name: 'Test.Playwright.GridLockedWrap'
});
