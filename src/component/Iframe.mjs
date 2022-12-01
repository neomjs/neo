import Base from '../component/Base.mjs';

/**
 * @class Neo.component.Iframe
 * @extends Neo.component.Base
 */
class Iframe extends Base {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.component.Iframe'
         * @protected
         */
        className: 'Neo.component.Iframe',
        /*
         * @member {String[]} cls=['neo-iframe']
         */
        cls: ['neo-iframe'],
        /*
         * @member {String|null} src_=null
         */
        src_: null,
        /*
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'iframe'}
    }}

    /**
     * Triggered after the src config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSrc(value, oldValue) {
        this.changeVdomRootKey('src', value);
    }
}

Neo.applyClassConfig(Iframe);

export default Iframe;
