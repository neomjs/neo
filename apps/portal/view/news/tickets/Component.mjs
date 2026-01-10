import ContentComponent  from '../../shared/content/Component.mjs';

const
    regexFrontMatter = /^---\n([\s\S]*?)\n---\n/,
    regexH1          = /(<h1[^>]*>.*?<\/h1>)/,
    regexTicketLink  = /(\d{4,})/;

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
        cls: ['portal-news-tickets-component']
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
                }).join('');
            } else if (key === 'author') {
                renderedValue = `<a href="https://github.com/${value}" target="_blank">${value}</a>`;
            } else if (key === 'labels' && Array.isArray(value)) {
                renderedValue = me.getBadgesHtml(value);
            } else if (key === 'state') {
                renderedValue = me.getStateBadgeHtml(value);
            } else {
                renderedValue = me.formatFrontMatterValue(value);
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
            icon  = 'fa-circle-check';
        } else {
            cls += ' neo-state-open';
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
            labels       = [],
            state        = null,
            match        = content.match(regexFrontMatter);

        if (match) {
            let data = me.parseFrontMatter(match[1]);

            if (data.labels) {
                labels = data.labels
            }

            if (data.state) {
                state = data.state
            }
        }

        content = super.modifyMarkdown(content);

        if (labels.length > 0 || state || (parentId && parentId !== 'Latest')) {
            let badgesHtml = '<div class="neo-ticket-labels">';

            if (state) {
                badgesHtml += me.getStateBadgeHtml(state)
            }

            if (parentId && parentId !== 'Latest') {
                badgesHtml += `<a class="neo-badge neo-release-badge" href="#/news/releases/${parentId.substring(1)}">
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

            content = content.replace(regexH1, '$1' + badgesHtml)
        }

        return content
    }
}

export default Neo.setupClass(Component);
