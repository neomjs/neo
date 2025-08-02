import Component   from '../../../../src/component/Base.mjs';
import LivePreview from '../../../../src/code/LivePreview.mjs';
import {marked}    from '../../../../node_modules/marked/lib/marked.esm.js';

const
    regexInlineCode   = /`([^`]+)`/g,
    regexLabClose     = /<!--\s*\/lab\s*-->/g,
    regexLabOpen      = /<!--\s*lab\s*-->/g,
    regexLivePreview  = /```(javascript|html|css|json)\s+live-preview\s*\n([\s\S]*?)\n\s*```/g,
    regexNeoComponent = /```json\s+neo-component\s*\n([\s\S]*?)\n\s*```/g,
    regexReadonly     = /```(javascript|html|css|json)\s+readonly\s*\n([\s\S]*?)\n\s*```/g;

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
     *
     * @member {Neo.component.Base[]} customComponents=[]
     */
    customComponents = []
    /**
     *
     * @member {Neo.code.LivePreview[]} livePreviews=[]
     */
    livePreviews = []

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
        });

        Neo.main.addon.HighlightJS.loadFiles({
            appName: me.appName
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
                    value    : 0
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
            baseConfigs, content, data, html, instance, neoComponents, neoDivs;

        path += `${pagesFolder + record.id.replaceAll('.', '/')}.md`;

        if (record.isLeaf && path) {
            baseConfigs = {appName, autoInitVnode: true, autoMount: true, parentComponent: me, windowId};
            data        = await fetch(path);
            content     = await data.text();
            // Update content sections (modifies markdown content with h1/h2/h3 tags and IDs)
            content = me.updateContentSectionsStore(content);
            // Initialize maps for custom components and live previews
            neoComponents = {};
            neoDivs       = {};
            // Process custom Neo.mjs component blocks (synchronous)
            content = me.processNeoComponentsBlocks(content, neoComponents);
            // Process custom Live Preview blocks (synchronous)
            content = me.processLivePreviewBlocks(content, neoDivs);
            // Process custom Readonly Code blocks (asynchronous due to HighlightJS)
            // This will replace the markdown fenced block with the highlighted HTML <pre> tag.
            content = await me.processReadonlyCodeBlocks(content, windowId);
            // Parse the (now modified) markdown content into HTML
            // This content string now contains standard markdown PLUS the HTML divs/pres we injected.
            html = marked.parse(content);
            // Insert lab divs (these are markdown comments, so process on the final HTML)
            html = me.insertLabDivs(html); // Keep existing method

            me.toggleCls('lab', record.name?.startsWith('Lab:')); // Keep existing method

            me.html = html; // Set the component's HTML

            await me.timeout(Neo.config.environment === 'development' ? 100 : 150);

            // Create instances for custom components and live previews (keep existing logic)
            Object.keys(neoComponents).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    className: 'Neo.component.Base', // Adjust if specific component classes are implied by JSON
                    parentId : key,
                    ...neoComponents[key]
                });
                me.customComponents.push(instance);
            });

            Object.keys(neoDivs).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    module  : LivePreview,
                    parentId: key,
                    value   : neoDivs[key].code // Pass the extracted code content
                });
                me.livePreviews.push(instance);
            });

            Neo.main.addon.IntersectionObserver.observe({
                disconnect: true,
                id        : me.id,
                observe   : ['.neo-h2', '.neo-h3'],
                windowId  : me.windowId
            });
        }
    }

    /**
     * @param {String} inputString
     * @returns {String}
     */
    insertLabDivs(inputString) {
        // Replace <!-- lab --> with <div class="lab">
        inputString = inputString.replace(regexLabOpen, '<div class="lab">');

        // Replace <!-- /lab --> with </div>
        inputString = inputString.replace(regexLabClose, '</div>');

        return inputString
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
     * Extracts live preview code blocks from Markdown content before marked.js parsing.
     * Replaces them with HTML placeholders.
     * @param {String} contentString The raw Markdown content string.
     * @param {Object} map A map to store the extracted code content keyed by placeholder ID.
     * @returns {String} The modified Markdown content string with placeholders.
     */
    processLivePreviewBlocks(contentString, map) {
        return contentString.replace(regexLivePreview, (match, language, code) => {
            const key = Neo.core.IdGenerator.getId('pre-live-preview');
            map[key] = {code, language};
            return `<div id="${key}"></div>`
        })
    }

    /**
     * Extracts Neo.mjs component config blocks from Markdown content before marked.js parsing.
     * Replaces them with HTML placeholders.
     * @param {String} contentString The raw Markdown content string.
     * @param {Object} map A map to store the extracted JSON config keyed by placeholder ID.
     * @returns {String} The modified Markdown content string with placeholders.
     */
    processNeoComponentsBlocks(contentString, map) {
        return contentString.replace(regexNeoComponent, (match, code) => {
            const key = Neo.core.IdGenerator.getId('learn-content-component');
            map[key] = JSON.parse(code);
            return `<div id="${key}"></div>`
        })
    }

    /**
     * Highlights readonly code blocks using HighlightJS.
     * Replaces the Markdown fenced block with the highlighted HTML <pre> tag.
     * @param {String} contentString The raw Markdown content string.
     * @param {String} windowId The ID of the current window for HighlightJS.
     * @returns {Promise<String>} A promise that resolves to the modified Markdown string with highlighted HTML.
     */
    async processReadonlyCodeBlocks(contentString, windowId) {
        let replacementPromises = [],
            count               = 0,
            replacements;

        // Replace the content with tokens, and create a promise to update the corresponding content
        let updatedContent = contentString.replace(regexReadonly, (match, language, code) => {
            const token = `__NEO-READONLY-TOKEN-${++count}__`;
            // Call HighlightJS.highlightAuto for each block.
            // The result will be HTML. We'll wrap it in a <pre data-javascript> later.
            replacementPromises.push(
                Neo.main.addon.HighlightJS.highlightAuto({html: code, windowId})
                    .then(highlightedHtml => ({
                        after: `<pre data-javascript id="pre-readonly-${Neo.core.IdGenerator.getId()}">${highlightedHtml.trim()}</pre>`,
                        token: token
                    }))
            );

            return token; // Replace the original Markdown block with a temporary token
        });

        // Wait for all highlighting promises to resolve
        replacements = await Promise.all(replacementPromises);

        // Replace each token with the resolved highlighted HTML content
        replacements.forEach(replacement => {
            updatedContent = updatedContent.replace(replacement.token, replacement.after)
        });

        return updatedContent
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
