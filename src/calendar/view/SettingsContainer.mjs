import {default as Container}    from '../../container/Base.mjs';
import {default as TabContainer} from '../../tab/Container.mjs';

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
        layout: {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.items = [{
            ntype : 'component',
            height: 48,
            html  : 'Settings',
            style : {
                padding: '15px 10px'
            }
        }, {
            module: TabContainer,
            items : [{
                ntype: 'component',
                html : 'General',
                style: {padding: '20px'},

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
                ntype: 'component',
                html : 'Week',
                style: {padding: '20px'},

                tabButtonConfig: {
                    text: 'Week'
                }
            }, {
                ntype: 'component',
                html : 'Month',
                style: {padding: '20px'},

                tabButtonConfig: {
                    text: 'Month'
                }
            }, {
                ntype: 'component',
                html : 'Year',
                style: {padding: '20px'},

                tabButtonConfig: {
                    text: 'Year'
                }
            }]
        }];
    }
}

Neo.applyClassConfig(SettingsContainer);

export {SettingsContainer as default};