import BoardContainer from '../../../src/board/Container.mjs';
import CandidateStore from './CandidateStore.mjs';
import Component      from '../../../src/component/Base.mjs';
import Label          from '../../../src/component/Label.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const
    columns = [
        {status: 'applied',   title: 'Applied'},
        {status: 'screen',    title: 'Phone screen'},
        {status: 'interview', title: 'Interview'},
        {status: 'offer',     title: 'Offer'},
        {status: 'hired',     title: 'Hired'}
    ],
    // How each edit starts and ends, as the line under the toolbar names it: [keys, what they do]
    editHints = [
        [['Double-click a name', 'F2'], 'rename on the card'],
        [['Enter'],                     'keeps the new name'],
        [['Esc'],                       'restores the old one'],
        [['⋯'],                         'opens the editor']
    ];

/**
 * @summary A hiring pipeline whose candidates are edited two ways: the name on the card itself, and the stage, role
 * and recruiter in the board's card editor.
 * @description The card's inline edit (`Neo.board.Card#startTitleEdit`) starts on a double-click of the name or on
 * `F2`; `Enter` or leaving the field saves, `Escape` restores. The `⋯` button, or `Enter` on a focused card, opens the
 * board's one card editor ({@link Neo.board.CardEditor}), limited to the fields a card shows.
 * A new stage moves the card to that column through `moveCard`.
 * @class Neo.examples.board.cardEditor.Viewport
 * @extends Neo.container.Viewport
 */
class CardEditorViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardEditor.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.cardEditor.Viewport',
        /**
         * @member {String[]} cls=['pipeline-example']
         */
        cls: ['pipeline-example'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {candidates: {module: CandidateStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['pipeline-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['pipeline-title'],    text: 'Hiring pipeline'},
                {module: Label, cls: ['pipeline-subtitle'], text: 'Rename a candidate on the card, change the rest in its editor'},
                '->',
                {module: ThemeSwitcher}
            ]
        }, {
            module: Component,
            cls   : ['pipeline-hints'],
            flex  : 'none',
            vdom  : {
                'aria-label': 'How to edit a candidate',
                cn          : editHints.map(([keys, effect]) => ({
                    tag: 'span',
                    cls: ['pipeline-hint'],
                    cn : [
                        ...keys.flatMap((key, i) => [
                            ...i > 0 ? [{tag: 'span', cls: ['pipeline-hint-or'], text: 'or'}] : [],
                            {tag: 'kbd', text: key}
                        ]),
                        {tag: 'span', cls: ['pipeline-hint-effect'], text: effect}
                    ]
                }))
            }
        }, {
            module           : BoardContainer,
            ariaLabel        : 'Hiring pipeline board',
            bind             : {store: 'stores.candidates'},
            cardEditorConfig : {
                fieldLabels: {assignees: 'Recruiter', status: 'Stage', tags: 'Role', title: 'Name'},
                fields     : ['title', 'status', 'tags', 'assignees'],
                title      : 'Edit candidate'
            },
            cardItems        : [{type: 'title'}, {type: 'tags'}, {type: 'avatars'}],
            cls              : ['pipeline-board'],
            columns,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }
}

export default Neo.setupClass(CardEditorViewport);
