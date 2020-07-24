import {default as Container} from '../../../container/Base.mjs';

/**
 * @class Neo.calendar.view.settings.GeneralContainer
 * @extends Neo.container.Base
 */
class GeneralContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.GeneralContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.GeneralContainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
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
        }];
    }
}

Neo.applyClassConfig(GeneralContainer);

export {GeneralContainer as default};