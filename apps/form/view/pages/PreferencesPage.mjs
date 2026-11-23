import CheckBox          from '../../../../src/form/field/CheckBox.mjs';
import Container         from '../../../../src/container/Base.mjs';
import Fieldset          from '../../../../src/form/Fieldset.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import TextArea          from '../../../../src/form/field/TextArea.mjs';

/**
 * @summary Step 4: what the team builds, which emails it wants, and a note. The topics are a required checkbox group,
 * which shows one error for the whole group.
 * @class Form.view.pages.PreferencesPage
 * @extends Form.view.FormPageContainer
 */
class PreferencesPage extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.PreferencesPage'
         * @protected
         */
        className: 'Form.view.pages.PreferencesPage',
        /**
         * @member {String} formGroup='preferences'
         */
        formGroup: 'preferences',
        /**
         * @member {Object[]} items
         */
        items: [{
            module      : Container,
            cls         : ['form-choices'],
            itemDefaults: {
                module       : CheckBox,
                groupRequired: true,
                labelText    : null,
                labelWidth   : 0,
                name         : 'topics'
            },
            items: [{
                labelPosition: 'top',
                labelText    : 'What will your team build?',
                checked      : true,
                value        : 'grids',
                valueLabel   : 'Data grids'
            }, {
                checked   : true,
                value     : 'forms',
                valueLabel: 'Forms'
            }, {
                value     : 'charts',
                valueLabel: 'Charts and dashboards'
            }, {
                value     : 'planning',
                valueLabel: 'Planning tools'
            }]
        }, {
            module   : Fieldset,
            formGroup: 'email',
            title    : 'Email me about',
            items    : [{
                module        : CheckBox,
                checked       : true,
                labelText     : null,
                labelWidth    : 0,
                name          : 'releases',
                uncheckedValue: false,
                valueLabel    : 'New releases'
            }, {
                module        : CheckBox,
                labelText     : null,
                labelWidth    : 0,
                name          : 'events',
                uncheckedValue: false,
                valueLabel    : 'Talks and meetups'
            }]
        }, {
            module   : TextArea,
            labelText: 'Anything we should know?',
            name     : 'notes'
        }]
    }
}

export default Neo.setupClass(PreferencesPage);
