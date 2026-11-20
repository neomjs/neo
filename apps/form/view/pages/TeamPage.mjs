import ComboBox          from '../../../../src/form/field/ComboBox.mjs';
import Container         from '../../../../src/container/Base.mjs';
import CurrencyField     from '../../../../src/form/field/Currency.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import HiddenField       from '../../../../src/form/field/Hidden.mjs';
import NumberField       from '../../../../src/form/field/Number.mjs';
import Radio             from '../../../../src/form/field/Radio.mjs';
import UrlField          from '../../../../src/form/field/Url.mjs';

/**
 * @summary Step 3: the team's plan and size. A hidden field adds the campaign the visitor came from to what the form
 * submits.
 * @class Form.view.pages.TeamPage
 * @extends Form.view.FormPageContainer
 */
class TeamPage extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.TeamPage'
         * @protected
         */
        className: 'Form.view.pages.TeamPage',
        /**
         * @member {String} formGroup='team'
         */
        formGroup: 'team',
        /**
         * @member {Object[]} items
         */
        items: [{
            module      : Container,
            cls         : ['form-row', 'form-choices'],
            itemDefaults: {
                module    : Radio,
                labelText : null,
                labelWidth: 0,
                name      : 'plan'
            },
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                labelText : 'Plan',
                labelWidth: 60,
                value     : 'starter',
                valueLabel: 'Starter'
            }, {
                checked   : true,
                value     : 'team',
                valueLabel: 'Team'
            }, {
                value     : 'enterprise',
                valueLabel: 'Enterprise'
            }]
        }, {
            module: Container,
            cls   : ['form-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module   : NumberField,
                flex     : 1,
                labelText: 'Seats',
                maxValue : 500,
                minValue : 1,
                name     : 'seats',
                required : true,
                value    : 5
            }, {
                module   : CurrencyField,
                flex     : 1,
                labelText: 'Monthly budget in €',
                name     : 'budget'
            }]
        }, {
            module   : UrlField,
            labelText: 'Company website',
            name     : 'website'
        }, {
            module   : ComboBox,
            editable : false,
            labelText: 'How did you hear about us?',
            name     : 'source',
            store    : {
                data: [
                    {id: 'colleague', name: 'A colleague'},
                    {id: 'search',    name: 'A search engine'},
                    {id: 'social',    name: 'Social media'},
                    {id: 'event',     name: 'A talk or meetup'}
                ]
            }
        }, {
            module: HiddenField,
            name  : 'campaign',
            value : 'engine-14'
        }]
    }
}

export default Neo.setupClass(TeamPage);
