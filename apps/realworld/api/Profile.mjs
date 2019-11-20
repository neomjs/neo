import Base from './Base.mjs';

/**
 * @class RealWorld.api.Profile
 * @extends RealWorld.api.Base
 */
class Profile extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.Profile'
         * @private
         */
        className: 'RealWorld.api.Profile',
        /**
         * @member {String} resource='/profiles'
         */
        resource: '/profiles'
    }}
}

Neo.applyClassConfig(Profile);

let instance = Neo.create(Profile);

Neo.applyToGlobalNs(instance);

export default instance;