import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import CountryField  from '../../../src/form/field/Country.mjs';
import CurrencyField from '../../../src/form/field/Currency.mjs';
import Fieldset      from '../../../src/form/Fieldset.mjs';
import FormContainer from '../../../src/form/Container.mjs';
import IBANField     from '../../../src/form/field/IBAN.mjs';
import PhoneField    from '../../../src/form/field/Phone.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';
import ZipCodeField  from '../../../src/form/field/ZipCode.mjs';

/**
 * Per shipping country: the currency the amount is entered in and a phone number shown as the hint.
 * The countries are the ones `ZipCodeField` and `IBANField` know a format for.
 */
const COUNTRIES = {
    AT: {currency: 'EUR', name: 'Austria',     phone: '+43 1 2345678'},
    CH: {currency: 'CHF', name: 'Switzerland', phone: '+41 44 123 45 67'},
    DE: {currency: 'EUR', name: 'Germany',     phone: '+49 30 1234567'}
};

/**
 * The result line's text before the first check, and again after any change
 */
const HINT_TEXT = 'Fill in the form, then check the order.';

/**
 * Field defaults shared by both fieldsets
 */
const FIELD_DEFAULTS = {
    labelPosition: 'top',
    required     : true
};

/**
 * @summary A checkout form with a shipping address and a payment: Country, ZipCode, Phone, Currency and IBAN.
 *
 * It answers one question: do the fields know about countries? The postal code is linked to the country through
 * `ZipCodeField#countryField`, so the format it accepts changes with the selection. The phone field accepts
 * international numbers and shows the chosen country's format as its hint, and the amount names the country's
 * currency. The IBAN checks its format against the country its own first two letters name, for the countries in
 * `IBANField.countryCodes` (Austria, Germany, Switzerland); its check digits are verified for every country.
 * Check order validates the whole form and says what still needs a fix, in the error colour, or what would be ordered.
 * @class Neo.examples.form.checkout.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.form.checkout.MainContainer'
         * @protected
         */
        className: 'Neo.examples.form.checkout.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-form-checkout']
         */
        cls: ['neo-examples-form-checkout'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'start'}
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'start'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['checkout-card'],
            layout: {ntype: 'vbox', align: 'stretch'},
            width : 880,

            items: [{
                module: Container,
                cls   : ['checkout-heading'],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},

                items: [{
                    module: Container,
                    cls   : ['checkout-header'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

                    items: [{
                        module: Component,
                        flex  : 1,
                        html  : '<h1>Address and payment</h1>'
                    }, {
                        module: ThemeSwitcher,
                        ui    : 'secondary'
                    }]
                }, {
                    module: Component,
                    flex  : 'none',
                    html  : '<p>Do the fields know about countries? The postal code follows the country you pick. ' +
                            'The IBAN format is checked for Austria, Germany and Switzerland, its check digits ' +
                            'for every country.</p>'
                }]
            }, {
                module: FormContainer,
                cls   : ['checkout-form'],
                // Side by side where they fit, one above the other on a phone. Each fieldset keeps its own height:
                // stretching the shorter one would grow its fields.
                layout   : {ntype: 'hbox', align: 'start', wrap: 'wrap'},
                listeners: {fieldChange: 'up.onFieldChange'},
                reference: 'checkout-form',

                items: [{
                    module        : Fieldset,
                    collapsible   : false,
                    flex          : '1 1 340px',
                    iconClsChecked: '',
                    itemDefaults  : FIELD_DEFAULTS,
                    title         : 'Shipping address',

                    items: [{
                        module         : TextField,
                        autoComplete   : 'name',
                        labelText      : 'Full name',
                        minLength      : 2,
                        name           : 'shipping.name',
                        placeholderText: 'Jane Doe',
                        reference      : 'name-field'
                    }, {
                        module        : CountryField,
                        editable      : false,
                        forceSelection: true,
                        labelText     : 'Country',
                        listeners     : {change: 'up.onCountryChange'},
                        name          : 'shipping.country',
                        reference     : 'country-field',
                        value         : 'DE',
                        valueField    : 'code',

                        store: {
                            keyProperty: 'code',
                            model      : {fields: [{name: 'code', type: 'String'}, {name: 'name', type: 'String'}]},
                            data       : Object.entries(COUNTRIES).map(([code, {name}]) => ({code, name})),
                            sorters    : [{property: 'name', direction: 'ASC'}]
                        }
                    }, {
                        module         : ZipCodeField,
                        countryField   : 'country-field',
                        labelText      : 'Postal code',
                        name           : 'shipping.zipCode',
                        placeholderText: '10115',
                        reference      : 'zip-field'
                    }, {
                        module         : PhoneField,
                        autoComplete   : 'tel',
                        labelText      : 'Phone',
                        name           : 'shipping.phone',
                        placeholderText: COUNTRIES.DE.phone,
                        reference      : 'phone-field'
                    }]
                }, {
                    module        : Fieldset,
                    collapsible   : false,
                    flex          : '1 1 340px',
                    iconClsChecked: '',
                    itemDefaults  : FIELD_DEFAULTS,
                    title         : 'Payment',

                    items: [{
                        module         : CurrencyField,
                        labelText      : `Amount (${COUNTRIES.DE.currency})`,
                        maxValue       : 10000,
                        minValue       : 0.01,
                        name           : 'payment.amount',
                        placeholderText: '0.00',
                        reference      : 'amount-field'
                    }, {
                        module         : IBANField,
                        labelText      : 'IBAN',
                        listeners      : {change: 'up.onIbanChange'},
                        name           : 'payment.iban',
                        placeholderText: 'DE89 3704 0044 0532 0130 00',
                        reference      : 'iban-field'
                    }]
                }]
            }, {
                module: Container,
                cls   : ['checkout-actions'],
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

                items: [{
                    module   : Button,
                    handler  : 'up.onCheckOrderClick',
                    reference: 'check-button',
                    text     : 'Check order'
                }, {
                    module   : Component,
                    cls      : ['checkout-result'],
                    // Beside the button where the row has room, on a line of its own on a phone
                    flex     : '1 1 260px',
                    reference: 'checkout-result',
                    role     : 'status',
                    text     : HINT_TEXT
                }]
            }]
        }]
    }

    /**
     * @summary Validates the whole form and says what still needs a fix, in the error colour, or what would be ordered.
     * @returns {Promise<void>}
     */
    async onCheckOrderClick() {
        let me     = this,
            form   = me.getReference('checkout-form'),
            result = me.getReference('checkout-result'),
            valid  = await form.validate(),
            country, fields, values;

        result.toggleCls('checkout-result-fix', !valid);

        if (valid) {
            values  = await form.getSubmitValues();
            country = COUNTRIES[values.shipping.country];

            result.text = `Ready: ${Number(values.payment.amount).toFixed(2)} ${country.currency} from ` +
                          `${values.payment.iban}, shipped to ${values.shipping.zipCode} ${country.name}.`
        } else {
            fields = await form.getFields();

            result.text = 'Fix: ' + fields.filter(field => field.error).map(field => field.labelText).join(', ') + '.'
        }
    }

    /**
     * @summary Takes a checked result back to the hint once any field changes, so it never describes an older form.
     */
    onFieldChange() {
        let result = this.getReference('checkout-result');

        if (result.text !== HINT_TEXT) {
            result.removeCls('checkout-result-fix');
            result.text = HINT_TEXT
        }
    }

    /**
     * @summary Shows the shipping country's phone format and names its currency on the amount.
     * The postal code follows the country through its own `countryField` link.
     * @param {Object} data The combo box emits the chosen record as `value`
     */
    onCountryChange(data) {
        let me      = this,
            country = COUNTRIES[data.value?.code];

        if (country) {
            me.getReference('amount-field').labelText      = `Amount (${country.currency})`;
            me.getReference('phone-field').placeholderText = country.phone
        }
    }

    /**
     * @summary Checks the IBAN's format for the country its first two letters name, where `IBANField` knows one.
     * Its check digits are verified for every country either way.
     * @param {Object} data
     */
    onIbanChange(data) {
        let code = String(data.value || '').slice(0, 2).toUpperCase();

        data.component.countryCode = IBANField.countryCodes[code] ? code : null
    }
}

export default Neo.setupClass(MainContainer);
