import Markdown from '../../component/Markdown.mjs';
import {marked} from '../../../node_modules/marked/lib/marked.esm.js';

/**
 * @summary Displays interactive content (Markdown) within the Portal application.
 * @class Neo.app.content.Component
 * @extends Neo.component.Markdown
 */
class Component extends Markdown {
    static config = {
        /**
         * @member {String} className='Neo.app.content.Component'
         * @protected
         */
        className: 'Neo.app.content.Component',
        /**
         * @member {String[]} baseCls=['neo-app-content-component','neo-markdown-component']
         * @protected
         */
        baseCls: ['neo-app-content-component', 'neo-markdown-component'],
        /**
         * @member {Object} bind
         */
        bind: {
            record: data => data.currentPageRecord
        },
        /**
         * The route prefix a relative Markdown link is rewritten onto, e.g. `'#/learn/'`.
         *
         * Null by default for the same reason issuesUrl is: this generic content base must not bake in
         * an app route. A consuming view declares its own, and while unset no rewriting happens at all.
         * @member {String|null} contentRoute_=null
         * @reactive
         */
        contentRoute_: null,
        // issuesUrl is intentionally NOT defaulted here: this generic content base must not bake in a
        // portal-app route. It inherits Neo.component.Markdown's neutral default
        // (https://github.com/neomjs/neo/issues/); each consuming portal view sets its own cross-link
        // target (e.g. '#/news/tickets/') as a per-content-type config.
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
        tag: 'article',
        /**
         * @member {Boolean} updateSectionsStore=true
         */
        updateSectionsStore: true
    }

    /**
     * @member {Object[]} headlineData=null
     * @private
     */
    headlineData = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            intersect: 'onIntersect',
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
     * Updates the sections VM store and replaces ## with h2 tags
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        this.headlineData = [];
        const result = super.modifyMarkdown(content);

        // Using 'sections' store (generic name)
        if (this.updateSectionsStore) {
            this.getStateProvider().getStore('sections').data = this.headlineData
        }

        this.headlineData = null;
        return result
    }

    /**
     * @summary Resolves a relative Markdown target against the current record into a content id.
     *
     * Record ids are slash-separated and mirror the content tree, so the id doubles as the path the
     * link is relative to: from `agentos/NeuralLink`, `../benefits/ArchitectureOverview.md` resolves to
     * `benefits/ArchitectureOverview`. Written out rather than delegated to `path.posix` because this
     * runs in the App worker, where node builtins are unavailable.
     *
     * @param {String} target a relative link target, fragment already stripped
     * @returns {String|null} null when the target climbs out of the content root
     * @protected
     */
    resolveContentId(target) {
        // The record's own id names a file, so its last segment is a sibling, not a directory.
        const segments = this.record.id.split('/').slice(0, -1);

        let escaped = false;

        target.replace(/\.md$/, '').split('/').forEach(part => {
            if (part === '' || part === '.') {
                return
            }

            if (part !== '..') {
                segments.push(part);
                return
            }

            // A `..` with nothing left to pop leaves the content tree — `../../.github/STORY.md` from a
            // top-level guide is a repository path, not a sibling page. Popping an empty array is
            // silent, so the climb has to be tracked: unnoticed, it yields a plausible-looking id
            // that resolves to nothing.
            segments.length ? segments.pop() : escaped = true
        });

        return escaped ? null : segments.join('/')
    }

    /**
     * @summary Rewrites relative Markdown links onto {@link #contentRoute}, leaving every other href alone.
     *
     * A relative `.md` link is correct as authored — it is what a reader following the file on GitHub
     * needs — but resolved by a browser it is relative to the DOCUMENT url, which in a routed app points
     * outside the app entirely. Translating it here means one authored form serves both readers, instead
     * of the author having to choose which one to break.
     *
     * Only relative `.md` targets are touched. Absolute urls, in-page anchors and root-absolute paths are
     * returned untouched, and so are links to source files: no content route exists for those, and
     * inventing one would turn a visibly broken link into a silently wrong destination.
     *
     * @param {String} html
     * @returns {String}
     */
    rewriteLinks(html) {
        let me             = this,
            {contentRoute} = me;

        if (!contentRoute || !me.record?.id) {
            return html
        }

        // Quote-style agnostic on purpose: this must extract exactly what the build-time guard
        // extracts (`check-relative-links.mjs` HTML_HREF), or one half of the contract validates a
        // link the other half never rewrites. A single-quoted raw-HTML anchor is ordinary authoring
        // — the corpus already contains them — and it would render a href that works in a file tree
        // and 404s in the SPA, which is the exact failure this pair exists to prevent.
        return html.replace(/(<a\b[^>]*\bhref\s*=\s*(["']))([^"']+)\2/gi, (match, prefix, quote, href) => {
            if (/^(https?:|#|\/|mailto:)/.test(href) || !/\.md($|#)/.test(href)) {
                return match
            }

            const [target, fragment] = href.split('#'),
                  id                 = me.resolveContentId(target);

            // A target outside the content root has no id to route to. Leaving the relative href
            // untouched keeps it correct for a file-tree reader and visibly unresolved here, which
            // beats routing it to an id that does not exist.
            if (id === null) {
                return match
            }

            return `${prefix}${contentRoute}${id}${fragment ? `#${fragment}` : ''}${quote}`
        })
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

        const headline = marked.parseInline(text);

        return `<${tag} class="neo-${tag}" data-record-id="${index}">${headline}</${tag}>`
    }
}

export default Neo.setupClass(Component);
