import Base from './Base.mjs';

/**
 * @class RealWorld2.api.User
 * @extends RealWorld2.api.Base
 */
class User extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.api.User'
         * @private
         */
        className: 'RealWorld2.api.User',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/users'
    }}
}

Neo.applyClassConfig(User);

let instance = Neo.create(User);

Neo.applyToGlobalNs(instance);

export default instance;