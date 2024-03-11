import LivePreview  from './LivePreview.mjs';
import TreeList     from '../../../../src/tree/List.mjs';
import {marked}     from '../../../../node_modules/marked/lib/marked.esm.js';

const
    labCloseRegex = /<!--\s*\/lab\s*-->/g,
    labOpenRegex  = /<!--\s*lab\s*-->/g;

/**
 * @class Portal.view.learn.ContentTreeList
 * @extends Neo.container.Base
 */
class ContentTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentTreeList'
         * @protected
         */
        className: 'Portal.view.learn.ContentTreeList',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.contentTree'
        },
        /**
         * @member {String[]} cls=['topics-tree']
         */
        cls: ['topics-tree'],
        /**
         * @member {Boolean} showCollapseExpandAllIcons=false
         */
        showCollapseExpandAllIcons: false
    }

    get contentPath() {
        return `../../resources/data/deck/${this.deck}`
    }

    /**
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async doFetchContent(record) {
        let me   = this,
            path = `${me.contentPath}`,
            content, data, html, modifiedHtml, neoDivs;

        path += `/pages/${record.id}.md`;

        if (record.isLeaf && path) {
            data         = await fetch(path);
            content      = await data.text();
            content      = me.updateContentSectionsStore(content); // also replaces ## with h2 tags
            content      = `# ${record.name}\n${content}`;
            modifiedHtml = await me.highlightPreContent(content);
            neoDivs      = {};

            // Replace <pre data-neo></neo> with <div id='neo-preview-1'/>
            // and create a map keyed by ID, whose value is the javascript
            // from the <pre>
            modifiedHtml = me.extractNeoContent(modifiedHtml, neoDivs);

            html = marked.parse(modifiedHtml);
            html = me.insertLabDivs(html);

            me.fire('contentChange', {
                component: me,
                html,
                isLab: record.name?.startsWith('Lab:'),
                record
            });

            await me.timeout(50); // Do we need this?

            Object.keys(neoDivs).forEach(key => {
                // Create LivePreview for each iteration, set value to neoDivs[key]
                Neo.create(LivePreview, {
                    appName        : me.appName,
                    parentComponent: me,
                    parentId       : key,
                    value          : neoDivs[key],
                    windowId       : me.windowId
                })
            })
        }
    }

    /**
     * @param {String} htmlString
     * @param {Object} map
     * @returns {String}
     */
    extractNeoContent(htmlString, map) {
        // 1. Replace <pre data-neo> with <div id='neo-preview-2'/>
        // and update map with key/value pairs, where the key is the ID and the value is the <pre> contents.

        // Define a regular expression to match <pre data-javascript> tags
        const preRegex = /<pre\s+data-neo\s*>([\s\S]*?)<\/pre>/g;

        let count = 0;

        // Replace the content with tokens, and create a promise to update the corresponding content
        return htmlString.replace(preRegex, (match, preContent) => {
            const key = `pre-live-preview-${Neo.core.IdGenerator.getId()}-${count++}`;
            map[key] = preContent;
            return `<div id="${key}"></div>`
        })
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
     * @param {String} htmlString
     * @returns {Promise<*>}
     */
    async highlightPreContent(htmlString) {
        // 1. Replace <pre data-javascript> with unique tokens and create a HighlightJS.highlightAuto promise for each
        // 2. When all promises are resolved, use their values to replace the tokens.

        // Note that if we were to import HighlightJS directly, we wouldn't need all this async code.

        // Define a regular expression to match <pre data-javascript> tags
        const preRegex = /<pre\s+data-javascript\s*>([\s\S]*?)<\/pre>/g;

        // Create an array to store promises for each replacement
        const replacementPromises = [];
        let count = 0;

        // Replace the content with tokens, and create a promise to update the corresponding content
        let updatedHtml = htmlString.replace(preRegex, (match, preContent) => {
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
     *
     */
    doLoadStore() {
        let me = this;

        Neo.Xhr.promiseJson({
            url: `${me.contentPath}/tree.json`
        }).then(data => {
            // TODO: Tree lists should do this themselves when their store is loaded.
            me.store.data = data.json.data;
            me.getModel().data.countPages = me.store.getCount();
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update()
        })
    }

    /**
     * todo: createItems() should get triggered onStoreLoad()
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.main.addon.HighlightJS.loadLibrary({
            appName        : me.appName,
            highlightJsPath: '../../docs/resources/highlight/highlight.pack.js',
            themePath      : '../../docs/resources/highlightjs-custom-github-theme.css'
        });

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const
                    searchString = data?.substr(1) || '',
                    search       = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};

                me.deck = search.deck || 'learnneo';

                me.doLoadStore()
            })
    }

    /**
     * @param {Object} record
     */
    async onLeafItemClick(record) {
        super.onLeafItemClick(record);

        let me = this;

        me.getModel().data.selectedPageRecordIndex = me.store.indexOf(record);

        await me.doFetchContent(record)
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
            storeData    = [];

        contentArray.forEach((line, index) => {
            if (line.startsWith('##') && line.charAt(2) !== '#') {
                line = line.substring(2).trim();

                storeData.push({id: i, name: line, sourceId: me.id});

                contentArray[index] = `<h2 class="neo-h2" data-record-id="${i}">${line}</h2>`;

                i++
            }
        });

        me.getModel().getStore('contentSections').data = storeData;

        return contentArray.join('\n')
    }
}

Neo.setupClass(ContentTreeList);

export default ContentTreeList;
