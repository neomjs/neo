import {default as Container} from '../../container/Base.mjs';

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
            ntype: 'component',
            html : 'Settings'
        }];
    }
}

Neo.applyClassConfig(SettingsContainer);

export {SettingsContainer as default};