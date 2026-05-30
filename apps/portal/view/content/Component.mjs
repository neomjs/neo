import ContentComponent from '../../../../src/app/content/Component.mjs';

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
