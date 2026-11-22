import Markdown from '../../component/Markdown.mjs';
import {marked} from '../../../dist/marked.mjs';

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
         * @member {String[]} contentObserverSelectors=['.neo-h2','.neo-h3']
         * @protected
         */
        contentObserverSelectors: ['.neo-h2', '.neo-h3'],
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
         * Gives the article's section records URL anchors and enables routed section selection.
         * @member {Boolean} routeSections=false
         */
        routeSections: false,
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
     * @member {Number} #contentRequest=0
     * @private
     */
    #contentRequest = 0

    /** @member {Promise|null} #contentRender The current Markdown render. */
    #contentRender = null

    /** @member {Object|null} #renderedRecord The article that has reached the DOM. */
    #renderedRecord = null

    /** @member {Object[]} #renderedSections Section rows awaiting publication with the article. */
    #renderedSections = []

    /** @member {Object|null} #routeSection The route's record and decoded fragment. */
    #routeSection = null

    /** @member {Set|null} #sectionSlugs Slugs assigned during the current Markdown parse. */
    #sectionSlugs = null

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
                    callback: me.routeSections ? 'findActiveContentSection' : 'findTopmostItem',
                    id      : me.id,
                    root    : `#${me.parentId}`,
                    windowId: me.windowId
                })
            })
        }
    }

    /**
     * @summary Loads the selected article and scrolls only while its request remains current.
     * @param {Object} value
     * @param {Object} oldValue
     */
    async afterSetRecord(value, oldValue) {
        const me      = this,
              request = ++me.#contentRequest;

        me.#renderedRecord = null;

        if (value) {
            await me.doFetchContent(value, request);

            if (!me.#isCurrentContentRequest(request)) return;

            if (me.routeSections && value.isLeaf) {
                await me.#contentRender;

                if (!me.#isCurrentContentRequest(request)) return;

                await me.promiseUpdate().catch(error => {
                    if (error !== Neo.isDestroyed) throw error
                });

                if (!me.#isCurrentContentRequest(request)) return;

                me.#renderedRecord = value;

                if (me.updateSectionsStore) {
                    me.getStateProvider().getStore('sections').data = me.#renderedSections
                }

                me.#observeSections();

                me.#applyRouteSection();
                return
            } else if (oldValue) {
                await me.timeout(50).catch(error => {
                    if (error !== Neo.isDestroyed) throw error
                })
            }

            if (oldValue && me.#isCurrentContentRequest(request)) {
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
     * @summary Tracks the Markdown render so route scrolling can wait for its DOM update.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {Promise<void>}
     */
    afterSetValue(value, oldValue) {
        return this.#contentRender = super.afterSetValue(value, oldValue)
    }

    /**
     * @summary Applies the routed fragment or resets the reading position within the current article.
     * @param {Object} record
     * @param {String} [fragment]
     */
    setRouteSection(record, fragment) {
        if (fragment) {
            try {
                fragment = decodeURIComponent(fragment)
            } catch {
                fragment = null
            }
        }

        this.#routeSection = fragment ? {record, fragment} : null;

        if (record && record === this.#renderedRecord) this.#applyRouteSection()
    }

    /**
     * @summary Reveals a matching heading or returns to the start of the rendered article.
     */
    #applyRouteSection() {
        const section  = this.#routeSection,
              sections = this.updateSectionsStore ? this.getStateProvider().getStore('sections') : null,
              record   = section && section.record === this.#renderedRecord
                  ? sections?.find('anchor', section.fragment, true)
                  : null;

        if (record) {
            this.fire('routeSection', {record});
            return
        }

        Neo.main.DomAccess.scrollTo({
            behavior: 'instant',
            id      : this.parentId,
            value   : 0,
            windowId: this.windowId
        });
        this.fire('routeSection', {record: sections?.getAt(0) ?? null, scrollToHeading: false})
    }

    /**
     * @summary Loads the article body and publishes it only for the current content request.
     * @param {Object} record
     * @param {Number} [request] Request already started by the record change
     * @returns {Promise<void>}
     */
    async doFetchContent(record, request=++this.#contentRequest) {
        const me   = this,
              path = me.getContentPath(record);

        if (record.isLeaf && path) {
            const data    = await fetch(path),
                  content = await data.text();

            if (!me.#isCurrentContentRequest(request)) return;

            me.value = content;
            me.toggleCls('lab', record.name?.startsWith('Lab:'));

            if (!me.routeSections) me.#observeSections()
        }
    }

    /** @summary Watches the headings owned by this article. */
    #observeSections() {
        const {id, windowId, contentObserverSelectors} = this;

        Neo.main.addon.IntersectionObserver.observe({
            disconnect: true,
            id,
            observe   : this.routeSections
                ? ['.neo-h1', ...contentObserverSelectors].map(selector => `#${id} ${selector}`)
                : contentObserverSelectors,
            windowId
        })
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        return null
    }

    /**
     * @summary Checks request identity across record changes, including returning to the same record.
     * @param {Number} request
     * @returns {Boolean}
     */
    #isCurrentContentRequest(request) {
        return !this.isDestroyed && request === this.#contentRequest
    }

    /**
     * Updates the sections VM store and replaces ## with h2 tags
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        const {routeSections} = this;

        this.headlineData = [];

        if (routeSections) this.#sectionSlugs = new Set();

        const result = super.modifyMarkdown(content);

        if (this.updateSectionsStore) {
            if (routeSections) {
                this.#renderedSections = this.headlineData
            } else {
                this.getStateProvider().getStore('sections').data = this.headlineData
            }
        }

        this.headlineData = null;

        if (routeSections) this.#sectionSlugs = null;

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
            // Case-insensitive because URI schemes are (RFC 3986 §3.1), and a browser follows
            // `HTTPS://…` exactly like `https://…`. A case-sensitive test rewrote
            // `HTTPS://example.com/docs/Foo.md` into `#/learn/…`, corrupting an absolute URL — and
            // the build guard failed on the same href in the opposite direction, calling a live URL
            // a dead repository path. The rule is pinned against the guard's `EXTERNAL_TARGET` in
            // test/playwright/unit/app/content/LinkPredicateParity.spec.mjs; change both or neither.
            if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href) || !/\.md($|#)/i.test(href)) {
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
     * @summary Creates the rendered heading and its matching contents-panel record.
     * @param {String} tag
     * @param {String} text
     * @param {Number} index
     * @returns {String}
     */
    onHeadline(tag, text, index) {
        // Markdown titles can contain inline code, which we don't want to display inside SectionsList.
        const sideNavTitle = text.replaceAll('`', ''),
              headline     = marked.parseInline(text),
              section      = {id: index, name: sideNavTitle, sourceId: this.id, tag};

        if (this.routeSections) {
            const parser         = new marked.Parser(marked.getDefaults()),
                  {textRenderer} = parser;

            textRenderer.html  = () => '';
            textRenderer.image = () => '';

            const headingText = parser.parseInline(marked.Lexer.lexInline(text), textRenderer),
                  slugParts   = headingText.match(/&(?:#\w+|[a-z][\da-z]*);|[\p{L}\p{M}\p{N}_ -]+/giu) ?? [],
                  slug        = slugParts.filter(part => !part.startsWith('&')).join('').trim().toLowerCase().replaceAll(' ', '-');

            let anchor = slug,
                suffix = 1;

            while (this.#sectionSlugs.has(anchor)) {
                anchor = `${slug}-${suffix++}`
            }

            this.#sectionSlugs.add(anchor);
            section.anchor = anchor
        }

        this.headlineData.push(section);

        return `<${tag} class="neo-${tag}" data-record-id="${index}">${headline}</${tag}>`
    }
}

export default Neo.setupClass(Component);
