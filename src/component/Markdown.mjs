import Component   from './Base.mjs';
import HighlightJs from '../util/HighlightJs.mjs';
import IdGenerator from '../core/IdGenerator.mjs';
import {marked}    from '../../node_modules/marked/lib/marked.esm.js';

const
    regexLabClose     = /<!--\s*\/lab\s*-->/g,
    regexLabOpen      = /<!--\s*lab\s*-->/g,
    regexLivePreview  = /```(javascript|html|css|json)\s+live-preview\s*\n([\s\S]*?)\n\s*```/g,
    regexNeoComponent = /```json\s+neo-component\s*\n([\s\S]*?)\n\s*```/g,
    regexReadonly     = /```(bash|javascript|html|css|json|scss|xml|markdown|yaml)\s+readonly\s*\n([\s\S]*?)\n\s*```/g;

/**
 * @summary A specialized component for rendering Markdown content.
 *
 * This component provides a declarative way to display Markdown within a Neo.mjs application.
 * It encapsulates the rendering logic and styling, ensuring consistency across different views.
 *
 * It supports:
 * - **Reactive Content**: Updates automatically when the `value` config changes.
 * - **Interactive Elements**: Properly mounts and manages embedded Neo.mjs components (`live-preview`, `neo-component`).
 * - **Lifecycle Management**: Handles the destruction of embedded components when this component is destroyed.
 *
 * @class Neo.component.Markdown
 * @extends Neo.component.Base
 */
