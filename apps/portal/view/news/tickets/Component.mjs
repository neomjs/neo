import ContentComponent from '../../shared/content/Component.mjs';
import {marked}         from '../../../../../../node_modules/marked/lib/marked.esm.js';

const
    regexFrontMatter   = /^---\n([\s\S]*?)\n---\n/,
    regexH1            = /(<h1[^>]*>.*?<\/h1>)/,
    regexTicketLink    = /(\d{4,})/,
    regexTimeline      = /## Timeline\s*\n([\s\S]*)/,
    regexTimelineEvent = /^- (\d{4}-\d{2}-\d{2}) @(\w+) (.*)$/,
    regexCommit        = /\b([0-9a-f]{7,40})\b/g;

/**
 * @class Portal.view.news.tickets.Component
 * @extends Portal.view.shared.content.Component
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
         * @member {String} repoUserUrl='https://github.com/'
         */
        repoUserUrl: 'https://github.com/'
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
            return `<details><summary>Frontmatter</summary>${html}</details>`
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
            badgesHtml = '<div class="neo-ticket-labels">',
            store      = me.getStateProvider().getStore('labels'),
            record;

        labels.forEach(label => {
            record = store.get(label);

            if (record) {
                badgesHtml += `<span class="neo-badge" style="background-color:${record.color};color:${record.textColor}">${label}</span>`
            } else {
                badgesHtml += `<span class="neo-badge">${label}</span>`
            }
        });

        badgesHtml += '</div>';

        return badgesHtml
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

        if (match) {
            let data = me.parseFrontMatter(match[1]);

            if (data.author)    {author    = data.author}
            if (data.createdAt) {createdAt = new Date(data.createdAt).toLocaleString()}
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
            titleHtml = match;
            return ''; // Remove title from body
        });

        // 5. Construct Badges
        if (labels.length > 0 || state || (parentId && parentId !== 'Latest')) {
            badgesHtml = '<div class="neo-ticket-labels">';

            if (state) {
                badgesHtml += me.getStateBadgeHtml(state)
            }

            if (parentId && parentId !== 'Latest') {
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
        let bodyItemHtml = `
            <div class="neo-timeline-item comment body-item">
                <div class="neo-timeline-avatar">
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
        if (timelineHtml) {
            timelineHtml = timelineHtml.replace('<div class="neo-ticket-timeline">', '<div class="neo-ticket-timeline">' + bodyItemHtml)
        } else {
            timelineHtml = `<div class="neo-ticket-timeline">${bodyItemHtml}</div>`
        }

        // Return: Frontmatter + Title + Timeline
        return frontMatterHtml + titleHtml + timelineHtml
    }

    /**
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
            line, match, icon, actionCls;

        const flushComment = () => {
            if (commentBuf.length > 0) {
                let body = marked.parse(commentBuf.join('\n'));
                html += `
                    <div class="neo-timeline-item comment">
                        <div class="neo-timeline-avatar">
                            <img src="${repoUserUrl}${currentUser}.png" alt="${currentUser}">
                        </div>
                        <div class="neo-timeline-content">
                            <div class="neo-timeline-header">
                                <a class="neo-timeline-user" href="${repoUserUrl}${currentUser}" target="_blank">${currentUser}</a>
                                <span class="neo-timeline-date">${currentDate}</span>
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

            // Event Line: - YYYY-MM-DD @user action...
            if ((match = line.match(regexTimelineEvent))) {
                flushComment();
                let [_, date, user, action] = match;

                icon      = 'fa-circle-dot'; // Default
                actionCls = '';

                if (action.includes('added the `'))   {icon = 'fa-tag'}
                else if (action.includes('assigned')) {icon = 'fa-user-pen'; }
                else if (action.includes('closed'))   {icon = 'fa-circle-check'; actionCls = 'purple'}
                else if (action.includes('reopened')) {icon = 'fa-circle-dot';   actionCls = 'green'}
                else if (action.includes('referenced') || action.includes('cross-referenced')) { icon = 'fa-link'}
                else if (action.includes('milestoned')){icon = 'fa-sign-post'}
                else if (action.includes('sub-issue')) {icon = 'fa-diagram-project'}

                // Clean up markdown in action text (e.g. `code` to <code>)
                action = marked.parseInline(action);

                // Linkify Commit Hashes
                action = action.replace(regexCommit, `<a href="${commitsUrl}$1" target="_blank">$1</a>`);

                html += `
                    <div class="neo-timeline-item event ${actionCls}">
                        <div class="neo-timeline-badge"><i class="fa-solid ${icon}"></i></div>
                        <div class="neo-timeline-body">
                            <a class="neo-timeline-user" href="${repoUserUrl}${user}" target="_blank">${user}</a> ${action} <span class="neo-timeline-date">on ${date}</span>
                        </div>
                    </div>`;
            }
            // Comment Header: ### @user - Date Time
            else if (line.startsWith('### @')) {
                // Check regex manually since we need to capture
                let headerMatch = line.match(/^### @(\w+) - (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/);
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
