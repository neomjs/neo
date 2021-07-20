import Base from '../../../../plugin/Base.mjs';

/**
 * @class Neo.calendar.view.week.plugin.DragDrop
 * @extends Neo.plugin.Base
 */
class DragDrop extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.week.plugin.DragDrop'
         * @protected
         */
        className: 'Neo.calendar.view.week.plugin.DragDrop'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        console.log('here', this.owner);
    }
}

Neo.applyClassConfig(DragDrop);

export {DragDrop as default};
