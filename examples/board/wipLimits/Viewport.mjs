import BoardContainer from '../../../src/board/Container.mjs';
import Component      from '../../../src/component/Base.mjs';
import MainStore      from './MainStore.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';
import WorkshopColumn from './WorkshopColumn.mjs';

const STAGE_COLUMNS = [
    {status: 'waiting', title: 'Waiting',          color: '#64748b'},
    {status: 'bench',   title: 'On the bench',     color: '#38bdf8', wipLimit: 3},
    {status: 'testing', title: 'Testing',          color: '#a78bfa', wipLimit: 2},
    {status: 'pickup',  title: 'Ready for pickup', color: '#34d399'}
];

/**
 * @summary Precision repair workshop Kanban board demonstrating column work-in-progress (`wipLimit`) thresholds,
 * live limit steppers, and overloaded stage signalling.
 * @description Binds a 16-record {@link Neo.examples.board.wipLimits.MainStore} to {@link Neo.board.Container} using
 * {@link Neo.examples.board.wipLimits.WorkshopColumn}. `On the bench` starts at `4/3` (marked with
 * `neo-board-column-wip-exceeded`) while `Testing` starts at `2/2` (at limit, unmarked); dragging a card or clicking
 * either column's inline stepper recalculates counts, `count/limit` badges, and overload states immediately.
 * @class Neo.examples.board.wipLimits.Viewport
 * @extends Neo.container.Viewport
 */
class WipLimitsViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.wipLimits.Viewport'
         * @protected
         */
        className: 'Neo.examples.board.wipLimits.Viewport',
        /**
         * @member {String[]} cls=['workshop-viewport']
         */
        cls: ['workshop-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {repairs: {module: MainStore}}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['workshop-toolbar'],
            flex  : 'none',
            items : [{
                module: Component,
                cls   : ['workshop-brand'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['workshop-title'],    text: 'Precision repair workshop'},
                        {tag: 'span', cls: ['workshop-subtitle'], text: '16 active benches & instruments · WIP flow control'}
                    ]
                }
            }, '->', {
                module   : Component,
                cls      : ['workshop-overload-pill'],
                reference: 'overloadPill',
                vdom     : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['workshop-overload-dot'],    text: '▲'},
                        {tag: 'span', cls: ['workshop-overload-text'],   text: '1 stage over limit'},
                        {tag: 'span', cls: ['workshop-overload-detail'], text: ' · On the bench (4/3)'}
                    ]
                }
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Toolbar,
            cls   : ['workshop-stage-bar'],
            flex  : 'none',
            items : [{
                module   : Component,
                cls      : ['workshop-stage-strip'],
                reference: 'stageStrip',
                vdom     : {tag: 'div', cn: []}
            }, '->', {
                module: Component,
                cls   : ['workshop-hint'],
                vdom  : {
                    tag: 'div',
                    cn : [{
                        tag : 'span',
                        text: 'Drag a repair to rebalance stages, or step a stage limit up and down.'
                    }]
                }
            }]
        }, {
            module   : BoardContainer,
            bind     : {store: 'stores.repairs'},
            cardItems: [
                {type: 'title'},
                {type: 'text', field: 'ticketNote'},
                {type: 'tags'},
                {type: 'progress'},
                {type: 'avatars'}
            ],
            cls              : ['workshop-board'],
            columnModule     : WorkshopColumn,
            columns          : STAGE_COLUMNS,
            columnsResortable: false,
            flex             : 1,
            reference        : 'board'
        }]
    }

    /**
     * @summary Wires store and column-limit listeners once constructed and renders the initial stage strip.
     */
    onConstructed() {
        super.onConstructed();

        const
            me    = this,
            board = me.getReference('board'),
            store = me.getStateProvider().getStore('repairs');

        store.on({
            load        : me.syncStageSummary,
            recordChange: me.syncStageSummary,
            scope       : me
        });

        board.on({
            cardsMove           : me.syncStageSummary,
            columnWipLimitChange: me.syncStageSummary,
            scope               : me
        });

        me.syncStageSummary()
    }

    /**
     * @summary Synchronizes the sub-toolbar stage chips and top overload indicator with live column counts and limits.
     */
    syncStageSummary() {
        const
            me           = this,
            board        = me.getReference('board'),
            stageStrip   = me.getReference('stageStrip'),
            overloadPill = me.getReference('overloadPill');

        if (!board || !stageStrip || !overloadPill) {
            return
        }

        const
            columns       = board.getColumns(),
            exceededNames = [];

        stageStrip.vdom.cn = columns.map(col => {
            const
                {count, status, wipLimit} = col,
                title                     = col.title ?? status,
                exceeded                  = wipLimit != null && count > wipLimit,
                atLimit                   = wipLimit != null && count === wipLimit,
                ratioText                 = wipLimit != null ? `${count}/${wipLimit}` : String(count);

            if (exceeded) {
                exceededNames.push(`${title} (${ratioText})`)
            }

            return {
                tag: 'div',
                id : `${stageStrip.id}__chip-${status}`,
                cls: [
                    'workshop-stage-chip',
                    ...(exceeded ? ['is-exceeded'] : atLimit ? ['is-at-limit'] : ['is-open']),
                    ...(status === 'pickup' ? ['is-pickup'] : [])
                ],
                cn: [{
                    tag : 'span',
                    id  : `${stageStrip.id}__chip-mark-${status}`,
                    cls : ['workshop-stage-chip-mark'],
                    text: exceeded ? '▲' : atLimit ? '◆' : '●'
                }, {
                    tag : 'span',
                    id  : `${stageStrip.id}__chip-name-${status}`,
                    cls : ['workshop-stage-chip-name'],
                    text: title
                }, {
                    tag : 'span',
                    id  : `${stageStrip.id}__chip-count-${status}`,
                    cls : ['workshop-stage-chip-count'],
                    text: exceeded ? `${ratioText} OVER` : atLimit ? `${ratioText} FULL` : ratioText
                }]
            }
        });
        stageStrip.update();

        const hasOverload = exceededNames.length > 0;

        overloadPill.toggleCls('is-clear', !hasOverload);
        overloadPill.vdom.cn[0].text = hasOverload ? '▲' : '✓';
        overloadPill.vdom.cn[1].text = hasOverload
            ? `${exceededNames.length === 1 ? '1 stage' : `${exceededNames.length} stages`} over limit`
            : 'All stages within WIP limits';
        overloadPill.vdom.cn[2].text = hasOverload ? ` · ${exceededNames.join(', ')}` : '';
        overloadPill.update()
    }
}

export default Neo.setupClass(WipLimitsViewport);
