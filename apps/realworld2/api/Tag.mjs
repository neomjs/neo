import Base from './Base.mjs';

/**
 * @class RealWorld2.api.Tag
 * @extends RealWorld2.api.Base
 */
class Tag extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.api.Tag'
         * @private
         */
        className: 'RealWorld2.api.Tag',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/tags'
    }}
}

Neo.applyClassConfig(Tag);

let instance = Neo.create(Tag);

Neo.applyToGlobalNs(instance);

export default instance;