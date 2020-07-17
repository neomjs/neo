import {default as Container} from '../container/Base.mjs';
import Toolbar                from '../container/Toolbar.mjs';

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
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'}
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
            items : ['->', {
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
                style : {borderRight: '1px solid #ddd'}, // todo: scss
                width : 200
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'card', activeIndex: 1},
                items : [{
                    ntype: 'component',
                    vdom : {innerHTML: 'Day'}
                }, {
                    ntype: 'component',
                    vdom : {innerHTML: 'Week'}
                }, {
                    ntype: 'component',
                    vdom : {innerHTML: 'Month'}
                }]
            }]
        }];
    }

    changeTimeInterval(interval) {
        const map = {
            day  : 0,
            month: 2,
            week : 1
        };

        this.items[1].items[1].layout.activeIndex = map[interval];
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};