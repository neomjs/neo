import {default as Container} from '../container/Base.mjs';
import DateSelector           from '../component/DateSelector.mjs';
import ItemsContainer         from './ItemsContainer.mjs';
import Toolbar                from '../container/Toolbar.mjs';
import WeekComponent          from './view/WeekComponent.mjs';

/**
 * @class Neo.calendar.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.MainContainer'
         * @protected
         */
        className: 'Neo.calendar.MainContainer',
        /**
         * @member {String} ntype='calendar-maincontainer'
         * @protected
         */
        ntype: 'calendar-maincontainer',
        /**
         * @member {String[]} cls=['neo-container']
         */
        cls: ['neo-calendar-maincontainer', 'neo-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Boolean} sideBarExpanded_=true
         * @protected
         */
        sideBarExpanded_: true,
        /**
         * @member {Number} sideBarWidth=220
         * @protected
         */
        sideBarWidth: 220
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            style : {borderBottom: '1px solid #ddd'}, // todo: scss
            items : [{
                handler: me.toggleSidebar.bind(me),
                iconCls: 'fa fa-bars'
            }, '->', {
                handler: me.changeTimeInterval.bind(me, 'day'),
                text   : 'Day'
            }, {
                handler: me.changeTimeInterval.bind(me, 'week'),
                pressed: true,
                text   : 'Week'
            }, {
                handler: me.changeTimeInterval.bind(me, 'month'),
                text   : 'Month'
            }]
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: Container,
                cls   : ['neo-calendar-sidebar', 'neo-container'],
                layout: {ntype: 'vbox', align: 'stretch'},
                width : 220,
                items : [{
                    module: DateSelector,
                    flex  : 'none',
                    height: me.sideBarWidth
                }, {
                    module: ItemsContainer,
                    flex  : 1
                }]
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'card', activeIndex: 1},
                items : [{
                    ntype: 'component',
                    vdom : {innerHTML: 'Day'}
                }, {
                    module: WeekComponent
                }, {
                    ntype: 'component',
                    vdom : {innerHTML: 'Month'}
                }]
            }]
        }];
    }

    /**
     * Triggered after the sideBarExpanded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSideBarExpanded(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let sideBar = this.items[1].items[0],
                style   = sideBar.style || {};

            style.marginLeft = value ? '0': `-${this.sideBarWidth}px`;

            sideBar.style = style;
        }
    }

    changeTimeInterval(interval) {
        const map = {
            day  : 0,
            month: 2,
            week : 1
        };

        this.items[1].items[1].layout.activeIndex = map[interval];
    }

    toggleSidebar() {
        this.sideBarExpanded = !this.sideBarExpanded;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};