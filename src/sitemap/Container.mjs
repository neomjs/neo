import Base from '../container/Base.mjs';

/**
 * @class Neo.sitemap.Container
 * @extends Neo.container.Base
 */
class Container extends Base {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.Container'
         * @protected
         */
        className: 'Neo.sitemap.Container',
        /*
         * @member {Object[]} items
         */
        items: []
    }}
}

Neo.applyClassConfig(Container);

export default Container;
