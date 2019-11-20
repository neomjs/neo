import Base from './Base.mjs';

/**
 * @class RealWorld.api.Favorite
 * @extends RealWorld.api.Base
 */
class Favorite extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.Favorite'
         * @private
         */
        className: 'RealWorld.api.Favorite',
        /**
         * @member {String} resource='/articles'
         */
        resource: '/articles' // todo: `articles/${slug}/favorite`
    }}
}

Neo.applyClassConfig(Favorite);

let instance = Neo.create(Favorite);

Neo.applyToGlobalNs(instance);

export default instance;