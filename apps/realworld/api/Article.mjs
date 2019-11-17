import Base from './Base.mjs';

/**
 * @class RealWorld.api.Article
 * @extends RealWorld.api.Base
 */
class Article extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.Article'
         * @private
         */
        className: 'RealWorld.api.Article',
        /**
         * @member {String} ntype='realworld-api-article'
         * @private
         */
        ntype: 'realworld-api-article',
        /**
         * @member {String} resource='/articles'
         */
        resource: '/articles'
    }}
}

Neo.applyClassConfig(Article);

let instance = Neo.create(Article);

Neo.applyToGlobalNs(instance);

export default instance;