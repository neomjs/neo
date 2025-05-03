import Base from './Base.mjs';

/**
 * @class RealWorld2.api.Tag
 * @extends RealWorld2.api.Base
 * @singleton
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
        resource: '/tags',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default Neo.setupClass(Tag);
