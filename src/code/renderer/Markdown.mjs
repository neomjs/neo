import Base          from './Base.mjs';
import HighlightJs   from '../../util/HighlightJs.mjs';
import IdGenerator   from '../../core/IdGenerator.mjs';
import {marked}      from '../../../node_modules/marked/lib/marked.esm.js';

const
    regexLabClose     = /<!--\s*\/lab\s*-->/g,
    regexLabOpen      = /<!--\s*lab\s*-->/g,
    regexLivePreview  = /```(javascript|html|css|json)\s+live-preview\s*\n([\s\S]*?)\n\s*```/g,
    regexNeoComponent = /```json\s+neo-component\s*\n([\s\S]*?)\n\s*```/g,
    regexReadonly     = /```(bash|javascript|html|css|json|scss|xml|markdown|yaml)\s+readonly\s*\n([\s\S]*?)\n\s*```/g;

/**
 * @class Neo.code.renderer.Markdown
 * @extends Neo.code.renderer.Base
 */
class MarkdownRenderer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.code.renderer.Markdown'
         * @protected
         */
        className: 'Neo.code.renderer.Markdown'
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
     * @param {Object} data
     * @param {String} data.code
     * @param {Neo.component.Base} data.container
     * @param {Object} [data.context]
     * @returns {Promise<Object>}
     */
    async render({code, container, context={}}) {
        let me               = this,
            content          = code,
            neoComponents    = {},
            neoDivs          = {},
            customComponents = [],
            livePreviews     = [],
            parentComponent  = context.parentComponent || container,
            baseConfigs      = {
                appName        : context.appName,
                autoInitVnode  : true,
                autoMount      : true,
                parentComponent: parentComponent,
                windowId       : context.windowId || parentComponent.windowId
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
        html = me.insertLabDivs(html);

        container.html = html;

        await new Promise(resolve => setTimeout(resolve, Neo.config.environment === 'development' ? 100 : 150));

        if (Object.keys(neoComponents).length > 0) {
            Object.keys(neoComponents).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    className: 'Neo.component.Base',
                    parentId : key,
                    ...neoComponents[key]
                });
                customComponents.push(instance);
            });
        }

        if (Object.keys(neoDivs).length > 0) {
            const LivePreviewModule = await import('../LivePreview.mjs');
            const LivePreviewClass  = LivePreviewModule.default;

            Object.keys(neoDivs).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    module  : LivePreviewClass,
                    parentId: key,
                    value   : neoDivs[key].code
                });
                livePreviews.push(instance);
            });
        }

        return {customComponents, livePreviews}
    }
}

export default Neo.setupClass(MarkdownRenderer);
