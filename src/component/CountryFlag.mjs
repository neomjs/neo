import Component    from './Base.mjs';
import CountryFlags from '../util/CountryFlags.mjs';

/**
 * @class Neo.component.CountryFlag
 * @extends Neo.component.Base
 */
class CountryFlag extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.CountryFlag'
         * @protected
         */
        className: 'Neo.component.CountryFlag',
        /**
         * @member {String[]} baseCls=['neo-country-flag']
         */
        baseCls: ['neo-country-flag'],
        /**
         * @member {String|null} location_=null
         */
        location_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'span', cls: ['neo-country-placeholder']},
            {tag: 'span', cls: ['neo-location-text']}
        ]}
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetLocation(value, oldValue) {
        let me = this;

        if (value) {
            let url  = CountryFlags.getFlagUrl(value),
                vdom = me.vdom,
                [flag, text] = vdom.cn;

            if (url) {
                flag.tag   = 'img';
                flag.cls   = ['neo-country-flag'];
                flag.src   = url;
                flag.title = value;
            } else {
                flag.tag = 'span';
                flag.cls = ['neo-country-placeholder'];
                delete flag.src;
                delete flag.title;
            }

            text.text = value || '';

            me.update()
        }
    }
}

export default Neo.setupClass(CountryFlag);
