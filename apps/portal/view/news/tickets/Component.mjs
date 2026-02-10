import ContentComponent from '../../../../../src/app/content/Component.mjs';
import {marked}         from '../../../../../node_modules/marked/lib/marked.esm.js';

const
    regexFrontMatter   = /^---\n([\s\S]*?)\n---\n/,
    regexH1            = /(<h1[^>]*>.*?<\/h1>)/,
    regexTicketLink    = /(\d{4,})/,
    regexTimeline      = /## Timeline\s*\n([\s\S]*)/,
    regexTimelineEvent = /^- ([\dTZ:.-]+) @(\w+) (.*)$/,
    regexCommit        = /\b([0-9a-f]{7,40})\b/g;

/**
 * @summary The "Markdown Transformer" for GitHub Tickets.
 *
 * This component extends the standard ContentComponent to provide specialized rendering for GitHub Issues.
 * Its primary responsibility is to parse the raw Markdown content (which includes custom Frontmatter and
 * a pre-generated Timeline section) and transform it into a rich, interactive HTML structure.
 *
 * **Key Responsibilities:**
 * 1. **Parsing Pipeline**: Extracts Frontmatter, Body, and the custom "Timeline" section from the raw Markdown.
 * 2. **Rich Rendering**: Generates HTML for Status Badges, Labels, Commit Links, and User Mentions.
 * 3. **Data Extraction**: As a side effect of rendering, it extracts structured data (`me.timelineData`)
 *    representing every timeline event (comment, label change, close, etc.). This data is then
 *    pushed to the `sections` store to drive the `TimelineCanvas` visualization.
 *
 * @class Portal.view.news.tickets.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.Component'
         * @protected
         */
        className: 'Portal.view.news.tickets.Component',
        /**
         * @member {String[]} cls=['portal-news-tickets-component']
         */
        cls: ['portal-news-tickets-component'],
        /**
         * @member {String} commitsUrl='https://github.com/neomjs/neo/commit/'
         */
        commitsUrl: 'https://github.com/neomjs/neo/commit/',
        /**
         * @member {Object} domListeners
         */
        domListeners: {
            resize: 'onResize'
        },
        /**
         * @member {String} repoUserUrl='https://github.com/'
         */
        repoUserUrl: 'https://github.com/',
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
     * Temporary storage for the structured timeline data extracted during the parsing phase.
     * This array is populated by `renderTimeline` and `modifyMarkdown` and then assigned
     * to the `sections` store to drive the Canvas visualization.
     * @member {Object[]} timelineData=null
     * @private
     */
    timelineData = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.getStateProvider().setData('contentComponentId', this.id)
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
     * @param {Object} data
     * @returns {String}
     */
    frontMatterToHtml(data) {
        let me   = this,
            html = '<table class="neo-frontmatter-table"><tbody>';

        Object.entries(data).forEach(([key, value]) => {
            let renderedValue;

            if (key === 'subIssues' && Array.isArray(value)) {
                renderedValue = value.map(issue => {
                    return `<div class="neo-sub-issue">${issue
                        .replace(regexTicketLink, '<a href="#/news/tickets/$1">$1</a>')
                        .replace('[x]', '<i class="fa-solid fa-circle-check"></i>')
                        .replace('[ ]', '<i class="fa-regular fa-circle"></i>')}</div>`
                }).join('')
            } else if (key === 'author') {
                renderedValue = `<a href="${me.repoUserUrl}${value}" target="_blank">${value}</a>`
            } else if (key === 'createdAt' || key === 'closedAt' || key === 'updatedAt') {
                renderedValue = me.formatTimestamp(value)
            } else if (key === 'labels' && Array.isArray(value)) {
                renderedValue = me.getBadgesHtml(value)
            } else if (key === 'state') {
                renderedValue = me.getStateBadgeHtml(value)
            } else {
                renderedValue = me.formatFrontMatterValue(value)
            }

            html += `<tr><td>${key}</td><td>${renderedValue}</td></tr>`
        });

        html += '</tbody></table>';

        if (me.useFrontmatterDetails) {
            return `<details id="neo-ticket-summary-details-${me.id}"><summary>Frontmatter</summary>${html}</details>`
        }

        return html
    }

    /**
     * @param {String[]} labels
     * @returns {String}
     */
    getBadgesHtml(labels) {
        if (!labels || labels.length === 0) return '';

        let me         = this,
            badgesHtml = '<div class="neo-ticket-labels">';

        labels.forEach(label => {
            badgesHtml += me.getLabelBadgeHtml(label)
        });

        badgesHtml += '</div>';

        return badgesHtml
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
     * @param {Object} record
     * @param {String} record.path
     * @returns {String|null}
     */
    getContentPath({path}) {
        return path ? Neo.config.basePath + path : null
    }

    /**
     * @param {String} label
     * @returns {String}
     */
    getLabelBadgeHtml(label) {
        let store  = this.getStateProvider().getStore('labels'),
            record = store.get(label);

        if (record) {
            return `<span class="neo-badge" style="background-color:${record.color};color:${record.textColor}">${label}</span>`
        }

        return `<span class="neo-badge">${label}</span>`
    }

    /**
     * @param {String} state
     * @returns {String}
     */
    getStateBadgeHtml(state) {
        if (!state) return '';

        let cls  = 'neo-badge neo-state-badge',
            icon = 'fa-circle-dot';

        if (state.toUpperCase() === 'CLOSED') {
            cls  += ' neo-state-closed';
            icon  = 'fa-circle-check'
        } else {
            cls += ' neo-state-open'
        }

        return `<span class="${cls}"><i class="fa-regular ${icon}"></i>${Neo.capitalize(state.toLowerCase())}</span>`
    }

    /**
     * The Main Parsing Pipeline.
     *
     * This method intercepts the raw markdown content before it is rendered and performs a multi-pass transformation:
     * 1. **Extract Timeline**: Pulls out the raw `## Timeline` section to process it separately.
     * 2. **Process Frontmatter**: Extracts metadata (labels, state, author) and removes the YAML block.
     * 3. **Render Body**: Uses the superclass (marked.js) to convert the main issue body to HTML.
     * 4. **Inject Title IDs**: Adds IDs to H1 tags for navigation.
     * 5. **Generate Badges**: Creates HTML for Status/Label badges based on extracted metadata.
     * 6. **Wrap Body**: Wraps the main issue body in a `timeline-item` structure so it appears as the first item.
     * 7. **Re-Assemble**: Concatenates Frontmatter + Title + Timeline (with Body injected) into the final HTML.
     *
     * **Side Effect**: Populates `me.timelineData` and updates the `sections` store.
     *
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me           = this,
            {parentId}   = me.record,
            author       = null,
            createdAt    = null,
            labels       = [],
            state        = null,
            match        = content.match(regexFrontMatter),
            timelineHtml = '',
            badgesHtml   = '';

        me.timelineData = [];

        if (match) {
            let data = me.parseFrontMatter(match[1]);

            if (data.author)    {author    = data.author}
            if (data.createdAt) {createdAt = me.formatTimestamp(data.createdAt)}
            if (data.labels)    {labels    = data.labels}
            if (data.state)     {state     = data.state}
        }

        // 1. Extract and process timeline from RAW markdown
        let timelineMatch = content.match(regexTimeline);
        if (timelineMatch) {
            timelineHtml = me.renderTimeline(timelineMatch[1]);
            content      = content.replace(regexTimeline, ''); // Remove raw timeline
        }

        // 2. Render Frontmatter Manually & Strip it
        // We want it at the very top, outside the body bubble.
        let frontMatterHtml = '';
        if (match) {
            let data        = me.parseFrontMatter(match[1]);
            frontMatterHtml = me.frontMatterToHtml(data);
            content         = content.replace(regexFrontMatter, '');
        }

        // 3. Convert Body + Title to HTML using super
        let fullHtml = super.modifyMarkdown(content);

        // 4. Extract H1 Title from the generated HTML
        let titleHtml = '';
        fullHtml      = fullHtml.replace(regexH1, (match) => {
            // Inject ID into H1 tag
            titleHtml = match.replace('<h1', `<h1 id="ticket-title-${me.id}"`);
            return ''; // Remove title from body
        });

        // 5. Construct Badges
        if (labels.length > 0 || state || (parentId && parentId !== 'Backlog')) {
            badgesHtml = '<div class="neo-ticket-labels">';

            if (state) {
                badgesHtml += me.getStateBadgeHtml(state)
            }

            if (parentId && parentId !== 'Backlog') {
                badgesHtml += `
                    <a class="neo-badge neo-release-badge" href="#/news/releases/${parentId.substring(1)}">
                        <i class="fa-solid fa-code-branch"></i> ${parentId}
                    </a>`
            }

            if (labels.length > 0) {
                let store = me.getStateProvider().getStore('labels'),
                    record;

                labels.forEach(label => {
                    record = store.get(label);

                    if (record) {
                        badgesHtml += `<span class="neo-badge" style="background-color:${record.color};color:${record.textColor}">${label}</span>`
                    } else {
                        badgesHtml += `<span class="neo-badge">${label}</span>`
                    }
                });
            }

            badgesHtml += '</div>';
            titleHtml  += badgesHtml;
        }

        // 6. Wrap the remaining HTML (Body) in the Timeline Item structure
        let bodyId = `timeline-${me.record.id}-0`;

        me.timelineData.unshift({
            id   : bodyId,
            image: me.repoUserUrl + author + '.png',
            name : 'Description',
            tag  : 'body'
        });

        let bodyItemHtml = `
            <div id="${bodyId}" class="neo-timeline-item comment body-item" data-record-id="${bodyId}">
                <div id="${bodyId}-target" class="neo-timeline-avatar">
                    <img src="${me.repoUserUrl}${author}.png" alt="${author}">
                </div>
                <div class="neo-timeline-content">
                    <div class="neo-timeline-header">
                        <a class="neo-timeline-user" href="${me.repoUserUrl}${author}" target="_blank">${author}</a>
                        <span class="neo-timeline-date">commented on ${createdAt}</span>
                    </div>
                    <div class="neo-timeline-body">${fullHtml}</div>
                </div>
            </div>`;

        // 7. Inject Body Item at the start of the Timeline
        let timelineId = `ticket-timeline-${me.id}`;

        if (timelineHtml) {
            timelineHtml = timelineHtml.replace(
                '<div class="neo-ticket-timeline">',
                `<div id="${timelineId}" class="neo-ticket-timeline">` + bodyItemHtml
            )
        } else {
            timelineHtml = `<div id="${timelineId}" class="neo-ticket-timeline">${bodyItemHtml}</div>`
        }

        me.getStateProvider().getStore('sections').data = me.timelineData;
        me.timelineData = null;

        // Return: Frontmatter + Title + Timeline
        return frontMatterHtml + titleHtml + timelineHtml
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        this.fire('toggleSummary')
    }

    /**
     * Parses the custom "Timeline" markdown section.
     *
     * Expects a line-based format generated by the build process:
     * - Events: `- YYYY-MM-DDTHH:mm:ss @user action text...`
     * - Comments: `### @user - YYYY-MM-DDTHH:mm:ss` followed by comment body.
     *
     * This method converts these lines into structured `timeline-item` HTML blocks
     * and simultaneously populates `me.timelineData` with semantic data (color, icon, type)
     * for each event.
     *
     * @param {String} content
     * @returns {String}
     */
    renderTimeline(content) {
        let me          = this,
            {commitsUrl, repoUserUrl} = me,
            html        = '<div class="neo-ticket-timeline">',
            lines       = content.split('\n'),
            commentBuf  = [],
            currentUser = null,
            currentDate = null,
            i           = 0,
            len         = lines.length,
            id, line, match, icon, actionCls;

        const flushComment = () => {
            if (commentBuf.length > 0) {
                id = `timeline-${me.record.id}-${me.timelineData.length + 1}`;

                me.timelineData.push({
                    id   : id,
                    image: repoUserUrl + currentUser + '.png',
                    name : `Comment (${currentUser})`,
                    tag  : 'comment'
                });

                let body = marked.parse(commentBuf.join('\n'));
                html += `
                    <div id="${id}" class="neo-timeline-item comment" data-record-id="${id}">
                        <div id="${id}-target" class="neo-timeline-avatar">
                            <img src="${repoUserUrl}${currentUser}.png" alt="${currentUser}">
                        </div>
                        <div class="neo-timeline-content">
                            <div class="neo-timeline-header">
                                <a class="neo-timeline-user" href="${repoUserUrl}${currentUser}" target="_blank">${currentUser}</a>
                                <span class="neo-timeline-date">${me.formatTimestamp(currentDate)}</span>
                            </div>
                            <div class="neo-timeline-body">${body}</div>
                        </div>
                    </div>`;
                commentBuf  = [];
                currentUser = null;
                currentDate = null
            }
        };

        for (; i < len; i++) {
            line = lines[i];

            // Event Line: - 2026-01-11T... @user action...
            if ((match = line.match(regexTimelineEvent))) {
                flushComment();
                let [_, date, user, action] = match;

                icon      = 'fa-circle-dot'; // Default
                actionCls = '';

                const eventType = [
                    {key: 'added the `',      icon: 'fa-tag'},
                    {key: 'removed the `',    icon: 'fa-tag'},
                    {key: 'assigned',         icon: 'fa-user-pen'},
                    {key: 'closed',           icon: 'fa-circle-check', color: '#8250df'}, // GitHub Purple
                    {key: 'reopened',         icon: 'fa-circle-dot',   color: '#2da44e'}, // GitHub Green
                    {key: 'referenced',       icon: 'fa-link'},
                    {key: 'cross-referenced', icon: 'fa-link'},
                    {key: 'milestoned',       icon: 'fa-sign-post'},
                    {key: 'sub-issue',        icon: 'fa-diagram-project'}
                ].find(e => action.includes(e.key));

                let color = null;

                if (eventType) {
                    icon = eventType.icon;
                    if (eventType.color) color = eventType.color
                }

                // Clean up markdown in action text (e.g. `code` to <code>)
                let cleanAction = marked.parseInline(action);

                if (icon === 'fa-tag') {
                    cleanAction = cleanAction.replace(/<code>(.*?)<\/code>/g, (match, label) => me.getLabelBadgeHtml(label));

                    // Try to resolve color from label
                    let labelMatch = action.match(/`([^`]+)`/);
                    if (labelMatch) {
                        let labelName = labelMatch[1];
                        let labelRec  = me.getStateProvider().getStore('labels').get(labelName);
                        if (labelRec) {
                            color = labelRec.color;
                        }
                    }
                }

                // Linkify Commit Hashes
                cleanAction = cleanAction.replace(regexCommit, `<a href="${commitsUrl}$1" target="_blank">$1</a>`);

                id = `timeline-${me.record.id}-${me.timelineData.length + 1}`;

                // Extract a short action name for the list
                let shortAction = action.split(' ')[0]; // 'added', 'closed', etc.
                let entryName;

                if (shortAction === 'added' || shortAction === 'removed') {
                    if (action.includes('sub-issue')) {
                        let subIssueMatch = action.match(/#(\d+)/);
                        if (subIssueMatch) {
                            entryName = `${Neo.capitalize(shortAction)} sub-issue #${subIssueMatch[1]}`
                        } else {
                            entryName = `${Neo.capitalize(shortAction)} sub-issue`
                        }
                    } else {
                        let labelMatch = action.match(/`([^`]+)`/);
                        shortAction = labelMatch ? labelMatch[1] : 'Label';
                        entryName = `${Neo.capitalize(shortAction)} (${user})`
                    }
                } else {
                    entryName = `${Neo.capitalize(shortAction)} (${user})`
                }

                me.timelineData.push({
                    color: color, // Pass resolved hex color
                    icon : icon,
                    id   : id,
                    name : entryName,
                    tag  : 'event'
                });

                // Apply color style if present, otherwise default
                let style = color ? `style="color: ${color}"` : '';

                html += `
                    <div id="${id}" class="neo-timeline-item event" data-record-id="${id}">
                        <div id="${id}-target" class="neo-timeline-badge" ${style}><i class="fa-solid ${icon}"></i></div>
                        <div class="neo-timeline-body">
                            <a class="neo-timeline-user" href="${repoUserUrl}${user}" target="_blank">${user}</a> ${cleanAction} <span class="neo-timeline-date">on ${me.formatTimestamp(date)}</span>
                        </div>
                    </div>`;
            }
            // Comment Header: ### @user - 2026-01-11T...
            else if (line.startsWith('### @')) {
                // Captures "user" and "2026-01-11T..." (ISO timestamp)
                let headerMatch = line.match(/^### @(\w+) - ([\dTZ:.-]+)$/);
                if (headerMatch) {
                    flushComment();
                    currentUser = headerMatch[1];
                    currentDate = headerMatch[2]
                } else {
                    // Fallback for weird headers? treat as text
                    if (currentUser) commentBuf.push(line)
                }
            }
            else {
                if (currentUser) {
                    commentBuf.push(line)
                }
            }
        }

        flushComment(); // Flush last comment

        html += '</div>';
        return html
    }
}

export default Neo.setupClass(Component);
