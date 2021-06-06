import Container from '../../container/Base.mjs';

/**
 * @class Neo.calendar.view.EditEventContainer
 * @extends Neo.container.Base
 */
class EditEventContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.EditEventContainer'
         * @protected
         */
        className: 'Neo.calendar.view.EditEventContainer',
        /**
         * @member {String} ntype='calendar-edit-event-container'
         * @protected
         */
        ntype: 'calendar-edit-event-container',
        /**
         * @member {String[]} cls=['neo-calendar-edit-event-container']
         */
        cls: ['neo-calendar-edit-event-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'component',
            vdom : {html: 'Edit Event'}
        }]
    }}
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
