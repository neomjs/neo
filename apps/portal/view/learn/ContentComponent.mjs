import Component from '../../../../src/component/Base.mjs';

const regexInlineCode = /`([^`]+)`/g;

/**
 * @class Portal.view.learn.ContentComponent
 * @extends Neo.component.Base
 */
class ContentComponent extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentComponent'
         * @protected
         */
        className: 'Portal.view.learn.ContentComponent',
        /**
         * @member {String[]} baseCls=['learn-content']
         * @protected
         */
        baseCls: ['learn-content'],
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
     * @member {Neo.component.Base[]} customComponents=[]
     */
    customComponents = []
    /**
     * @member {Neo.code.LivePreview[]} livePreviews=[]
     */
    livePreviews = []
    /**
     * @member {Neo.code.renderer.Markdown|null} renderer=null
     */
    renderer = null

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
        } else if (oldValue !== undefined) {
            me.customComponents.forEach(component => {
                component.mounted = false
            });

            me.livePreviews.forEach(livePreview => {
                livePreview.mounted = false
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

            oldValue && me.destroyChildInstances();

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
     * Destroy all created child instances
     * @param args
     */
    destroy(...args) {
        this.destroyChildInstances();
        super.destroy(...args)
    }

    /**
     * 
     */
    destroyChildInstances() {
        let me = this;

        me.customComponents.forEach(component => {
            component.destroy()
        });

        me.customComponents = [];

        me.livePreviews.forEach(livePreview => {
            livePreview.destroy()
        });

        me.livePreviews = []
    }

    /**
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async doFetchContent(record) {
        let me                  = this,
            {appName, windowId} = me,
            path                = me.getStateProvider().getData('contentPath'),
            pagesFolder         = path.includes('/learn/') ? '' : 'pages/',
            content, data, result;

        path += `${pagesFolder + record.id.replaceAll('.', '/')}.md`;

        if (record.isLeaf && path) {
            data    = await fetch(path);
            content = await data.text();

            // Update content sections (modifies markdown content with h1/h2/h3 tags and IDs)
            content = me.updateContentSectionsStore(content);

            if (!me.renderer) {
                const module = await import('../../../../src/code/renderer/Markdown.mjs');
                me.renderer = Neo.create(module.default);
            }

            result = await me.renderer.render({
                code: content,
                container: me,
                context: {
                    appName,
                    windowId,
                    parentComponent: me
                }
            });

            me.toggleCls('lab', record.name?.startsWith('Lab:'));

            me.customComponents = result.customComponents;
            me.livePreviews     = result.livePreviews;

            Neo.main.addon.IntersectionObserver.observe({
                disconnect: true,
                id        : me.id,
                observe   : ['.neo-h2', '.neo-h3'],
                windowId
            });
        }
    }

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
    updateContentSectionsStore(content) {
        let me           = this,
            contentArray = content.split('\n'),
            i            = 1,
            storeData    = [],
            headline, sideNavTitle, tag;

        contentArray.forEach((line, index) => {
            tag = null;

            if (line.startsWith('#') && line.charAt(1) !== '#') {
                line = line.substring(1).trim();
                tag  = 'h1'
            }

            else if (line.startsWith('##') && line.charAt(2) !== '#') {
                line = line.substring(2).trim();
                tag  = 'h2'
            }

            else if (line.startsWith('###') && line.charAt(3) !== '#') {
                line = line.substring(3).trim();
                tag  = 'h3'
            }

            if (tag) {
                // Convert backticks to <code> tags for the article headline tags
                headline = line.replace(regexInlineCode, '<code>$1</code>');

                // Markdown titles can contain inline code, which we don't want to display inside PageSectionsList.
                sideNavTitle = line.replaceAll('`', '');

                storeData.push({id: i, name: sideNavTitle, sourceId: me.id, tag});

                contentArray[index] = `<${tag} class="neo-${tag}" data-record-id="${i}">${headline}</${tag}>`;

                i++
            }
        });

        me.getStateProvider().getStore('contentSections').data = storeData;

        return contentArray.join('\n')
    }
}

export default Neo.setupClass(ContentComponent);