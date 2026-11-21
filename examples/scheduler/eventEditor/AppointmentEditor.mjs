import EventEditor from '../../../src/timeline/EventEditor.mjs';

/**
 * @summary The scheduler's event editor, worded for a dental practice: an appointment has a treatment, a room, a start
 * and an end, and no progress.
 * @class Neo.examples.scheduler.eventEditor.AppointmentEditor
 * @extends Neo.timeline.EventEditor
 */
class AppointmentEditor extends EventEditor {
    static config = {
        /**
         * @member {String} className='Neo.examples.scheduler.eventEditor.AppointmentEditor'
         * @protected
         */
        className: 'Neo.examples.scheduler.eventEditor.AppointmentEditor',
        /**
         * A form has no use for maximize: the header keeps its close button only.
         * @member {Object} headerConfig={actions: ['close']}
         */
        headerConfig: {actions: ['close']}
    }

    /**
     * @summary Builds the engine's form, then hides Progress and names the resource a room.
     */
    createForm() {
        super.createForm();

        this.getField('percentDone').hidden   = true;
        this.getField('resourceId').labelText = 'Room'
    }
}

export default Neo.setupClass(AppointmentEditor);
