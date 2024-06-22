import Base from './Base.mjs';

/**
 * @class RealWorld2.api.Profile
 * @extends RealWorld2.api.Base
 */
class Profile extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld2.api.Profile'
         * @protected
         */
        className: 'RealWorld2.api.Profile',
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

export default Neo.setupClass(Profile);
