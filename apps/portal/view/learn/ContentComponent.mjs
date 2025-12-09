import Markdown from '../../../../src/component/Markdown.mjs';

/**
 * @summary Displays interactive learning content (Markdown) within the Portal application.
 *
 * This component acts as the viewer for the guides, tutorials, and blog posts found in the Neo.mjs documentation.
 * It is responsible for:
 * - **Fetching Content**: Retrieving Markdown files based on the selected record/route.
 * - **Rendering**: Delegating the parsing and rendering of the Markdown (including interactive examples) to `Neo.code.renderer.Markdown`.
 * - **Navigation**: Integrating with the `IntersectionObserver` to track the active section and update the table of contents.
 * - **State Management**: Managing the lifecycle of embedded interactive components (`LivePreview`, custom components).
 *
 * @class Portal.view.learn.ContentComponent
 * @extends Neo.component.Markdown
 */
class ContentComponent extends Markdown {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentComponent'
         * @protected
         */
        className: 'Portal.view.learn.ContentComponent',
        /**
         * @member {String[]} baseCls=['learn-content','neo-markdown-component']
         * @protected
         */
        baseCls: ['learn-content', 'neo-markdown-component'],
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
        let me          = this,
            {windowId}  = me,
            path        = me.getStateProvider().getData('contentPath'),
            pagesFolder = path.includes('/learn/') ? '' : 'pages/',
            content, data;

        path += `${pagesFolder + record.id.replaceAll('.', '/')}.md`;

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
     * Updates the contentSections VM store and replaces ## with h2 tags
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        this.headlineData = [];
        const result = super.modifyMarkdown(content);
        this.getStateProvider().getStore('contentSections').data = this.headlineData;
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
        // Markdown titles can contain inline code, which we don't want to display inside PageSectionsList.
        const sideNavTitle = text.replaceAll('`', '');

        this.headlineData.push({id: index, name: sideNavTitle, sourceId: this.id, tag});

        const headline = text.replace(ContentComponent.regexInlineCode, '<code>$1</code>');

        return `<${tag} class="neo-${tag}" data-record-id="${index}">${headline}</${tag}>`
    }
}

export default Neo.setupClass(ContentComponent);
