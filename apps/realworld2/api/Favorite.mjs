import Base from './Base.mjs';

/**
 * @class RealWorld2.api.Favorite
 * @extends RealWorld2.api.Base
 */
class Favorite extends Base {
    static config = {
        /**
         * @member {String} className='RealWorld2.api.Favorite'
         * @protected
         */
        className: 'RealWorld2.api.Favorite'
    }

    /**
     * @param {String} slug
     */
    add(slug) {
        return this.post({
            url: `/articles/${slug}/favorite`
        });
    }

    /**
     * @param {String} slug
     */
    remove(slug) {
        return this.delete({
            url: `/articles/${slug}/favorite`
        });
    }
}

export default Neo.setupClass(Favorite);
