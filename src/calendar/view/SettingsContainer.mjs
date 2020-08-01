import {default as Container}    from '../../container/Base.mjs';
import GeneralContainer          from './settings/GeneralContainer.mjs';
import MonthContainer            from './settings/MonthContainer.mjs';
import {default as TabContainer} from '../../tab/Container.mjs';
import WeekContainer             from './settings/WeekContainer.mjs';
import YearContainer             from './settings/YearContainer.mjs';

/**
 * @class Neo.calendar.view.SettingsContainer
 * @extends Neo.container.Base
 */
class SettingsContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.SettingsContainer'
         * @protected
         */
        className: 'Neo.calendar.view.SettingsContainer',
        /**
         * @member {String} ntype='calendar-settingscontainer'
         * @protected
         */
        ntype: 'calendar-settingscontainer',
        /**
         * @member {String[]} cls=['neo-calendar-settingscontainer', 'neo-container']
         */
        cls: ['neo-calendar-settingscontainer', 'neo-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * True to only keep the active view inside the DOM
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        this.vdom.removeDom = true;
        this.createItems();
    }

    /**
     *
     * @param {Number} width
     */
    collapse(width) {
        let me    = this,
            style = me.style || {},
            vdom;

        style.marginRight = `-${width}px`;
        me._style      = style; // silent update
        me._vdom.style = style; // silent update

        Neo.getComponent(me.parentId).promiseVdomUpdate().then(() => {
            setTimeout(() => {
                vdom = me.vdom;
                vdom.removeDom = true;
                me.vdom = vdom;
            }, 400);
        });
    }

    /**
     *
     */
    createItems() {
        let me = this;

        me.items = [{
            ntype : 'component',
            cls   : ['neo-header'],
            height: 48,
            html  : '<i class="fa fa-cog"></i>Settings'
        }, {
            module             : TabContainer,
            removeInactiveCards: me.removeInactiveCards,

            items: [{
                module: GeneralContainer,
                style : {padding: '20px'},

                tabButtonConfig: {
                    text: 'General'
                }
            }, {
                ntype: 'component',
                html : 'Day',
                style: {padding: '20px'},

                tabButtonConfig: {
                    text: 'Day'
                }
            }, {
                module: WeekContainer,
                style : {padding: '20px'},

                tabButtonConfig: {
                    text: 'Week'
                }
            }, {
                module: MonthContainer,
                style : {padding: '20px'},

                tabButtonConfig: {
                    text: 'Month'
                }
            }, {
                module: YearContainer,
                style : {padding: '20px'},

                tabButtonConfig: {
                    text: 'Year'
                }
            }]
        }];

        super.createItems();
    }

    /**
     *
     */
    expand() {
        let me = this,
            style;

        delete me.vdom.removeDom;

        Neo.getComponent(me.parentId).promiseVdomUpdate().then(() => {
            me.mounted = true;

            setTimeout(() => {
                style = me.style || {}
                style.marginRight = '0px';
                me.style = style;
            }, 50);
        });
    }
}

Neo.applyClassConfig(SettingsContainer);

export {SettingsContainer as default};