import BaseList from '../../../../src/list/Base.mjs';
import Example  from '../../model/Example.mjs';
import NeoArray from '../../../../src/util/Array.mjs';
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
         * Optional map from `family` to group title shown as a pill when {@link showGroup} is `true`.
         * @member {Object|null} groupTitles=null
         */
        groupTitles: null,
        /**
         * @summary Bounds delayed observe calls when card DOM is not ready at registration.
         * @member {Number} intersectionObserverReconnects=10
         */
        intersectionObserverReconnects: 10,
        /**
         * Give the first card 2×2 prominence inside wide three-column grids.
         * @member {Boolean} leadCard_=false
         * @reactive
         */
        leadCard_: false,
        /**
         * Specify how many example item images to preload when intersecting
         * @member {Number} preloadImages=5
         */
        preloadImages: 5,
        /**
         * Show each card's home group title badge (`groupTitles[record.family]`) in the upper-left corner.
         * @member {Boolean} showGroup_=false
         * @reactive
         */
        showGroup_: false,
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
     * @summary Toggles the 2×2 lead-card class on the list wrapper.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLeadCard(value, oldValue) {
        let cls = this.cls;

        value ? NeoArray.add(cls, 'portal-examples-list-lead') : NeoArray.remove(cls, 'portal-examples-list-lead');
        this.cls = cls
    }

    /**
     * @summary Re-renders items when the group-pill visibility changes after construction.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowGroup(value, oldValue) {
        oldValue !== undefined && this.store?.isConstructed && this.createItems()
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
     * @summary Renders the cover as the card, with the title, resting open-live cue, optional group pill and proof line.
     *
     * The cover fills the 16:9 card. Title and `feature` stay visible on a scrim at its foot. The action
     * (`lookFor`), the limits (`scope`) and the source link sit in `.portal-example-more`, which the styles open
     * on hover, focus and selection: a tap selects a list item, so touch reaches them too. A record without a
     * cover never arrives here: the list's store filters it out (`Portal.model.Example.publishes()`).
     * @param {Object} record
     * @param {Number} index
     */
    createItemContent(record, index) {
        let me         = this,
            groupTitle = me.showGroup && me.groupTitles?.[record.family],
            imageStyle = index < 6 ? me.getBackgroundImageStyle(record) : null;

        return [
            {cls: ['content', 'neo-relative', ...(record.image && record.feature ? ['portal-example-image-card'] : [])],
                data: {recordId: record.id}, removeDom: me.isHiddenItem(record), cn: [
                {cls: ['neo-multi-window'], 'aria-label': 'Multi-window live example', data: {neoTooltip: 'Multi-window live example'}, removeDom: !record.sharedWorkers, cn: [
                    {tag: 'i',    cls: ['far', 'fa-window-restore'], 'aria-hidden': true},
                    {tag: 'span', cls: ['neo-multi-window-label'], text: 'Multi-window'}
                ]},
                {cls: ['neo-full-size', 'preview-image'], flag: `image-${record.id}`, style: imageStyle},
                {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                    {tag: 'span', cls: ['portal-example-group-badge'], removeDom: !groupTitle, text: groupTitle},
                    {cls: ['portal-example-title-row'], cn: [
                        {...me.createLink(record)},
                        {...me.createOpenCue(record)}
                    ]},
                    {cls: ['portal-example-feature'], removeDom: !record.feature, text: record.feature},
                    {cls: ['portal-example-more'], cn: [
                        {cls: ['portal-example-more-inner'], cn: [
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
        let externalLink = record.urls[this.catalogMode]?.startsWith('http'),

        vdom = {
            tag : 'a',
            cls : ['neo-title'],
            href: Example.href(record, this.catalogMode, this.baseUrl),
            text: record.name.replace(List.nameRegEx, '$1')
        };

        // Do not open multi-window examples inside a new browser window, in case the environment is the same.
        // E.g. opening the multi-window covid app & the portal app inside the same app worker is problematic.
        if (!record.sharedWorkers || this.environment !== Neo.config.environment || externalLink) {
            vdom.target = '_blank'
        }

        return vdom
    }

    /**
     * @summary Builds the visible launch-cue anchor sharing the title link's target and href.
     * @param {Object} record
     * @returns {Object} vdom
     */
    createOpenCue(record) {
        let {href, target} = this.createLink(record),
            vdom           = {
                tag          : 'a',
                cls          : ['portal-example-open-cue'],
                href,
                'aria-hidden': true,
                tabIndex     : -1,
                text         : 'Open live ↗'
            };

        if (target) {
            vdom.target = target
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
     * @summary Paints the record's cover over the theme gradient that shows while it loads.
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
     * @summary Hides a card the build mode cannot publish (`Portal.model.Example.publishes()`), and the Portal's own
     * card in the build that is running it.
     *
     * The store filters by the same rule. Reading it here as well keeps a card hidden while this list already
     * renders the new mode and its store has not yet re-filtered.
     * @param {Object} record
     * @returns {Boolean}
     */
    isHiddenItem(record) {
        // A link to the page itself would be pointless
        return !Example.publishes(record, this.catalogMode) ||
            (record.sourceUrl === 'apps/portal' && this.environment === Neo.config.environment)
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

        // A card's intersection can arrive after a build switch dropped its record: nothing to preload
        if (!record) return;

        for (; i < len; i++) {
            record = store.getAt(i);
            node = VDomUtil.getByFlag(me.vdom, `image-${store.getKey(record)}`);

            if (!node.style) {
                needsUpdate = true;
                node.style = me.getBackgroundImageStyle(record)
            }
        }

        needsUpdate && me.update()
    }

    /**
     * @summary Observes card visibility, retrying briefly until delayed targets arrive.
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
