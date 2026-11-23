import Button                  from '../../../src/button/Base.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import Label                   from '../../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';
import TicketList              from './TicketList.mjs';
import Tickets                 from '../store/Tickets.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary A sprint board whose controls and tickets carry tooltips: plain hints on the toolbar, a rich velocity card,
 * one hint per ticket, and delays to tune. The pointer reaches them, and so do Tab and Escape.
 * @class Neo.examples.tooltip.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.tooltip.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.tooltip.view.MainContainer',
        /**
         * @member {String[]} cls=['neo-tooltip-example']
         */
        cls: ['neo-tooltip-example'],
        /**
         * @summary Whether this board opens in the companion browser window.
         * @member {Boolean} companion=false
         */
        companion: false,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-tooltip-example-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{module: Label, flex: 1, reference: 'boardTitle', text: 'Sprint 14'}, {module: ThemeSwitcher}]
        }, {
            module: Label,
            cls   : ['neo-tooltip-example-hint'],
            flex  : 'none',
            text  : 'Hover or tap a control or a ticket, or move with Tab: its tooltip says what it does. Escape closes it.'
        }, {
            module: Toolbar,
            cls   : ['neo-tooltip-example-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '8px'},
            items : [{
                module : Button,
                iconCls: 'fa fa-plus',
                text   : 'New ticket',
                tooltip: 'Create a ticket in this sprint'
            }, {
                module : Button,
                iconCls: 'fa fa-user-plus',
                text   : 'Assign',
                tooltip: 'Assign the selected ticket to a teammate'
            }, {
                module   : Button,
                iconCls  : 'fa fa-chart-line',
                reference: 'velocity',
                text     : 'Velocity',
                tooltip  : {
                    cls        : ['neo-tooltip-example-velocity'],
                    ownInstance: true,
                    items      : [{
                        module: Component,
                        vdom  : {cn: [
                            {tag: 'strong', text: 'Velocity'},
                            {tag: 'p',      text: 'Story points finished per sprint'},
                            {tag: 'table',  cn  : [
                                {tag: 'tr', cn: [{tag: 'th', text: 'Sprint 12'}, {tag: 'td', text: '34'}]},
                                {tag: 'tr', cn: [{tag: 'th', text: 'Sprint 13'}, {tag: 'td', text: '41'}]},
                                {tag: 'tr', cn: [{tag: 'th', text: 'Sprint 14 (now)'}, {tag: 'td', text: '38'}]}
                            ]}
                        ]}
                    }]
                }
            }, {
                module   : Button,
                iconCls  : 'fa fa-box-archive',
                reference: 'archive',
                text     : 'Archive',
                tooltip  : 'Move the finished tickets to the archive'
            }, {
                module   : Button,
                handler  : 'onOpenSecondWindowClick',
                iconCls  : 'fa fa-up-right-from-square',
                reference: 'openSecondWindow',
                text     : 'Open second window',
                tooltip  : 'Try the board’s tooltips in another browser window'
            }]
        }, {
            module: TicketList,
            cls   : ['neo-tooltip-example-tickets'],
            flex  : 'none',
            store : Tickets
        }, {
            module: Container,
            cls   : ['neo-tooltip-example-delays'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '16px'},
            items : [{
                module   : NumberField,
                labelText: 'Show delay (ms)',
                listeners: {change: 'onShowDelayChange'},
                maxValue : 2000,
                stepSize : 100,
                value    : 200,
                width    : 240
            }, {
                module         : NumberField,
                labelText      : 'Hide delay (ms)',
                listeners      : {change: 'onHideDelayChange'},
                maxValue       : 2000,
                placeholderText: 'on leave',
                stepSize       : 100,
                width          : 240
            }]
        }]
    }

    /**
     * @summary The primary board opens with the Archive hint visible. The companion leaves focus to the visitor.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && !this.companion) this.down({reference: 'archive'}).focus()
    }

    /**
     * @summary Identifies the companion board and offers its launcher on the primary SharedWorker board.
     */
    onConstructed() {
        super.onConstructed();

        if (this.companion) this.down({reference: 'boardTitle'}).text = 'Sprint 14 · Second window';
        this.down({reference: 'openSecondWindow'}).hidden = this.companion || !Neo.currentWorker.isSharedWorker
    }
}

export default Neo.setupClass(MainContainer);
