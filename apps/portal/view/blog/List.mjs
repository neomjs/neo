import BaseList  from '../../../../src/list/Base.mjs';
import BlogPosts from '../../store/BlogPosts.mjs';
import VDomUtil  from '../../../../src/util/VDom.mjs';

/**
 * @class Portal.view.blog.List
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
         * @member {String} className='Portal.view.blog.List'
         * @protected
         */
        className: 'Portal.view.blog.List',
        /**
         * @member {String[]} baseCls=['portal-blog-list','neo-list']
         */
        baseCls: ['portal-blog-list', 'neo-list'],
        /**
         * Specify how many blog item images to preload when intersecting
         * @member {Number} preloadImages=5
         */
        preloadImages: 5,
        /**
         * @member {Neo.data.Store} store=BlogPosts
         */
        store: BlogPosts,
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
     * @member {String} basePath
     */
    get basePath() {
        let basePath;

        if (Neo.config.isGitHubPages) {
            basePath = '../../../../resources_pub/website';

            if (Neo.config.environment !== 'development') {
                basePath = '../../' + basePath
            }
        } else {
            basePath = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/website'
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

        let me = this;

        value && me.timeout(50).then(() => {
            Neo.main.addon.IntersectionObserver.register({
                callback: 'isVisible',
                id      : me.id,
                observe : ['.content'],
                root    : `#${me.parentId}`,
                windowId: me.windowId
            })
        })
    }

    /**
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);

        value.on({
            load : 'onBlogPostStoreLoad',
            scope: this.getController()
        })
    }

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        let {basePath} = this;

        const vdomCn = [
            {cls: ['content'], data: {recordId: record.id}, cn: [
                {cls: ['neo-relative'], cn: [
                    {cls: ['neo-full-size', 'preview-image'], flag: `image-${record.id}`
                        //backgroundImage: `url('${basePath}/blog/${record.image}'), linear-gradient(#777, #333)`
                    },
                    {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                        {tag: 'a', cls: ['neo-title'], href: record.url, target: '_blank', cn: [
                            {flag: 'name', html: record.name.replace(List.nameRegEx, "$1")}
                        ]},
                        {cls: ['neo-top-20'], cn: [
                            {tag: 'img', cls: ['neo-user-image'], src: `${basePath}/blogAuthor/${record.authorImage}`},
                            {cls: ['neo-inner-content'], cn: [
                                {cls: ['neo-inner-details'], flag: 'author', cn: [
                                    {tag: 'span', cls: ['neo-bold'], html: record.author}
                                ]},
                                {cls: ['neo-inner-details'], html: record.date}
                            ]}
                        ]}
                    ]}
                ]}
            ]}
        ];

        if (record.publisher.length > 0) {
            VDomUtil.getByFlag(vdomCn[0], 'author').cn.push(
                {vtype: 'text', html : ' in '},
                {tag: 'span', cls: ['neo-bold'], html: record.publisher}
            )
        }

        if (record.selectedInto.length > 0) {
            vdomCn[0].cn[0].cn.splice(1, 0,
                {cls: ['neo-absolute', 'neo-item-top-position'], cn: [
                    {html: `Officially selected by ${record.provider} into`},
                    {cls: ['neo-bold'], html: record.selectedInto.join('</br>')}
                ]}
            )
        }

        return vdomCn
    }

    /**
     * Custom filtering logic
     * @param {Object} data
     */
    filterItems(data) {
        let me         = this,
            emptyValue = !data.value || data.value === '',
            store      = me.store,
            valueRegEx = new RegExp(data.value, 'gi'),
            hasMatch, itemName, name, record;

        me.getVdomRoot().cn.forEach((item, index) => {
            hasMatch = false;
            itemName = VDomUtil.getByFlag(item, 'name');
            record   = store.getAt(index);
            name     = record.name.replace(List.nameRegEx, "$1");

            item.style = item.style || {};

            if (emptyValue) {
                itemName.html = name;
                delete item.style.display
            } else {
                itemName.html = name.replace(valueRegEx, match => {
                    hasMatch = true;
                    return `<span class="neo-highlight-search">${match}</span>`
                });

                if (hasMatch) {
                    delete item.style.display
                } else {
                    item.style.display = 'none'
                }
            }
        });

        me.update()
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
     * @param {Object} data
     */
    onIntersect(data) {
        let me                = this,
            {basePath, store} = me,
            record            = store.get(parseInt(data.data.recordId)),
            i                 = store.indexOf(record),
            len               = i + me.preloadImages,
            needsUpdate       = false,
            node;

        for (; i < len; i++) {
            node = VDomUtil.getByFlag(me.vdom, `image-${record.id}`);

            if (!node.style) {
                needsUpdate = true;

                node.style = {
                    backgroundImage: `url('${basePath}/blog/${record.image}'), linear-gradient(#777, #333)`
                }
            }
        }

        needsUpdate && me.update()
    }
}

Neo.setupClass(List);

export default List;
