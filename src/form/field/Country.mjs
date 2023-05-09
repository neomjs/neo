import Select from '../../form/field/Select.mjs';

/**
 * @class Neo.form.field.Country
 * @extends Neo.form.field.Select
 */
class Country extends Select {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Country'
         * @protected
         */
        className: 'Neo.form.field.Country',
        /**
         * @member {String} ntype='countryfield'
         * @protected
         */
        ntype: 'countryfield'
    }
}

Neo.applyClassConfig(Country);

export default Country;
