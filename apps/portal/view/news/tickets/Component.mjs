import ContentComponent  from '../../shared/content/Component.mjs';

const
    regexFrontMatter = /^---\n([\s\S]*?)\n---\n/,
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
                    return issue
                        .replace(regexTicketLink, '<a href="#/news/tickets/$1">$1</a>')
                        .replace('[x]', '<i class="fa-solid fa-circle-check"></i>')
                        .replace('[ ]', '<i class="fa-regular fa-circle"></i>')
                }).join('<br>');
            } else if (key === 'author') {
                renderedValue = `<a href="https://github.com/${value}" target="_blank">${value}</a>`;
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
     * @param {Object} record
     * @param {String} record.path
     * @returns {String|null}
     */
    getContentPath({path}) {
        return path ? Neo.config.basePath + path : null
    }

    /**
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me     = this,
            labels = [],
            match  = content.match(regexFrontMatter);

        if (match) {
            let data = me.parseFrontMatter(match[1]);

            if (data.labels) {
                labels = data.labels
            }
        }

        content = super.modifyMarkdown(content);

        if (labels.length > 0) {
            let badgesHtml = '<div class="neo-ticket-labels">',
                store      = me.getStateProvider().getStore('labels'),
                record;

            labels.forEach(label => {
                record = store.get(label);

                if (record) {
                    badgesHtml += `<span class="neo-badge" style="background-color:${record.color};color:${record.textColor}">${label}</span>`
                } else {
                    // Fallback for unknown labels
                    badgesHtml += `<span class="neo-badge">${label}</span>`
                }
            });

            badgesHtml += '</div>';

            content = content.replace(/(<h1[^>]*>.*?<\/h1>)/, '$1' + badgesHtml)
        }

        return content
    }
}

export default Neo.setupClass(Component);
