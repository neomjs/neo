import Board              from '../../../../../src/board/Container.mjs';
import CardModel          from '../../../../../src/board/CardModel.mjs';
import {registerCardItem} from '../../../../../src/board/CardItems.mjs';
import Store              from '../../../../../src/data/Store.mjs';
import Viewport           from '../../../../../src/container/Viewport.mjs';

// A card item holding a native form control. The cards share one radio group, so a drag proxy that cloned a radio with
// its name would join the group and take the checked state from its source.
registerCardItem('choice', record => ({
    tag         : 'input',
    type        : 'radio',
    name        : 'board-choice',
    checked     : record.id === 'r1',
    'aria-label': `Choose ${record.title}`
}));

export const onStart = () => Neo.app({
    name    : 'BoardFormControlTestApp',
    mainView: {
        module: Viewport, id: 'board-form-control-viewport', layout: 'fit',
        items : [{
            module   : Board,
            id       : 'board-form-control-board',
            cardItems: [{type: 'title'}, {type: 'choice'}],
            columns  : [{status: 'todo', title: 'To do'}, {status: 'done', title: 'Done'}],
            store    : {
                module     : Store,
                keyProperty: 'id',
                model      : CardModel,
                data       : [
                    {id: 'r1', title: 'Radio one', status: 'todo', order: 1000},
                    {id: 'r2', title: 'Radio two', status: 'done', order: 1000}
                ]
            }
        }]
    }
});
