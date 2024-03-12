import Base from './Base.mjs';

/**
 * @class RealWorld.api.User
 * @extends RealWorld.api.Base
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
        resource: '/users'
    }
}

let instance = Neo.setupClass(User);

export default instance;
