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

Neo.setupClass(User);

let instance = Neo.create(User);

Neo.applyToGlobalNs(instance);

export default instance;
