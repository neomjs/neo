import ContentComponent from '../../../../src/app/content/Component.mjs';

// GitHub bot/app actors whose `github.com/<login>.png` avatar 404s — bot avatars live at
// `avatars.githubusercontent.com/in/<app-id>` (not derivable from the login), so these fall back to a
// no-network Font Awesome GitHub glyph instead of a broken image request.
const botActors = new Set(['github-actions', 'dependabot', 'renovate', 'codecov', 'github-advanced-security']);

/**
 * @summary Shared timeline-mode content base for the Portal news views (tickets, pull requests, discussions).
 *
 * Extends the headline-oriented {@link Neo.app.content.Component} and re-targets it for the "Neural Timeline"
 * content types. It supplies the parser-agnostic plumbing every timeline view needs:
 * 1. **Timeline observation**: `doFetchContent` observes `.neo-timeline-item[data-record-id]` (not headlines).
 * 2. **Deferred sections store**: `updateSectionsStore: false` — the per-type parser populates the `sections` store.
 * 3. **Timestamp formatting**, **content-path resolution**, and **resize → canvas re-alignment**.
 *
 * Each content type subclasses this and supplies only its own `modifyMarkdown` / `renderTimeline` parser.
 *
 * @class Portal.view.content.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.content.Component'
         * @protected
         */
        className: 'Portal.view.content.Component',
        /**
         * @member {Object} domListeners
         */
        domListeners: {
            resize: 'onResize'
        },
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/',
        /**
         * @member {Boolean} updateSectionsStore=false
         */
        updateSectionsStore: false
    }

    /**
     * @member {Intl.DateTimeFormat|null} #dateTimeFormatHistory=null
     */
    #dateTimeFormatHistory = null
    /**
     * @member {Intl.DateTimeFormat|null} #dateTimeFormatToday=null
     */
    #dateTimeFormatToday = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.getStateProvider().setData('contentComponentId', this.id)
    }

    /**
     * @summary Resolves the bounded (40px) avatar URL for a GitHub actor.
     *
     * Appends `?size=40` so the 40px timeline avatars fetch GitHub's ~1KB sized image instead of the
     * full-resolution original (~40KB), keeping per-timeline avatar network cost bounded. Shared by every
     * Portal news timeline view (tickets / discussions / pull requests).
     * @param {String} user GitHub login.
     * @returns {String}
     */
    getAvatarUrl(user) {
        return `${this.repoUserUrl}${user}.png?size=40`
    }

    /**
     * @summary True for GitHub bot/app actors whose `github.com/<login>.png` avatar 404s.
     *
     * Single source of truth for the bot/app actor decision, shared by `getAvatarHtml` (timeline HTML)
     * and `getAvatarRecordProps` (summary list), so the bot list is never duplicated in a consumer renderer.
     * @param {String} user GitHub login.
     * @returns {Boolean}
     */
    isBotActor(user) {
        return botActors.has(user) || user.endsWith('[bot]')
    }

    /**
     * @summary Renders a bounded avatar for a timeline actor.
     *
     * Normal users get the sized `<img>`; bot/app actors (whose `github.com/<login>.png` 404s) fall back
     * to a no-network Font Awesome GitHub glyph, so CI/bot comment actors render a stable marker instead
     * of a broken image.
     * @param {String} user GitHub login.
     * @returns {String}
     */
    getAvatarHtml(user) {
        if (this.isBotActor(user)) {
            return `<i class="neo-timeline-avatar-icon fa-brands fa-github" role="img" aria-label="${user}"></i>`
        }

        return `<img src="${this.getAvatarUrl(user)}" alt="${user}" loading="lazy">`
    }

    /**
     * @summary Resolves the avatar fields for a timeline entry record, consumed by both the timeline and
     * the `Neo.app.content.SectionsList` "On this page" summary.
     *
     * Normal users get a bounded `image` URL; bot/app actors get an `iconCls` (Font Awesome GitHub glyph)
     * instead — so the summary list renders the same no-network glyph the timeline does, rather than a
     * broken `<img>` for a 404ing bot avatar. The bot decision stays centralized via `isBotActor`.
     * @param {String} user GitHub login.
     * @returns {Object} `{image}` for normal users, `{iconCls}` for bot/app actors.
     */
    getAvatarRecordProps(user) {
        return this.isBotActor(user) ? {iconCls: 'fa-brands fa-github'} : {image: this.getAvatarUrl(user)}
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
                observe   : ['.neo-timeline-item[data-record-id]'],
                windowId
            })
        }
    }

    /**
     * @param {String} isoString
     * @returns {String}
     */
    formatTimestamp(isoString) {
        if (!isoString) return '';

        let me      = this,
            date    = new Date(isoString),
            now     = new Date(),
            isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            if (!me.#dateTimeFormatToday) {
                me.#dateTimeFormatToday = new Intl.DateTimeFormat('default', {
                    hour  : 'numeric',
                    minute: 'numeric'
                })
            }

            return me.#dateTimeFormatToday.format(date)
        }

        if (!me.#dateTimeFormatHistory) {
            me.#dateTimeFormatHistory = new Intl.DateTimeFormat('default', {
                day   : 'numeric',
                hour  : 'numeric',
                minute: 'numeric',
                month : 'short',
                year  : 'numeric'
            })
        }

        return me.#dateTimeFormatHistory.format(date)
    }

    /**
     * @param {Object} record
     * @param {String} record.path
     * @returns {String|null}
     */
    getContentPath({path}) {
        return path ? Neo.config.basePath + path : null
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        this.fire('toggleSummary')
    }
}

export default Neo.setupClass(Component);
