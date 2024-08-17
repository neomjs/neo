import Component   from '../../../../src/component/Base.mjs';
import LivePreview from '../../../../src/code/LivePreview.mjs';
import {marked}    from '../../../../node_modules/marked/lib/marked.esm.js';

const
    labCloseRegex        = /<!--\s*\/lab\s*-->/g,
    labOpenRegex         = /<!--\s*lab\s*-->/g,
    preJsRegex           = /<pre\s+data-javascript\s*>([\s\S]*?)<\/pre>/g,
    preNeoRegex          = /<pre\s+data-neo\s*>([\s\S]*?)<\/pre>/g,
    preNeoComponentRegex = /<pre\s+data-neo-component\s*>([\s\S]*?)<\/pre>/g;

/**
 * @class Portal.view.learn.ContentView
 * @extends Neo.component.Base
 */
class ContentView extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentView'
         * @protected
         */
        className: 'Portal.view.learn.ContentView',
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
         */
        record_: null,
        /**
         * @member {String} tag='article'
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
        });

        Neo.main.addon.HighlightJS.loadFiles({
            appName        : me.appName,
            highlightJsPath: '../../docs/resources/highlight/highlight.pack.js',
            themePath      : '../../docs/resources/highlightjs-custom-github-theme.css'
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
                callback: 'findTopmostItem',
                id      : me.id,
                root    : `#${me.parentId}`,
                windowId: me.windowId
            })
        })
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
                    value    : 0
                })
            }
        }
    }

    /**
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async doFetchContent(record) {
        let me   = this,
            path = me.getModel().getData('contentPath'),
            content, data, html, modifiedHtml, neoComponents, neoDivs;

        path += `/pages/${record.id.replaceAll('.', '/')}.md`;

        if (record.isLeaf && path) {
            data          = await fetch(path);
            content       = await data.text();
            content       = me.updateContentSectionsStore(content); // also replaces ## with h2 tags
            content       = `# ${record.name}\n${content}`;
            modifiedHtml  = await me.highlightPreContent(content);
            neoComponents = {};
            neoDivs       = {}

            // Replace <pre neo-component></pre> with <div id='neo-component-x'/>
            // and create a map keyed by ID, whose value is the javascript
            // from the <pre>
            modifiedHtml = me.extractNeoComponents(modifiedHtml, neoComponents);

            // Replace <pre data-neo></pre> with <div id='neo-preview-1'/>
            // and create a map keyed by ID, whose value is the javascript
            // from the <pre>
            modifiedHtml = me.extractNeoContent(modifiedHtml, neoDivs);

            html = marked.parse(modifiedHtml);
            html = me.insertLabDivs(html);

            me.toggleCls('lab', record.name?.startsWith('Lab:'));

            me.html = html;

            await me.timeout(100);

            Object.keys(neoComponents).forEach(key => {
                Neo.create({
                    appName        : me.appName,
                    autoMount      : true,
                    autoRender     : true,
                    className      : 'Neo.component.Base',
                    parentComponent: me,
                    parentId       : key,
                    windowId       : me.windowId,
                    ...neoComponents[key]
                })
            });

            Object.keys(neoDivs).forEach(key => {
                // Create LivePreview for each iteration, set value to neoDivs[key]
                Neo.create(LivePreview, {
                    appName        : me.appName,
                    autoMount      : true,
                    autoRender     : true,
                    parentComponent: me,
                    parentId       : key,
                    value          : neoDivs[key],
                    windowId       : me.windowId
                })
            });

            Neo.main.addon.IntersectionObserver.observe({
                disconnect: true,
                id        : me.id,
                observe   : ['.neo-h2', '.neo-h3'],
                windowId  : me.windowId
            })
        }
    }

    /**
     * @param {String} htmlString
     * @param {Object} map
     * @returns {String}
     */
    extractNeoComponents(htmlString, map) {
        // 1. Replace <pre data-neo-component> with <div id='neo-learn-content-component-x'/>
        // and update map with key/value pairs, where the key is the ID and the value is the <pre> contents.
        // Replace the content with tokens, and create a promise to update the corresponding content
        return htmlString.replace(preNeoComponentRegex, (match, preContent) => {
            const key = Neo.core.IdGenerator.getId('learn-content-component');
            map[key] = JSON.parse(preContent);
            return `<div id="${key}"></div>`
        })
    }

    /**
     * @param {String} htmlString
     * @param {Object} map
     * @returns {String}
     */
    extractNeoContent(htmlString, map) {
        // 1. Replace <pre data-neo> with <div id='neo-pre-live-preview-x'/>
        // and update map with key/value pairs, where the key is the ID and the value is the <pre> contents.
        // Replace the content with tokens, and create a promise to update the corresponding content
        return htmlString.replace(preNeoRegex, (match, preContent) => {
            const key = Neo.core.IdGenerator.getId('pre-live-preview');
            map[key] = preContent;
            return `<div id="${key}"></div>`
        })
    }

    /**
     * @param preContent
     * @param token
     * @param id
     * @returns {Object}
     */
    getHighlightPromise(preContent, token, id) {
        // Resolves to an object of the form {after, token}, where after is the updated <pre> tag content
        return Neo.main.addon.HighlightJS.highlightAuto({html: preContent, windowId: this.windowId})
            .then(highlight => ({after: `<pre data-javascript id="${id}">${highlight.value}</pre>`, token}))
    }

    /**
     * @param {String} htmlString
     * @returns {Promise<*>}
     */
    async highlightPreContent(htmlString) {
        // 1. Replace <pre data-javascript> with unique tokens and create a HighlightJS.highlightAuto promise for each
        // 2. When all promises are resolved, use their values to replace the tokens.

        // Note that if we were to import HighlightJS directly, we wouldn't need all this async code.

        // Create an array to store promises for each replacement
        const replacementPromises = [];
        let count = 0;

        // Replace the content with tokens, and create a promise to update the corresponding content
        let updatedHtml = htmlString.replace(preJsRegex, (match, preContent) => {
            const token = `__NEO-PRE-TOKEN-${++count}__`;
            replacementPromises.push(this.getHighlightPromise(preContent, token, `pre-preview-${Neo.core.IdGenerator.getId()}`));
            return token
        });

        // Assert: updateHtml is the original, but with <pre data-javascript> replaced with tokens.

        // Wait for all replacement promises to resolve
        let replacements = await Promise.all(replacementPromises)

        // Replace each token with the resolved content
        replacements.forEach((replacement) => updatedHtml = updatedHtml.replace(replacement.token, replacement.after));

        // Return the final updated HTML string
        return updatedHtml
    }

    /**
     * @param {String} inputString
     * @returns {String}
     */
    insertLabDivs(inputString) {
        // Replace <!-- lab --> with <div class="lab">
        inputString = inputString.replace(labOpenRegex, '<div class="lab">');

        // Replace <!-- /lab --> with </div>
        inputString = inputString.replace(labCloseRegex, '</div>');

        return inputString
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this,
            record = me.record;

        if (data.altKey && data.shiftKey && !data.metaKey) {
            me.fire('edit', { component: me, record })
        }
        // Command/windows shift click = refresh
        else if (!data.altKey && data.shiftKey && data.metaKey) {
            me.fire('refresh', { component: me, record })
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
            tag;

        contentArray.forEach((line, index) => {
            tag = null;

            if (line.startsWith('##') && line.charAt(2) !== '#') {
                line = line.substring(2).trim();
                tag  = 'h2';
            }

            else if (line.startsWith('###') && line.charAt(3) !== '#') {
                line = line.substring(3).trim();
                tag  = 'h3';
            }

            if (tag) {
                storeData.push({id: i, name: line, sourceId: me.id, tag});

                contentArray[index] = `<${tag} class="neo-${tag}" data-record-id="${i}">${line}</${tag}>`;

                i++
            }
        });

        me.getModel().getStore('contentSections').data = storeData;

        return contentArray.join('\n')
    }
}

export default Neo.setupClass(ContentView);