class Markdown extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Markdown'
         * @protected
         */
        className: 'Neo.component.Markdown',
        /**
         * @member {String} ntype='markdown'
         * @protected
         */
        ntype: 'markdown',
        /**
         * @member {String[]} baseCls=['neo-markdown-component']
         * @protected
         */
        baseCls: ['neo-markdown-component'],
        /**
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
        /**
         * Optional windowUrl to pass to nested code.LivePreviews.
         * @member {String|null} windowUrl=null
         */
        windowUrl: null
    }

    /**
     * @member {Neo.component.Base[]} activeComponents=[]
     */
    activeComponents = []

    /**
     * @member {RegExp} regexInlineCode=/`([^`]+)`/g
     * @protected
     * @static
     */
    static regexInlineCode = /`([^`]+)`/g

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.updateComponentState(value)
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    async afterSetValue(value, oldValue) {
        if (value) {
            let me = this;

            value = me.modifyMarkdown(value);

            // Clean up previous instances
            me.destroyComponents();

            await me.render({code: value})
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    async afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        this.activeComponents.forEach(component => component.windowId = value)
    }

    /**
     * Destroy all created child instances
     * @param {...*} args
     */
    destroy(...args) {
        this.destroyComponents();
        super.destroy(...args)
    }

    /**
     * Destroys all components created by the last render pass.
     */
    destroyComponents() {
        let me = this;

        me.activeComponents.forEach(component => component.destroy());
        me.activeComponents = []
    }

    /**
     * @param {String} inputString
     * @returns {String}
     */
    insertLabDivs(inputString) {
        inputString = inputString.replace(regexLabOpen, '<div class="lab">');
        inputString = inputString.replace(regexLabClose, '</div>');
        return inputString
    }

    /**
     * Modifies the markdown content before rendering.
     * Default implementation parses headlines to add specific classes.
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me            = this,
            rows          = content.split('\n'),
            i             = 0,
            len           = rows.length,
            headlineIndex = 1,
            row, tag;

        for (; i < len; i++) {
            row = rows[i];
            tag = null;

            if (row.startsWith('#') && row.charAt(1) !== '#') {
                row = row.substring(1).trim();
                tag = 'h1'
            } else if (row.startsWith('##') && row.charAt(2) !== '#') {
                row = row.substring(2).trim();
                tag = 'h2'
            } else if (row.startsWith('###') && row.charAt(3) !== '#') {
                row = row.substring(3).trim();
                tag = 'h3'
            }

            if (tag) {
                rows[i] = me.onHeadline(tag, row, headlineIndex);
                headlineIndex++
            }
        }

        return rows.join('\n')
    }

    /**
     * @param {String} tag
     * @param {String} text
     * @param {Number} index
     * @returns {String}
     */
    onHeadline(tag, text, index) {
        text = text.replace(this.constructor.regexInlineCode, '<code>$1</code>');
        return `<${tag} class="neo-${tag}">${text}</${tag}>`
    }

    /**
     * @param {String} contentString
     * @param {Object} map
     * @returns {String}
     */
    processLivePreviewBlocks(contentString, map) {
        return contentString.replace(regexLivePreview, (match, language, code) => {
            const key = IdGenerator.getId('pre-live-preview');
            map[key] = {code, language};
            return `<div id="${key}"></div>`
        })
    }

    /**
     * @param {String} contentString
     * @param {Object} map
     * @returns {String}
     */
    processNeoComponentsBlocks(contentString, map) {
        return contentString.replace(regexNeoComponent, (match, code) => {
            const key = IdGenerator.getId('learn-content-component');
            map[key] = JSON.parse(code);
            return `<div id="${key}"></div>`
        })
    }

    /**
     * @param {String} contentString
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async processReadonlyCodeBlocks(contentString, windowId) {
        let replacementPromises = [],
            count               = 0,
            replacements;

        let updatedContent = contentString.replace(regexReadonly, (match, language, code) => {
            const token = `__NEO-READONLY-TOKEN-${++count}__`;
            replacementPromises.push(
                HighlightJs.highlightAuto(code, windowId)
                    .then(highlightedHtml => ({
                        after: `<pre data-${language} class="hljs" id="pre-readonly-${IdGenerator.getId()}">${highlightedHtml.trim()}</pre>`,
                        token
                    }))
            );
            return token;
        });

        replacements = await Promise.all(replacementPromises);

        replacements.forEach(replacement => {
            updatedContent = updatedContent.replace(replacement.token, replacement.after)
        });

        return updatedContent
    }

    /**
     * Orchestrates the Markdown rendering pipeline.
     *
     * This method implements a **multi-pass compilation strategy** to overcome the limitations of standard Markdown parsers
     * when dealing with dynamic content and asynchronous operations:
     *
     * 1.  **Extraction Pass**: It first scans the raw markdown to extract `neo-component` and `live-preview` blocks. These are
     *     replaced with placeholder DIVs. This prevents the Markdown parser from mangling the JSON/code configurations.
     * 2.  **Highlighting Pass**: It asynchronously processes `readonly` code blocks using HighlightJS. Since `marked.js` is synchronous,
     *     we must handle this pre-processing step to support syntax highlighting.
     * 3.  **Parsing Pass**: The transformed content (with placeholders and highlighted code) is converted to HTML using `marked.parse`.
     * 4.  **Injection Pass**: Finally, it iterates over the extracted component maps (`neoComponents`, `neoDivs`) and instantiates
     *     the actual Neo.mjs components, rendering them into the placeholder DIVs within the generated HTML.
     * @param {Object} data
     * @param {String} data.code
     * @returns {Promise<Object>}
     */
    async render({code}) {
        let me            = this,
            content       = code,
            neoComponents = {},
            neoDivs       = {},
            baseConfigs   = {
                appName        : me.appName,
                autoInitVnode  : true,
                autoMount      : true,
                parentComponent: me.parentComponent,
                windowId       : me.windowId
            },
            html, instance;

        // Initialize maps for custom components and live previews
        neoComponents = {};
        neoDivs       = {};

        // Process custom Neo.mjs component blocks (synchronous)
        content = me.processNeoComponentsBlocks(content, neoComponents);

        // Process custom Live Preview blocks (synchronous)
        content = me.processLivePreviewBlocks(content, neoDivs);

        // Process custom Readonly Code blocks (asynchronous due to HighlightJS)
        // This will replace the markdown fenced block with the highlighted HTML <pre> tag.
        content = await me.processReadonlyCodeBlocks(content, baseConfigs.windowId);

        // Parse the (now modified) markdown content into HTML
        // This content string now contains standard markdown PLUS the HTML divs/pres we injected.
        html = marked.parse(content);

        // Insert lab divs (these are markdown comments, so process on the final HTML)
        await me.set({html: me.insertLabDivs(html)});
        await me.timeout(10);

        if (Object.keys(neoComponents).length > 0) {
            Object.keys(neoComponents).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    className: 'Neo.component.Base',
                    parentId : key,
                    ...neoComponents[key]
                });
                me.activeComponents.push(instance)
            });
        }

        if (Object.keys(neoDivs).length > 0) {
            const LivePreviewModule = await import('../code/LivePreview.mjs');
            const LivePreviewClass  = LivePreviewModule.default;

            Object.keys(neoDivs).forEach(key => {
                const config = {
                    ...baseConfigs,
                    module  : LivePreviewClass,
                    parentId: key,
                    value   : neoDivs[key].code
                }

                if (me.windowUrl) {
                    config.windowUrl = me.windowUrl
                }

                instance = Neo.create(config);
                me.activeComponents.push(instance);
            });
        }

        return {}
    }

    /**
     * Updates the mounted state of all tracked components.
     * @param {Boolean} mounted
     */
    updateComponentState(mounted) {
        this.activeComponents.forEach(component => {
            if (mounted) {
                component.initVnode(true)
            } else {
                component.mounted = false
            }
        })
    }
}

export default Neo.setupClass(Markdown);
