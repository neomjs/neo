import Base from './Base.mjs';

/**
 * @class RealWorld2.api.User
 * @extends RealWorld2.api.Base
 * @singleton
 */
class User extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld2.api.User'
         * @protected
         */
        className: 'RealWorld2.api.User',
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
