import Base from './Base.mjs';

/**
 * @class RealWorld.api.Tag
 * @extends RealWorld.api.Base
 */
class Tag extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.Tag'
         * @private
         */
        className: 'RealWorld.api.Tag',
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