import Component   from './Base.mjs';
import HighlightJs from '../util/HighlightJs.mjs';
import IdGenerator from '../core/IdGenerator.mjs';
import {marked}    from '../../node_modules/marked/lib/marked.esm.js';

const
    regexFrontMatter  = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/,
    regexLabClose     = /<!--\s*\/lab\s*-->/g,
    regexLabOpen      = /<!--\s*lab\s*-->/g,
    regexLivePreview  = /```(javascript|html|css|json)\s+live-preview\s*\n([\s\S]*?)\n\s*```/g,
    regexMermaid      = /```mermaid\s*\n([\s\S]*?)\n\s*```/g,
    regexNeoComponent = /```json\s+neo-component\s*\n([\s\S]*?)\n\s*```/g,
    regexNewLines     = /^\n+|\n+$/g,
    regexCodeBlock    = /```(\w*)(?:[^\n]*)?\n([\s\S]*?)\n\s*```/g,
    regexTicketId     = /(^|[\s(])#(\d+)\b/g;

/**
 * @summary A specialized component for rendering Markdown content.
 *
 * This component provides a declarative way to display Markdown within a Neo.mjs application.
 * It encapsulates the rendering logic and styling, ensuring consistency across different views.
 *
 * **Key Architectural Features:**
 * - **Reactive Content**: Updates automatically when the `value` config changes.
 * - **Multi-Pass Compilation**: Uses a sophisticated pipeline to extract, process, and re-inject dynamic content (components, live previews).
 * - **Lazy Loading**: Dynamically imports heavy dependencies (like the Mermaid wrapper) only when needed, optimizing initial bundle size.
 * - **Targeted Updates**: efficiently propagates theme changes to embedded components without re-parsing the entire markdown document.
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
         * The base URL for issue tracking. Used when replaceTicketIds is true.
         * @member {String} issuesUrl='https://github.com/neomjs/neo/issues/'
         */
        issuesUrl: 'https://github.com/neomjs/neo/issues/',
        /**
         * True to parse and render YAML frontmatter (metadata) at the top of the content.
         * Useful for displaying file metadata like title, date, or tags.
         * @member {Boolean} renderFrontmatter=true
         */
        renderFrontmatter: true,
        /**
         * True to automatically replace ticket references (e.g. #123) with clickable links.
         * @member {Boolean} replaceTicketIds=false
         */
        replaceTicketIds: false,
        /**
         * True to wrap the rendered frontmatter table in a collapsible <details> tag.
         * This keeps the metadata accessible but unobtrusive, collapsed by default.
         * @member {Boolean} useFrontmatterDetails=true
         */
        useFrontmatterDetails: true,
        /**
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
        /**
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
     * Triggered after the theme config got changed.
     *
     * **Optimization:**
     * Instead of triggering a full re-render (which would re-parse the markdown and destroy/recreate all components),
     * this method performs a **Targeted Component Update**. It iterates over all active embedded components
     * (like LivePreviews or Mermaid diagrams) and updates their `theme` config directly.
     *
     * This ensures smooth transitions and maintains the state of components that support dynamic theming.
     *
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);
        this.activeComponents.forEach(component => component.theme = value)
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
     * Triggered before the value config gets changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {String|null}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        if (value) {
            let lower = value.trim().toLowerCase();

            if (lower.startsWith('<!doctype html>') || lower.startsWith('<html')) {
                console.error('Markdown component received an HTML document instead of markdown content. This usually indicates a 404 or server error.', this.id);
                return oldValue
            }
        }

        return value
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
     * @returns {String}
     */
    insertLabDivs(inputString) {
        inputString = inputString.replace(regexLabOpen, '<div class="lab">');
        inputString = inputString.replace(regexLabClose, '</div>');
        return inputString
    }

    /**
     * @param {*} value
     * @returns {String}
     */
    formatFrontMatterValue(value) {
        if (Array.isArray(value)) {
            return value.join(', ')
        }

        if (typeof value === 'boolean') {
            return `<i class="fa-solid fa-${value ? 'check' : 'xmark'}"></i>`
        }

        if (typeof value === 'string') {
            // ISO Date
            if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
                return new Date(value).toLocaleString()
            }

            // URL
            if (/^https?:\/\//.test(value)) {
                return `<a href="${value}" target="_blank">${value}</a>`
            }
        }

        return value
    }

    /**
     * @param {Object} data
     * @returns {String}
     */
    frontMatterToHtml(data) {
        let me   = this,
            html = '<table class="neo-frontmatter-table"><tbody>';

        Object.entries(data).forEach(([key, value]) => {
            html += `<tr><td>${key}</td><td>${me.formatFrontMatterValue(value)}</td></tr>`
        });

        html += '</tbody></table>';

        if (me.useFrontmatterDetails) {
            return `<details><summary>Frontmatter</summary>${html}</details>`
        }

        return html
    }

    /**
     * Modifies the markdown content before rendering.
     * Default implementation parses headlines to add specific classes.
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me = this;

        if (regexFrontMatter.test(content)) {
            content = content.replace(regexFrontMatter, (match, frontmatter) => {
                if (!me.renderFrontmatter) {
                    return ''
                }

                try {
                    return me.frontMatterToHtml(me.parseFrontMatter(frontmatter)) + '\n'
                } catch (e) {
                    console.error('Error parsing FrontMatter', e);
                    return match
                }
            })
        }

        if (me.replaceTicketIds) {
            content = content.replace(regexTicketId, (match, prefix, id) => {
                const
                    isInternal = me.issuesUrl.startsWith('#'),
                    url        = me.issuesUrl + id,
                    target     = isInternal ? '' : ' target="_blank"';

                return `${prefix}<a href="${url}"${target}>#${id}</a>`
            })
        }

        let rows          = content.split('\n'),
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
                headlineIndex++;

                // If the next line is not empty, add one
                if (rows[i + 1] && rows[i + 1] !== '') {
                    rows.splice(i + 1, 0, '');
                    len++;
                    i++
                }
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
     * @param {String} text
     * @returns {Object}
     */
    parseFrontMatter(text) {
        let data       = {},
            lines      = text.trim().split('\n'),
            currentKey;

        lines.forEach(line => {
            let trimLine = line.trim();

            if (!trimLine || trimLine.startsWith('#')) return; // Skip empty or comments

            // Array item
            if (trimLine.startsWith('- ')) {
                if (currentKey) {
                    if (!Array.isArray(data[currentKey])) {
                        data[currentKey] = []
                    }
                    data[currentKey].push(this.parseValue(trimLine.substring(2)))
                }
                return
            }

            // Key-Value
            let match = trimLine.match(/^([\w\d_-]+):\s*(.*)$/);
            if (match) {
                currentKey       = match[1];
                data[currentKey] = this.parseValue(match[2])
            }
        });

        return data
    }

    /**
     * @param {String} value
     * @returns {Boolean|Number|String|null}
     */
    parseValue(value) {
        value = value.trim();

        if (value === 'true')  return true;
        if (value === 'false') return false;
        if (value === 'null')  return null;

        if (!isNaN(Number(value)) && value !== '') return Number(value);

        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1)
        }

        return value
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
    processMermaidBlocks(contentString, map) {
        return contentString.replace(regexMermaid, (match, code) => {
            const key = IdGenerator.getId('mermaid');
            map[key] = code;
            return `<div class="neo-mermaid" id="${key}"></div>`
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

        let updatedContent = contentString.replace(regexCodeBlock, (match, language, code) => {
            const token = `__NEO-READONLY-TOKEN-${++count}__`;
            const lang  = (!language || language.trim() === '' || language === 'text') ? 'plaintext' : language;

            replacementPromises.push(
                HighlightJs.highlight(code, lang, windowId)
                    .catch(err => {
                        console.warn(`Highlighting failed for language '${lang}', falling back to plaintext.`, err);
                        return HighlightJs.highlight(code, 'plaintext', windowId);
                    })
                    .then(highlightedHtml => ({
                        after: `<pre data-${lang} class="hljs" id="pre-readonly-${IdGenerator.getId()}">${highlightedHtml.replace(regexNewLines, '')}</pre>`,
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
     * 1.  **Extraction Pass**: It first scans the raw markdown to extract `neo-component`, `mermaid`, and `live-preview` blocks.
     *     These are replaced with placeholder DIVs to protect them from the markdown parser.
     * 2.  **Highlighting Pass**: It asynchronously processes `readonly` code blocks using HighlightJS.
     * 3.  **Parsing Pass**: The transformed content is converted to HTML using `marked.parse`.
     * 4.  **Injection Pass**: It iterates over the extracted component maps (`neoComponents`, `neoDivs`, `mermaidDivs`) and instantiates
     *     the actual Neo.mjs components into the placeholders.
     *
     * **Lazy Loading Optimization:**
     * Heavy dependencies like the `Mermaid` wrapper and `LivePreview` editor are imported dynamically via `await import()`
     * only when their respective blocks are detected. This minimizes the initial bundle size.
     *
     * @param {Object} data
     * @param {String} data.code
     * @returns {Promise<Object>}
     */
    async render({code}) {
        let me            = this,
            {windowId}    = me,
            content       = code,
            neoComponents = {},
            neoDivs       = {},
            mermaidDivs   = {},
            baseConfigs   = {
                appName        : me.appName,
                autoInitVnode  : true,
                autoMount      : true,
                parentComponent: me.parentComponent,
                theme          : me.theme,
                windowId
            },
            html, instance;

        // Initialize maps for custom components and live previews
        neoComponents = {};
        neoDivs       = {};

        // Process custom Neo.mjs component blocks (synchronous)
        content = me.processNeoComponentsBlocks(content, neoComponents);

        // Process custom Live Preview blocks (synchronous)
        content = me.processLivePreviewBlocks(content, neoDivs);

        // Process Mermaid blocks (synchronous)
        content = me.processMermaidBlocks(content, mermaidDivs);

        // Process custom Readonly Code blocks (asynchronous due to HighlightJS)
        // This will replace the markdown fenced block with the highlighted HTML <pre> tag.
        content = await me.processReadonlyCodeBlocks(content, baseConfigs.windowId);

        // Parse the (now modified) markdown content into HTML
        // This content string now contains standard markdown PLUS the HTML divs/pres we injected.
        html = marked.parse(content);

        // Wrap raw HTML img tags in a scrollable container
        html = html.replace(/<img([^>]*)>/g, '<div class="neo-markdown-image-wrapper"><img$1></div>');

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

        if (Object.keys(mermaidDivs).length > 0) {
            const MermaidModule = await import('./wrapper/Mermaid.mjs');
            const MermaidClass  = MermaidModule.default;

            Object.keys(mermaidDivs).forEach(key => {
                instance = Neo.create({
                    ...baseConfigs,
                    module  : MermaidClass,
                    parentId: key,
                    theme   : me.theme,
                    value   : mermaidDivs[key]
                });
                me.activeComponents.push(instance)
            })
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
