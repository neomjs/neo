import BaseList   from '../../../../../src/list/Base.mjs';
import StringUtil from '../../../../../src/util/String.mjs';
import Videos     from '../../../store/Videos.mjs';

/**
 * @summary The films of the Videos tab: each item is a facade until a visitor clicks it.
 *
 * A facade is the film's preview image, lazily loaded, with a play control; it loads nothing from a YouTube player
 * host. A click sets `activeId`, and only the active item renders the `youtube-nocookie.com` player, so opening
 * another film removes the previous player: at most one plays. The search field filters the store by `name`, and
 * the matches get highlighted.
 * @class Portal.view.news.videos.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    /**
     * Formats the ISO publication dates, in UTC so that a date never shifts by a day
     * @member {Intl.DateTimeFormat} dateFormat
     * @static
     */
    static dateFormat = new Intl.DateTimeFormat('en-US', {day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric'})
    /**
     * Display names for the record field `product`
     * @member {Object} productNames
     * @static
     */
    static productNames = {engine: 'Engine', institution: 'Institution', pro: 'Pro', stage: 'Stage'}

    static config = {
        /**
         * @member {String} className='Portal.view.news.videos.List'
         * @protected
         */
        className: 'Portal.view.news.videos.List',
        /**
         * The id of the record whose facade got replaced by the player, null while no film plays
         * @member {Number|null} activeId_=null
         * @reactive
         */
        activeId_: null,
        /**
         * @member {String[]} baseCls=['portal-videos-list', 'neo-list']
         */
        baseCls: ['portal-videos-list', 'neo-list'],
        /**
         * @member {Neo.data.Store} store=Videos
         * @reactive
         */
        store: Videos,
        /**
         * @member {Boolean} useWrapperNode=true
         * @reactive
         */
        useWrapperNode: true,
        /**
         * @member wrapperCls=['portal-videos-list-wrapper']
         * @reactive
         */
        wrapperCls: ['portal-videos-list-wrapper'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'ul', cn: []}
        ]}
    }

    /**
     * Triggered after the activeId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetActiveId(value, oldValue) {
        oldValue !== undefined && this.createItems()
    }

    /**
     * @param {Object} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        let me     = this,
            itemId = me.getItemId(record),
            media;

        if (record.id === me.activeId) {
            media = {
                tag            : 'iframe',
                id             : `${itemId}__player`,
                cls            : ['portal-videos-player'],
                allow          : 'autoplay; encrypted-media; picture-in-picture',
                allowfullscreen: true,
                referrerpolicy : 'strict-origin-when-cross-origin',
                src            : `https://www.youtube-nocookie.com/embed/${record.youtubeId}?autoplay=1`,
                title          : record.name
            }
        } else {
            media = {tag: 'button', cls: ['portal-videos-facade'], 'aria-label': `Play ${record.name}`, type: 'button', cn: [
                // `loading` precedes `src`: the DOM renderer applies attributes in key order
                {tag: 'img', cls: ['portal-videos-thumbnail'], alt: '', decoding: 'async', loading: 'lazy',
                    src: record.thumbnail || `https://i.ytimg.com/vi/${record.youtubeId}/hqdefault.jpg`},
                {cls: ['portal-videos-play', 'fa', 'fa-play'], 'aria-hidden': true}
            ]}
        }

        return [
            {cls: ['portal-videos-media'], id: `${itemId}__media`, cn: [media]},
            {cls: ['portal-videos-details'], cn: [
                {cls: ['portal-videos-name'], cn: me.createNameNodes(record.name)},
                {cls: ['portal-videos-meta'], text: `${me.formatDate(record.date)} · ${List.productNames[record.product] || record.product}`},
                {cls: ['portal-videos-description'], text: record.description}
            ]}
        ]
    }

    /**
     * @summary Splits a title into text nodes, with the matches of the search field in highlight spans.
     * @param {String} name
     * @returns {Object[]} vdom child nodes
     */
    createNameNodes(name) {
        let {value} = this.store.getFilter('name');

        if (!value) {
            return [{vtype: 'text', text: name}]
        }

        // A capturing group keeps the matches in the result, at the odd indexes
        return name.split(new RegExp(`(${StringUtil.escapeRegExp(value)})`, 'gi'))
            .map((text, index) => index % 2 ? {tag: 'span', cls: ['neo-highlight-search'], text} : {vtype: 'text', text})
            .filter(node => node.text)
    }

    /**
     * @param {String} value An ISO date
     * @returns {String} e.g. 'Oct 31, 2026', or an empty string for an invalid date
     */
    formatDate(value) {
        let date = new Date(value);
        return Number.isNaN(date.valueOf()) ? '' : List.dateFormat.format(date)
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
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        super.onItemClick(node, data);
        this.activeId = data.record.id
    }

    /**
     * A film the search hides stops playing, so it shows its facade again when the search reveals it.
     * The silent reset leaves the re-render to the parent call.
     */
    onStoreFilter() {
        let me = this;

        if (me.activeId !== null && !me.store.get(me.activeId)) {
            me._activeId = null
        }

        super.onStoreFilter()
    }
}

export default Neo.setupClass(List);
