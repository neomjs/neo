import Container from '../../../src/container/Base.mjs';
import TextArea  from '../../../src/form/field/TextArea.mjs';

/**
 * @summary The Notes app: one note to write in. The desktop keeps a closed window, so the note is still there when
 * the app opens again.
 * @class Neo.examples.desktop.basic.Notes
 * @extends Neo.container.Base
 */
class Notes extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.desktop.basic.Notes'
         * @protected
         */
        className: 'Neo.examples.desktop.basic.Notes',
        /**
         * @member {String[]} cls=['desktop-basic-notes']
         */
        cls: ['desktop-basic-notes'],
        /**
         * @member {Object} layout='fit'
         */
        layout: 'fit',
        /**
         * @member {Object[]} items
         */
        items: [{
            module         : TextArea,
            hideLabel      : true,
            placeholderText: 'Write things down before they slip away.',
            value          : 'Saturday\n- oat milk, coffee beans\n- call the landlord about the heating\n- return the drill to Mia'
        }]
    }
}

export default Neo.setupClass(Notes);
