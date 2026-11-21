import ArticleStore   from './ArticleStore.mjs';
import BoardContainer from '../../../src/board/Container.mjs';
import Button         from '../../../src/button/Base.mjs';
import Component      from '../../../src/component/Base.mjs';
import Container      from '../../../src/container/Base.mjs';
import Label          from '../../../src/component/Label.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const
    COLUMNS = [
        {status: 'idea',      title: 'Idea'},
        {status: 'draft',     title: 'Draft'},
        {status: 'edit',      title: 'Edit'},
        {status: 'scheduled', title: 'Scheduled'},
        {status: 'published', title: 'Published'}
    ],
    CARD_DESIGNS = {
        compact : [
            {type: 'title', field: 'title'}
        ],
        standard: [
            {type: 'title',   field: 'title'},
            {type: 'tags',    field: 'tags'},
            {type: 'avatars', field: 'people'}
        ],
        detailed: [
            {type: 'title',    field: 'title'},
            {type: 'text',     field: 'standfirst'},
            {type: 'tags',     field: 'tags'},
            {type: 'progress', field: 'percentDone'},
            {type: 'avatars',  field: 'people'}
        ]
    },
    DESIGN_SUMMARIES = {
        compact : 'Compact · 1 card item: title',
        standard: 'Standard · 3 card items: title · tags · avatars',
        detailed: 'Detailed · 5 card items: title · standfirst · tags · progress · avatars'
    };

/**
 * @summary Editorial calendar board switching one 32-article store across `Compact`, `Standard`, and `Detailed` card designs in place.
 * @description Demonstrates `Neo.board.Container#cardItems_` over all five built-in `Neo.board.CardItems` renderers
 * (`title`, `text`, `tags`, `progress`, `avatars`). Switching the segmented toolbar control updates `board.cardItems`
 * without rebuilding columns or resetting column scroll positions, while articles missing `tags`, `percentDone`, or
 * `editor` omit empty nodes cleanly without gaps or `"undefined"`.
 * @class Neo.examples.board.cardDesigns.Viewport
 * @extends Neo.container.Viewport
 */
class CardDesignsViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardDesigns.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.cardDesigns.Viewport',
        /**
         * @member {String[]} cls=['editorial-viewport']
         */
        cls: ['editorial-viewport'],
        /**
         * Active card design preset (`'compact' | 'standard' | 'detailed'`).
         * @member {String} design_='detailed'
         * @reactive
         */
        design_: 'detailed',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                articles: {module: ArticleStore}
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['editorial-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['editorial-title'],
                text  : 'Editorial calendar'
            }, {
                module: Label,
                cls   : ['editorial-issue-pill'],
                text  : 'Winter issue · 32 articles'
            }, {
                module: Component,
                cls   : ['editorial-spacer'],
                flex  : 1
            }, {
                module: Container,
                cls   : ['editorial-segmented'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                role  : 'group',
                vdom  : {'aria-label': 'Card design', cn: []},
                items : [{
                    module   : Button,
                    cls      : ['editorial-seg-btn'],
                    handler  : 'up.onSelectCompact',
                    pressed  : false,
                    reference: 'btn-compact',
                    text     : 'Compact'
                }, {
                    module   : Button,
                    cls      : ['editorial-seg-btn'],
                    handler  : 'up.onSelectStandard',
                    pressed  : false,
                    reference: 'btn-standard',
                    text     : 'Standard'
                }, {
                    module   : Button,
                    cls      : ['editorial-seg-btn'],
                    handler  : 'up.onSelectDetailed',
                    pressed  : true,
                    reference: 'btn-detailed',
                    text     : 'Detailed'
                }]
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['editorial-subbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                cls      : ['editorial-design-readout'],
                reference: 'design-readout',
                text     : DESIGN_SUMMARIES.detailed
            }, {
                module: Component,
                cls   : ['editorial-sub-spacer'],
                flex  : 1
            }, {
                module: Component,
                cls   : ['editorial-desk-legend'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['editorial-desk-dot', 'is-climate'], text: 'Climate'},
                        {tag: 'span', cls: ['editorial-desk-dot', 'is-cities'],  text: 'Cities'},
                        {tag: 'span', cls: ['editorial-desk-dot', 'is-science'], text: 'Science'},
                        {tag: 'span', cls: ['editorial-desk-dot', 'is-tech'],    text: 'Tech'},
                        {tag: 'span', cls: ['editorial-desk-dot', 'is-culture'], text: 'Culture'}
                    ]
                }
            }]
        }, {
            module           : BoardContainer,
            ariaLabel        : 'Editorial calendar board',
            bind             : {store: 'stores.articles'},
            cardItems        : CARD_DESIGNS.detailed,
            cls              : ['editorial-board', 'is-detailed'],
            columns          : COLUMNS,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * @summary Switches `board.cardItems`, board density classes, and segmented `Button#pressed` states without reloading.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDesign(value, oldValue) {
        if (oldValue === undefined || !CARD_DESIGNS[value]) {
            return
        }

        const
            me      = this,
            board   = me.getReference('board'),
            readout = me.getReference('design-readout');

        for (const mode of ['compact', 'standard', 'detailed']) {
            const btn = me.getReference(`btn-${mode}`);
            if (btn) {
                btn.pressed = mode === value
            }
        }

        if (board) {
            board.toggleCls('is-compact',  value === 'compact');
            board.toggleCls('is-standard', value === 'standard');
            board.toggleCls('is-detailed', value === 'detailed');
            board.cardItems = CARD_DESIGNS[value]
        }

        if (readout) {
            readout.text = DESIGN_SUMMARIES[value]
        }
    }

    /**
     * @summary Activates the `Compact` (`title`) card design.
     */
    onSelectCompact() {
        this.design = 'compact'
    }

    /**
     * @summary Activates the `Detailed` (`title`, `text`, `tags`, `progress`, `avatars`) card design.
     */
    onSelectDetailed() {
        this.design = 'detailed'
    }

    /**
     * @summary Activates the `Standard` (`title`, `tags`, `avatars`) card design.
     */
    onSelectStandard() {
        this.design = 'standard'
    }
}

export default Neo.setupClass(CardDesignsViewport);
