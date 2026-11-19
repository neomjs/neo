import Button                from '../../../src/button/Base.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import CountryField          from '../../../src/form/field/Country.mjs';
import CurrencyField         from '../../../src/form/field/Currency.mjs';
import Fieldset              from '../../../src/form/Fieldset.mjs';
import FormContainer         from '../../../src/form/Container.mjs';
import IBANField             from '../../../src/form/field/IBAN.mjs';
import Label                 from '../../../src/component/Label.mjs';
import PhoneField            from '../../../src/form/field/Phone.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import ZipCodeField          from '../../../src/form/field/ZipCode.mjs';

/**
 * Per shipping country: the currency the amount is entered in and a phone number to show as the hint.
 * The countries are the ones ZipCodeField and IBANField know a format for.
 * @member {Object} countrySettings
 */
const countrySettings = {
    AT: {currency: 'EUR', phone: '+43 1 2345678'},
    CH: {currency: 'CHF', phone: '+41 44 123 45 67'},
    DE: {currency: 'EUR', phone: '+49 30 1234567'}
};

/**
 * @summary A checkout form with a shipping address and a payment: Country, ZipCode, Phone, Currency and IBAN.
 *
 * The postal code, the phone hint and the amount's currency follow the chosen country through
 * `onCountryChange()`. The postal code gets the country's `countryCode` there rather than through
 * `ZipCodeField.countryField`, which reads a `record` the combo box's change event no longer carries. The IBAN follows its own first two letters: its format is checked for
 * the countries `IBANField.countryCodes` lists, and its check digits for every country.
 * @class Neo.examples.form.checkout.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.checkout.MainContainer',
        autoMount           : true,
        componentName       : 'Address and payment',
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        description         : 'The postal code follows the country (Austria, Switzerland, Germany). The IBAN format is checked for AT, CH and DE, its check digits for every country.',
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [{
            module : Button,
            handler: me.onCheckOrderClick.bind(me),
            text   : 'Check order'
        }]
    }

    /**
     * @returns {Neo.form.Container}
     */
    createExampleComponent() {
        let me = this;

        return Neo.create({
            module: FormContainer,
            style : {maxWidth: '420px', width: '100%'},

            itemDefaults: {
                module: Fieldset,
                style : {marginBottom: '20px'},

                itemDefaults: {
                    labelPosition: 'inline',
                    required     : true,
                    style        : {marginBottom: '10px'}
                }
            },

            items: [{
                title: 'Shipping address',

                items: [{
                    module   : TextField,
                    labelText: 'Full name',
                    name     : 'shipping.name'
                }, {
                    module        : CountryField,
                    editable      : false,
                    forceSelection: true,
                    labelText     : 'Country',
                    listeners     : {change: me.onCountryChange, scope: me},
                    name          : 'shipping.country',
                    reference     : 'country',
                    value         : 'DE',

                    // The countries ZipCodeField and IBANField know a format for, keyed by their ISO code
                    store: {
                        keyProperty: 'code',
                        model      : {
                            fields: [
                                {name: 'code', type: 'String'},
                                {name: 'name', type: 'String'}
                            ]
                        },
                        data: [
                            {code: 'AT', name: 'Austria'},
                            {code: 'DE', name: 'Germany'},
                            {code: 'CH', name: 'Switzerland'}
                        ]
                    }
                }, {
                    module     : ZipCodeField,
                    countryCode: 'DE',
                    labelText  : 'Postal code',
                    name       : 'shipping.zipCode',
                    reference  : 'zipCode'
                }, {
                    module         : PhoneField,
                    labelText      : 'Phone',
                    name           : 'shipping.phone',
                    placeholderText: countrySettings.DE.phone,
                    reference      : 'phone'
                }]
            }, {
                title: 'Payment',

                items: [{
                    module         : CurrencyField,
                    labelText      : 'Amount (EUR)',
                    maxValue       : 10000,
                    minValue       : 0.01,
                    name           : 'payment.amount',
                    placeholderText: '0.00',
                    reference      : 'amount'
                }, {
                    module         : IBANField,
                    labelText      : 'IBAN',
                    listeners      : {change: me.onIbanChange, scope: me},
                    name           : 'payment.iban',
                    placeholderText: 'DE89 3704 0044 0532 0130 00'
                }]
            }, {
                // Shows the result of the inspector's "Check order"
                module   : Label,
                reference: 'order-result',
                style    : {display: 'block', whiteSpace: 'pre-wrap'},
                text     : 'Fill in the form, then press Check order in the inspector.'
            }]
        })
    }

    /**
     * @param {Object} data
     */
    async onCheckOrderClick(data) {
        let me     = this,
            form   = me.exampleComponent,
            result = me.getReference('order-result'),
            valid  = await form.validate(),
            values = await form.getSubmitValues();

        result.text = valid
            ? `Order looks good:\n${JSON.stringify(values, null, 2)}`
            : 'Some fields need a fix: see the messages under them.'
    }

    /**
     * Keeps the postal code's format, the phone hint and the amount's currency in step with the shipping country.
     * The combo box's change event carries the chosen record as `value`.
     * @param {Object} data
     */
    onCountryChange(data) {
        let form     = this.exampleComponent,
            code     = data.value?.code || null,
            settings = countrySettings[code];

        if (form) {
            form.down({reference: 'zipCode'}).countryCode = code
        }

        if (form && settings) {
            form.down({reference: 'amount'}).labelText      = `Amount (${settings.currency})`;
            form.down({reference: 'phone'}).placeholderText = settings.phone
        }
    }

    /**
     * Checks the IBAN's format for the country its first two letters name, where IBANField knows one.
     * Its check digits are checked for every country.
     * @param {Object} data
     */
    onIbanChange(data) {
        let code = (data.value || '').slice(0, 2).toUpperCase();

        data.component.countryCode = IBANField.countryCodes[code] ? code : null
    }

    /**
     * The inspector's Reset also clears the form; the country goes back to its starting value.
     */
    async onReset() {
        let me = this;

        super.onReset();

        // Every field not named here is cleared
        await me.exampleComponent.reset({shipping: {country: 'DE'}});
        me.getReference('order-result').text = 'Fill in the form, then press Check order in the inspector.'
    }
}

export default Neo.setupClass(MainContainer);
