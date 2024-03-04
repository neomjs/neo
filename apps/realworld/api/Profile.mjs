import Base from './Base.mjs';

/**
 * @class RealWorld.api.Profile
 * @extends RealWorld.api.Base
 */
class Profile extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld.api.Profile'
         * @protected
         */
        className: 'RealWorld.api.Profile',
        /**
         * @member {String} resource='/profiles'
         */
        resource: '/profiles'
    }

    /**
     * @param {String} slug
     */
    follow(slug) {
        return this.post({
            url: `/profiles/${slug}/follow`
        });
    }

    /**
     * @param {String} slug
     */
    unfollow(slug) {
        return this.delete({
            url: `/profiles/${slug}/follow`
        });
    }
}

let instance = Neo.setupClass(Profile);

export default instance;
