import Base from './Base.mjs';

/**
 * @class RealWorld.api.User
 * @extends RealWorld.api.Base
 */
class User extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.User'
         * @private
         */
        className: 'RealWorld.api.User',
        /**
         * @member {String} resource='/tags'
         */
        resource: '/users'
    }}

    /**
     *
     * @param {Object} opts
     */
    follow(opts) {
        console.log('follow', opts);
    }

    /**
     *
     * @param {Object} opts
     */
    unfollow(opts) {
        console.log('unfollow', opts);
    }
}

Neo.applyClassConfig(User);

let instance = Neo.create(User);

Neo.applyToGlobalNs(instance);

export default instance;