import CoreBase   from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.connection.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class Base extends CoreBase {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.connection.Base'
         * @protected
         */
        className: 'Neo.data.connection.Base',
        /**
         * @member {String} ntype='connection'
         * @protected
         */
        ntype: 'connection',
        /**
         * The url to connect to
         * @member {String|null} url=null
         */
        url: null
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async read(params) {
        throw new Error('connection.Base: read() needs to get implemented in subclasses')
    }

    /**
     * @summary Resolves workspace-relative data URLs against the realm's registered document base.
     * Package-hosted workers sit at a different depth from the page. Only that layout uses the
     * effective document base; Engine/dist workers and pages inside the package keep worker-relative
     * URLs. The base belongs to the realm's registration owner. Use an absolute URL for another base.
     * @param {String} url
     * @param {Boolean} [insideNeo=false] True retains a framework-scoped worker-relative URL.
     * @returns {String} The resolved workspace URL, or the original URL outside that layout.
     */
    resolveUrl(url, insideNeo=false) {
        const base = Neo.config.url?.base,
              href = globalThis.location?.href;

        if (insideNeo || !base || !href || typeof url !== 'string' ||
            !(url.startsWith('./') || url.startsWith('../'))) {
            return url
        }

        const packagePath = '/node_modules/neo.mjs/';

        return new URL(href).pathname.includes(packagePath) && !new URL(base).pathname.includes(packagePath)
            ? new URL(url, base).href
            : url
    }

}

export default Neo.setupClass(Base);
