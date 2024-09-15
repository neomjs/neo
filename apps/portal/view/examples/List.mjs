import BaseList from '../../../../src/list/Base.mjs';
import VDomUtil from '../../../../src/util/VDom.mjs';

/**
 * @class Portal.view.examples.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    /**
     * A regex to enforce a maxLength (word break)
     * @member {RegExp} nameRegEx
     * @protected
     * @static
     */
    static nameRegEx = /^(.{65}[^\s]*).*/

    static config = {
        /**
         * @member {String} className='Portal.view.examples.List'
         * @protected
         */
        className: 'Portal.view.examples.List',
        /**
         * @member {String[]} baseCls=['portal-examples-list','neo-list']
         */
        baseCls: ['portal-examples-list', 'neo-list'],
        /**
         * @member {String} baseUrl='https://neomjs.com/'
         */
        baseUrl: 'https://neomjs.com/',
        /**
         * The env of the example links.
         * Valid values are 'development', 'dist/development', 'dist/production'
         * @member {String} environment='development'
         */
        environment: 'development',
        /**
         * Specify how many example item images to preload when intersecting
         * @member {Number} preloadImages=5
         */
        preloadImages: 5,
        /**
         * @member {String} sourceBaseUrl='https://github.com/neo.mjs/neo/tree/dev/'
         */
        sourceBaseUrl: 'https://github.com/neo.mjs/neo/tree/dev/',
        /**
         * @member {Boolean} useWrapperNode=true
         */
        useWrapperNode: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'ul', cn: []}
        ]}
    }

    /**
     * @member {String} imageBasePath
     */
    get imageBasePath() {
        let basePath;

        if (Neo.config.isGitHubPages) {
            basePath = '../../../../resources_pub/website/examples';

            if (Neo.config.environment !== 'development') {
                basePath = '../../' + basePath
            }
        } else {
            basePath = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/website/examples'
        }

        return basePath
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            intersect: me.onIntersect,
            scope    : me
        })
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && this.registerIntersectionObserver()
    }

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        let me = this;

        return [
            {cls: ['content', 'neo-relative'], data: {recordId: record.id}, removeDom: me.isHiddenItem(record), cn: [
                {cls: ['neo-multi-window'], data: {neoTooltip: 'Multi Window Demo'}, removeDom: !record.sharedWorkers, cn: [
                    {cls: ['far', 'fa-window-restore']}
                ]},
                {cls: ['neo-full-size', 'preview-image'], flag: `image-${record.id}`},
                {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                    {...me.createLink(record)},
                    {cls: ['neo-top-20'], cn: [
                        {...me.createSourceLink(record)},
                        {cls: ['neo-inner-content'], cn: [
                            {cls: ['neo-inner-details'], html: record.browsers.join(', ')},
                            {cls: ['neo-inner-details'], html: record.environments.join(', ')}
                        ]}
                    ]}
                ]}
            ]}
        ]
    }

    /**
     *
     * @param {Object} record
     * @returns {Object}
     */
    createLink(record) {
        let externalLink = record.url.startsWith('http'),

        vdom = {
            tag : 'a',
            cls : ['neo-title'],
            cn  : [{html: record.name.replace(List.nameRegEx, "$1")}],
            href: record.url
        };

        // We can use a shorter syntax for pointing examples to neomjs.com, but not all examples have to be there.
        if (!externalLink) {
            vdom.href = this.baseUrl + record.url
        }

        // Do not open multi-window examples inside a new browser window, in case the environment is the same.
        // E.g. opening the multi-window covid app & the portal app inside the same app worker is problematic.
        if (!record.sharedWorkers || this.environment !== Neo.config.environment || externalLink) {
            vdom.target = '_blank'
        }

        return vdom
    }

    /**
     *
     * @param {Object} record
     * @returns {Object}
     */
    createSourceLink(record) {
        let vdom = {
            tag   : 'a',
            cls   : ['fab fa-github', 'neo-github-image'],
            href  : record.sourceUrl,
            target: '_blank'
        };

        // We can use a shorter syntax for pointing examples to neomjs/neo repo, but not all examples have to be there.
        if (!record.sourceUrl.startsWith('http')) {
            vdom.href = this.sourceBaseUrl + record.sourceUrl
        }

        return vdom
    }

    /**
     * @returns {Object}
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @returns {Object}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     * @param {Object} record
     * @returns {Boolean}
     */
    isHiddenItem(record) {
        if (record.hidden) {
            return true
        }

        // We only want to show the portal app for the non-current environment.
        // => A link to itself feels pointless
        return record.sourceUrl === 'apps/portal' && this.environment === Neo.config.environment
    }

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let me                     = this,
            {imageBasePath, store} = me,
            record                 = store.get(parseInt(data.data.recordId)),
            i                      = store.indexOf(record),
            len                    = Math.min(i + me.preloadImages, store.getCount()),
            needsUpdate            = false,
            node;

        for (; i < len; i++) {
            node = VDomUtil.getByFlag(me.vdom, `image-${record.id}`);

            if (!node.style) {
                needsUpdate = true;

                node.style = {
                    backgroundImage: `url('${imageBasePath}/${record.image}'), linear-gradient(#777, #333)`
                }
            }
        }

        needsUpdate && me.update()
    }

    /**
     *
     */
    async registerIntersectionObserver() {
        let me   = this,
            opts = {id: me.id, observe: ['.content'], windowId: me.windowId},
            i    = 0,
            len  = me.intersectionObserverReconnects,
            data;

        await me.timeout(150);

        data = await Neo.main.addon.IntersectionObserver.register({
            ...opts,
            callback: 'isVisible',
            root    : `#${me.parentId}`
        });

        if (data.countTargets < 1) {
            for (; i < len; i++) {
                await me.timeout(100);

                data = await Neo.main.addon.IntersectionObserver.observe(opts);

                if (data.countTargets > 0) {
                    break
                }
            }
        }
    }
}

export default Neo.setupClass(List);
