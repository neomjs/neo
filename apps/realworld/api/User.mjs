import Base from './Base.mjs';

/**
 * @class RealWorld.api.User
 * @extends RealWorld.api.Base
 * @singleton
 */
class User extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld.api.User'
         * @protected
         */
        className: 'RealWorld.api.User',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/users',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default Neo.setupClass(User);
