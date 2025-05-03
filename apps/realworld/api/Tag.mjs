import Base from './Base.mjs';

/**
 * @class RealWorld.api.Tag
 * @extends RealWorld.api.Base
 * @singleton
 */
class Tag extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld.api.Tag'
         * @protected
         */
        className: 'RealWorld.api.Tag',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/tags',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default Neo.setupClass(Tag);
