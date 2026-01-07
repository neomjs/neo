import Markdown from '../../../../../src/component/Markdown.mjs';

/**
 * @summary Displays interactive content (Markdown) within the Portal application.
 * @class Portal.view.shared.content.Component
 * @extends Neo.component.Markdown
 */
class Component extends Markdown {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.content.Component'
         * @protected
         */
        className: 'Portal.view.shared.content.Component',
        /**
         * @member {String[]} baseCls=['portal-content-component','neo-markdown-component']
         * @protected
         */
        baseCls: ['portal-content-component', 'neo-markdown-component'],
        /**
         * @member {Object} bind
         */
        bind: {
            record: data => data.currentPageRecord
        },
        /**
         * @member {Object} record_=null
         * @reactive
         */
        record_: null,
        /**
         * @member {Boolean} replaceTicketIds=true
         */
        replaceTicketIds: true,
        /**
         * @member {String} tag='article'
         * @reactive
         */
        tag: 'article'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click    : me.onClick,
            intersect: 'onIntersect', // view controller
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

        if (value) {
            me.timeout(50).then(() => {
                Neo.main.addon.IntersectionObserver.register({
                    callback: 'findTopmostItem',
                    id      : me.id,
                    root    : `#${me.parentId}`,
                    windowId: me.windowId
                })
            })
        }
    }

    /**
     * Triggered after the nextPageRecord config got changed
     * @param {Object} value
     * @param {Object} oldValue
     */
    async afterSetRecord(value, oldValue) {
        if (value) {
            let me = this;

            await me.doFetchContent(value);

            if (oldValue) {
                await me.timeout(50);

                Neo.main.DomAccess.scrollTo({
                    direction: 'top',
                    id       : me.parentId,
                    value    : 0,
                    windowId : me.windowId
                })
            }
        }
    }

    /**
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async doFetchContent(record) {
        let me         = this,
            {windowId} = me,
            content, data, path;

        path = me.getContentPath(record);

        if (record.isLeaf && path) {
            data    = await fetch(path);
            content = await data.text();

            me.value = content;

            me.toggleCls('lab', record.name?.startsWith('Lab:'));

            Neo.main.addon.IntersectionObserver.observe({
                disconnect: true,
                id        : me.id,
                observe   : ['.neo-h2', '.neo-h3'],
                windowId
            });
        }
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        return null
    }

    /**
     * @member {Object[]} headlineData=null
     * @private
     */
    headlineData = null

    /**
     * @param {Object} data
     */
    onClick({altKey, metaKey, shiftKey}) {
        let me       = this,
            {record} = me;

        if (altKey && !metaKey && shiftKey) {
            me.fire('edit', {component: me, record})
        }
        // Command/windows shift click = refresh
        else if (!altKey && metaKey && shiftKey) {
            me.fire('refresh', {component: me, record})
        }
    }

    /**
     * Updates the sections VM store and replaces ## with h2 tags
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        this.headlineData = [];
        const result = super.modifyMarkdown(content);
        // Using 'sections' store (generic name)
        this.getStateProvider().getStore('sections').data = this.headlineData;
        this.headlineData = null;
        return result
    }

    /**
     * @param {String} tag
     * @param {String} text
     * @param {Number} index
     * @returns {String}
     */
    onHeadline(tag, text, index) {
        // Markdown titles can contain inline code, which we don't want to display inside SectionsList.
        const sideNavTitle = text.replaceAll('`', '');

        this.headlineData.push({id: index, name: sideNavTitle, sourceId: this.id, tag});

        const headline = text.replace(Component.regexInlineCode, '<code>$1</code>');

        return `<${tag} class="neo-${tag}" data-record-id="${index}">${headline}</${tag}>`
    }
}

export default Neo.setupClass(Component);
