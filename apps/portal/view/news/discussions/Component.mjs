import ContentComponent from '../../content/Component.mjs';
import {marked}         from '../../../../../node_modules/marked/lib/marked.esm.js';

const
    regexComments      = /\n## Comments\s*\n([\s\S]*)$/,
    regexCommentHeader = /^### `@([^`]+)` commented on ([\dTZ:.-]+)$/,
    regexFrontMatter   = /^---\n([\s\S]*?)\n---\n/,
    regexH1            = /(<h1[^>]*>.*?<\/h1>)/,
    regexReplyHeader   = /^#### Reply depth=(\d+) by `?@([^`]+)`? on ([\dTZ:.-]+)$/;

/**
 * @summary The Markdown transformer for GitHub Discussions.
 *
 * Discussion markdown shares the Portal timeline/canvas contract with tickets, but not the ticket grammar:
 * frontmatter carries category + closed state, the body has no issue event timeline, and comments use
 * `### `@user` commented on <timestamp>` headers under `## Comments`. This component keeps that grammar
 * local while publishing `.neo-timeline-item[data-record-id]` nodes and `sections` store records in the
 * same shape consumed by `Portal.view.content.TimelineCanvas`.
 *
 * @class Portal.view.news.discussions.Component
 * @extends Portal.view.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.discussions.Component'
         * @protected
         */
        className: 'Portal.view.news.discussions.Component',
        /**
         * @member {String[]} cls=['portal-news-discussions-component']
         */
        cls: ['portal-news-discussions-component'],
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/',
        /**
         * @member {String} repoUserUrl='https://github.com/'
         */
        repoUserUrl: 'https://github.com/'
    }

    /**
     * @member {Object[]} timelineData=null
     * @private
     */
    timelineData = null

    /**
     * @summary Extends the shared frontmatter parser with the folded block scalars used by Discussion titles.
     * @param {String} text
     * @returns {Object}
     */
    parseFrontMatter(text) {
        let data  = super.parseFrontMatter(text),
            lines = text.split('\n'),
            i     = 0,
            len   = lines.length,
            key, match, rows;

        for (; i < len; i++) {
            match = lines[i].match(/^([\w\d_-]+):\s*([>|][+-]?)\s*$/);

            if (match) {
                key  = match[1];
                rows = [];
                i++;

                while (i < len && !lines[i].match(/^[\w\d_-]+:\s*/)) {
                    rows.push(lines[i].trim());
                    i++
                }

                i--;

                data[key] = match[2].startsWith('|') ? rows.join('\n') : rows.join(' ')
            }
        }

        return data
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

            if (key === 'author') {
                renderedValue = `<a href="${me.repoUserUrl}${value}" target="_blank">${value}</a>`
            } else if (key === 'category') {
                renderedValue = me.getCategoryBadgeHtml(value)
            } else if (key === 'closed') {
                renderedValue = me.getClosedBadgeHtml(value)
            } else if (key === 'createdAt' || key === 'closedAt' || key === 'updatedAt') {
                renderedValue = me.formatTimestamp(value)
            } else {
                renderedValue = me.formatFrontMatterValue(value)
            }

            html += `<tr><td>${key}</td><td>${renderedValue}</td></tr>`
        });

        html += '</tbody></table>';

        if (me.useFrontmatterDetails) {
            return `<details id="neo-discussion-summary-details-${me.id}"><summary>Frontmatter</summary>${html}</details>`
        }

        return html
    }

    /**
     * @param {String} category
     * @returns {String}
     */
    getCategoryBadgeHtml(category) {
        return category ? `<span class="neo-badge neo-discussion-category-badge">${category}</span>` : ''
    }

    /**
     * @param {Boolean|String} closed
     * @returns {String}
     */
    getClosedBadgeHtml(closed) {
        let isClosed = closed === true || closed === 'true',
            cls      = isClosed ? 'neo-state-closed' : 'neo-state-open',
            icon     = isClosed ? 'fa-circle-check' : 'fa-circle-dot',
            text     = isClosed ? 'Closed' : 'Open';

        return `<span class="neo-badge neo-state-badge ${cls}"><i class="fa-regular ${icon}"></i>${text}</span>`
    }

    /**
     * @param {Object} data
     * @returns {String}
     */
    getHeaderBadgesHtml(data) {
        let html = '<div class="neo-ticket-labels neo-discussion-badges">';

        if (data.category) {
            html += this.getCategoryBadgeHtml(data.category)
        }

        if (data.closed !== undefined) {
            html += this.getClosedBadgeHtml(data.closed)
        }

        html += '</div>';

        return html
    }

    /**
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me              = this,
            commentsHtml    = '',
            commentsMatch   = content.match(regexComments),
            frontMatterHtml = '',
            data            = {},
            match           = content.match(regexFrontMatter),
            titleHtml       = '';

        me.timelineData = [];

        if (match) {
            data            = me.parseFrontMatter(match[1]);
            frontMatterHtml = me.frontMatterToHtml(data);
            content         = content.replace(regexFrontMatter, '')
        }

        if (commentsMatch) {
            commentsHtml = me.renderComments(commentsMatch[1]);
            content      = content.replace(regexComments, '')
        }

        let fullHtml = super.modifyMarkdown(content);

        fullHtml = fullHtml.replace(regexH1, (match) => {
            titleHtml = match.replace('<h1', `<h1 id="discussion-title-${me.id}"`);
            return ''
        });

        if (!titleHtml && data.title) {
            titleHtml = `<h1 id="discussion-title-${me.id}">${data.title}</h1>`
        }

        titleHtml += me.getHeaderBadgesHtml(data);

        let bodyId = `timeline-${me.record.id}-0`;

        me.timelineData.unshift({
            id   : bodyId,
            ...me.getAvatarRecordProps(data.author),
            name : 'Description',
            tag  : 'body'
        });

        let bodyItemHtml = [
            `<div id="${bodyId}" class="neo-timeline-item comment body-item" data-record-id="${bodyId}">`,
            `<div id="${bodyId}-target" class="neo-timeline-avatar">`,
            me.getAvatarHtml(data.author),
            '</div>',
            '<div class="neo-timeline-content">',
            '<div class="neo-timeline-header">',
            `<a class="neo-timeline-user" href="${me.repoUserUrl}${data.author}" target="_blank">${data.author}</a>`,
            `<span class="neo-timeline-date">opened on ${me.formatTimestamp(data.createdAt)}</span>`,
            '</div>',
            '<div class="neo-timeline-body">',
            fullHtml,
            '</div>',
            '</div>',
            '</div>'
        ].join('');

        let timelineId    = `discussion-timeline-${me.id}`,
            timelineHtml  = `<div id="${timelineId}" class="neo-ticket-timeline neo-discussion-timeline">` +
                bodyItemHtml + commentsHtml + '</div>';

        me.getStateProvider().getStore('sections').data = me.timelineData;
        me.timelineData = null;

        return frontMatterHtml + titleHtml + timelineHtml
    }

    /**
     * @summary Parses the Discussion `## Comments` body into stable comment entries.
     *
     * The synced Discussion grammar uses backtick-wrapped `@user` headings as the durable entry
     * boundary and `#### Reply depth=N by @user on <timestamp>` headings as lexical children of
     * the preceding top-level comment. Separator rules (`---`) are emitted between comments, but
     * comment and reply bodies can also contain their own headings and horizontal rules, so this
     * method splits only on the full comment/reply headers and trims just the trailing separator.
     * @param {String} content
     * @returns {Object[]} `[{user, date, body, replies: [{depth, user, date, body}]}]`
     */
    parseComments(content) {
        let lines        = content.split('\n'),
            entries      = [],
            current      = null,
            currentReply = null,
            i            = 0,
            len          = lines.length,
            line, match;

        const trimTrailingDelimiter = (rows) => {
            while (rows.length && rows[rows.length - 1].trim() === '') {
                rows.pop()
            }

            if (rows[rows.length - 1]?.trim() === '---') {
                rows.pop()
            }

            while (rows.length && rows[rows.length - 1].trim() === '') {
                rows.pop()
            }
        };

        const flushReply = () => {
            if (!currentReply) return;

            trimTrailingDelimiter(currentReply.bodyLines);

            let body = currentReply.bodyLines.join('\n').trim();

            if (body) {
                current.replies.push({
                    depth: currentReply.depth,
                    user : currentReply.user,
                    date : currentReply.date,
                    body
                })
            }

            currentReply = null
        };

        const flushComment = () => {
            if (!current) return;

            flushReply();
            trimTrailingDelimiter(current.bodyLines);

            let body = current.bodyLines.join('\n').trim();

            if (body || current.replies.length) {
                entries.push({
                    user   : current.user,
                    date   : current.date,
                    body,
                    replies: current.replies
                })
            }

            current = null
        };

        for (; i < len; i++) {
            line  = lines[i];
            match = line.match(regexCommentHeader);

            if (match) {
                flushComment();
                current = {user: match[1], date: match[2], bodyLines: [], replies: []}
            } else if (current) {
                match = line.match(regexReplyHeader);

                if (match) {
                    flushReply();
                    currentReply = {depth: Number(match[1]), user: match[2], date: match[3], bodyLines: []}
                } else if (currentReply) {
                    currentReply.bodyLines.push(line)
                } else {
                    current.bodyLines.push(line)
                }
            }
        }

        flushComment();

        return entries
    }

    /**
     * @param {String} content
     * @returns {String}
     */
    renderComments(content) {
        let me            = this,
            {repoUserUrl} = me,
            html          = '';

        me.parseComments(content).forEach(comment => {
            let id = `timeline-${me.record.id}-${me.timelineData.length + 1}`;

            me.timelineData.push({
                id,
                ...me.getAvatarRecordProps(comment.user),
                name : `Comment (${comment.user})`,
                tag  : 'comment'
            });

            html += [
                `<div id="${id}" class="neo-timeline-item comment" data-record-id="${id}">`,
                `<div id="${id}-target" class="neo-timeline-avatar">`,
                me.getAvatarHtml(comment.user),
                '</div>',
                '<div class="neo-timeline-content">',
                '<div class="neo-timeline-header">',
                `<a class="neo-timeline-user" href="${repoUserUrl}${comment.user}" target="_blank">${comment.user}</a>`,
                `<span class="neo-timeline-date">commented on ${me.formatTimestamp(comment.date)}</span>`,
                '</div>',
                '<div class="neo-timeline-body">',
                me.wrapMarkdownTables(marked.parse(comment.body)),
                me.renderReplies(comment.replies),
                '</div>',
                '</div>',
                '</div>'
            ].join('')
        });

        return html
    }

    /**
     * @summary Renders structured Discussion replies inside the parent comment bubble.
     *
     * Replies intentionally do not add records to `timelineData`: the shared timeline/canvas
     * contract remains top-level comments plus description, while reply identity stays visible
     * as nested DOM inside the owning comment.
     * @param {Object[]} replies
     * @returns {String}
     */
    renderReplies(replies = []) {
        let me            = this,
            {repoUserUrl} = me;

        if (!replies.length) {
            return ''
        }

        return [
            '<div class="neo-discussion-replies">',
            replies.map(reply => [
                `<div class="neo-discussion-reply depth-${reply.depth}">`,
                '<div class="neo-discussion-reply-header">',
                `<a class="neo-timeline-user" href="${repoUserUrl}${reply.user}" target="_blank">${reply.user}</a>`,
                `<span class="neo-timeline-date">replied on ${me.formatTimestamp(reply.date)}</span>`,
                '</div>',
                `<div class="neo-discussion-reply-body">${me.wrapMarkdownTables(marked.parse(reply.body))}</div>`,
                '</div>'
            ].join('')).join(''),
            '</div>'
        ].join('')
    }
}

export default Neo.setupClass(Component);
