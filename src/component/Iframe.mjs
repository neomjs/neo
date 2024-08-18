import Base from '../component/Base.mjs';

/**
 * @class Neo.component.Iframe
 * @extends Neo.component.Base
 */
class Iframe extends Base {
    static config = {
        /*
         * @member {String} className='Neo.component.Iframe'
         * @protected
         */
        className: 'Neo.component.Iframe',
        /*
         * @member {String[]} baseCls=['neo-iframe']
         */
        baseCls: ['neo-iframe'],
        /*
         * @member {String|null} src_=null
         */
        src_: null,
        /*
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'iframe'}
    }

    /**
     * Triggered after the src config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSrc(value, oldValue) {
        this.changeVdomRootKey('src', value)
    }
}

export default Neo.setupClass(Iframe);
