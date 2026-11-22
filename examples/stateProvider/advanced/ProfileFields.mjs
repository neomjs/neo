import Container from '../../../src/container/Base.mjs';
import TextField from '../../../src/form/field/Text.mjs';

/**
 * @summary Reusable four-field member editor shared across the main form, dialog, and companion window.
 * @class Neo.examples.stateProvider.advanced.ProfileFields
 * @extends Neo.container.Base
 */
class ProfileFields extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.ProfileFields'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.ProfileFields',
        /**
         * @member {String[]} cls=['sp-profile-fields']
         */
        cls: ['sp-profile-fields'],
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * Prefix applied to field `name` attributes so each surface stays addressable in tests and labels.
         * @member {String} surfacePrefix='form'
         */
        surfacePrefix: 'form'
    }

    /**
     * @summary Builds the four bound text fields targeting the shared `member` record.
     */
    createItems() {
        const me     = this,
              prefix = me.surfacePrefix,
              field  = (key, labelText, placeholder) => ({
                  module       : TextField,
                  cls          : ['sp-field'],
                  clearable    : false,
                  flex         : 'none',
                  labelPosition: 'top',
                  labelText,
                  name         : `${prefix}-${key}`,
                  placeholder,
                  bind         : {
                      disabled: data => data.connected === false,
                      value   : data => data[`member.${key}`] ?? ''
                  },
                  listeners    : {change: opts => me.onFieldInput(key, opts), scope: me}
              });

        me.items = [
            field('name',       'Full name',   'Member name'),
            field('role',       'Role',        'Role or title'),
            field('location',   'Location',    'City and timezone'),
            field('statusNote', 'Status note', 'Current focus or availability')
        ];

        super.createItems()
    }

    /**
     * @summary Commits user edits directly onto the shared `Neo.data.Record` so every store and provider updates.
     * @param {String} fieldName
     * @param {Object} data
     */
    onFieldInput(fieldName, {oldValue, value}) {
        if (oldValue === undefined) return;

        const member = this.getStateProvider()?.getData('member'),
              next   = value ?? '';

        if (member?.isRecord && member[fieldName] !== next) {
            member.set({[fieldName]: next})
        }
    }
}

export default Neo.setupClass(ProfileFields);
