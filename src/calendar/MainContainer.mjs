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
                text   : 'Day',
                handler: me.changeTimeInterval
            }, {
                text   : 'Week',
                handler: me.changeTimeInterval
            }, {
                text   : 'Month',
                handler: me.changeTimeInterval
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
                layout: {ntype: 'card'},
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

    changeTimeInterval() {
        console.log('changeTimeInterval');
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};