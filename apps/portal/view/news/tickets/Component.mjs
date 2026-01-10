import ContentComponent  from '../../shared/content/Component.mjs';

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
            match  = content.match(/^---\n([\s\S]*?)\n---\n/);

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
