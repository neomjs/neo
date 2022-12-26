import Base from '../../component/Base.mjs';

/**
 * @class Neo.component.wrapper.GoogleMaps
 * @extends Neo.component.Base
 */
class GoogleMaps extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.wrapper.GoogleMaps'
         * @protected
         */
        className: 'Neo.component.wrapper.GoogleMaps',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }}
}

Neo.applyClassConfig(GoogleMaps);

export default GoogleMaps;
