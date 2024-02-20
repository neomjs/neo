import Base from './Base.mjs';

/**
 * @class RealWorld2.api.Tag
 * @extends RealWorld2.api.Base
 */
class Tag extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld2.api.Tag'
         * @protected
         */
        className: 'RealWorld2.api.Tag',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/tags'
    }
}

Neo.setupClass(Tag);

let instance = Neo.create(Tag);

Neo.applyToGlobalNs(instance);

export default instance;
