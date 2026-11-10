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
         * Selects an explicit destination on the canonical example record.
         * @member {String} catalogMode_='dist_prod'
         * @reactive
         */
        catalogMode_: 'dist_prod',
        /**
         * Family-specific cover glyph used until the example has a published screenshot.
         * @member {String} fallbackIconCls='fa fa-star'
         */
        fallbackIconCls: 'fa fa-star',
        /**
         * Specify how many example item images to preload when intersecting
         * @member {Number} preloadImages=5
         */
        preloadImages: 5,
        /**
         * @member {String} sourceBaseUrl='https://github.com/neomjs/neo/tree/dev/'
         */
        sourceBaseUrl: 'https://github.com/neomjs/neo/tree/dev/',
        /**
         * @member {Boolean} useWrapperNode=true
         * @reactive
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
     * @summary Derives link-window behavior from the selected mode, retaining ESM's production mapping.
     * @returns {String}
     */
    get environment() {
        return this.catalogMode === 'devmode' ? 'development'
            : this.catalogMode === 'dist_dev' ? 'dist/development' : 'dist/production'
    }

    /**
     * @summary Re-renders destinations and visibility when the shared build selection changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCatalogMode(value, oldValue) {
        // The first lazy read can occur inside createItemContent; that render already consumes the initial value.
        if (oldValue !== undefined && this.store?.isConstructed) {
            this.createItems();
            this.mounted && this.registerIntersectionObserver()
        }
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
     * @summary Renders the catalog's feature and observation beside the real example links.
     * @param {Object} record
     * @param {Number} index
     */
    createItemContent(record, index) {
        let me         = this,
            imageStyle = index < 4 ? me.getBackgroundImageStyle(record) : null;

        return [
            {cls: ['content', 'neo-relative', ...(record.image && record.feature ? ['portal-example-image-card'] : [])],
                data: {recordId: record.id}, removeDom: me.isHiddenItem(record), cn: [
                {cls: ['neo-multi-window'], data: {neoTooltip: 'Multi Window Demo'}, removeDom: !record.sharedWorkers, cn: [
                    {cls: ['far', 'fa-window-restore']}
                ]},
                {cls: ['neo-full-size', 'preview-image'], flag: `image-${record.id}`, style: imageStyle},
                {cls: ['portal-example-placeholder'], removeDom: !!record.image, cn: [
                    {cls: me.fallbackIconCls.split(' ')},
                    {tag: 'span', text: record.component}
                ]},
                {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                    {...me.createLink(record)},
                    {cls: ['portal-example-feature'], removeDom: !record.feature, text: record.feature},
                    {tag: 'p', cls: ['portal-example-look-for'], removeDom: !record.lookFor, text: record.lookFor},
                    {tag: 'p', cls: ['portal-example-scope'], removeDom: !record.scope, text: record.scope},
                    {cls: ['neo-top-20'], cn: [
                        {...me.createSourceLink(record)},
                        {cls: ['neo-inner-content'], cn: [
                            {cls: ['neo-inner-details'], text: record.browsers.join(', ')},
                            {cls: ['neo-inner-details'], text: record.environments.join(', ')}
                        ]}
                    ]}
                ]}
            ]}
        ]
    }

    /**
     * @summary Resolves the selected build mode without deriving external destinations from source paths.
     * @param {Object} record
     * @returns {Object}
     */
    createLink(record) {
        let url          = record.urls[this.catalogMode],
            externalLink = url?.startsWith('http'),

        vdom = {
            tag : 'a',
            cls : ['neo-title'],
            href: url,
            text: record.name.replace(List.nameRegEx, '$1')
        };

        // We can use a shorter syntax for pointing examples to neomjs.com, but not all examples have to be there.
        if (!externalLink) {
            vdom.href = url ? this.baseUrl + url : null
        }

        // Do not open multi-window examples inside a new browser window, in case the environment is the same.
        // E.g. opening the multi-window covid app & the portal app inside the same app worker is problematic.
        if (!record.sharedWorkers || this.environment !== Neo.config.environment || externalLink) {
            vdom.target = '_blank'
        }

        return vdom
    }

    /**
     * @summary Preserves an example's external or build-specific source destination.
     * @param {Object} record
     * @returns {Object}
     */
    createSourceLink(record) {
        let sourceUrl = record.sourceUrls?.[this.catalogMode] || record.sourceUrl,
            vdom      = {
            tag   : 'a',
            cls   : ['fab', 'fa-github', 'neo-github-image'],
            href  : sourceUrl,
            target: '_blank'
        };

        // We can use a shorter syntax for pointing examples to neomjs/neo repo, but not all examples have to be there.
        if (!sourceUrl.startsWith('http')) {
            vdom.href = this.sourceBaseUrl + sourceUrl
        }

        return vdom
    }

    /**
     * @summary Uses a typographic gradient cover when the example has no published screenshot.
     * @param {Object} record
     * @returns {{backgroundImage: string}}
     */
    getBackgroundImageStyle(record) {
        return {
            backgroundImage: [
                record.image ? `url('${this.imageBasePath}/${record.image}'),` : '',
                'linear-gradient(',
                'var(--portal-examples-list-gradient-start),',
                'var(--portal-examples-list-gradient-end)',
                ')'
            ].join('')
        }
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
     * @summary Retains intentional per-mode exclusions and hides entries with no target in this mode.
     * @param {Object} record
     * @returns {Boolean}
     */
    isHiddenItem(record) {
        if (record.hidden || record.hiddenIn.includes(this.catalogMode) || !record.urls[this.catalogMode]) {
            return true
        }

        // We only want to show the portal app for the non-current environment.
        // => A link to itself feels pointless
        return record.sourceUrl === 'apps/portal' && this.environment === Neo.config.environment
    }

    /**
     * @summary Resolves the stable catalog identity and preloads each following card's own cover.
     * @param {Object} data
     */
    onIntersect(data) {
        let me          = this,
            {store}     = me,
            record      = store.get(data.data.recordId),
            i           = store.indexOf(record),
            len         = Math.min(i + me.preloadImages, store.getCount()),
            needsUpdate = false,
            node;

        for (; i < len; i++) {
            record = store.getAt(i);
            node = VDomUtil.getByFlag(me.vdom, `image-${record.id}`);

            if (!node.style) {
                needsUpdate = true;
                node.style = me.getBackgroundImageStyle(record)
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
