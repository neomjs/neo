import Component    from '../../../../src/component/Base.mjs';
import CountryFlags from '../../../../src/util/CountryFlags.mjs';

/**
 * @class DevRank.view.cell.LocationCell
 * @extends Neo.component.Base
 */
class LocationCell extends Component {
    static config = {
        /**
         * @member {String} className='DevRank.view.cell.LocationCell'
         * @protected
         */
        className: 'DevRank.view.cell.LocationCell',
        /**
         * @member {String[]} cls=['location-cell']
         */
        cls: ['location-cell'],
        /**
         * @member {Object} record_=null
         */
        record_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'span', cls: ['country-placeholder']}, // Default to placeholder
            {tag: 'span', cls: ['location-text']}
        ]}
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    afterSetRecord(value, oldValue) {
        let me = this;

        if (value) {
            let loc          = value.location,
                url          = CountryFlags.getFlagUrl(loc),
                vdom         = me.vdom,
                [flag, text] = vdom.cn;

            if (url) {
                flag.tag   = 'img';
                flag.cls   = ['country-flag'];
                flag.src   = url;
                flag.title = loc;
            } else {
                flag.tag = 'span';
                flag.cls = ['country-placeholder'];
                delete flag.src;
                delete flag.title;
            }

            text.text = loc || '';

            me.update()
        }
    }
}

export default Neo.setupClass(LocationCell);
