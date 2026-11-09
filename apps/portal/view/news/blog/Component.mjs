import ContentComponent from '../../../../../src/app/content/Component.mjs';

/**
 * @summary Renders Markdown blog posts and routes relative `.md` links to the blog or learn views.
 * @class Portal.view.news.blog.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.blog.Component'
         * @protected
         */
        className: 'Portal.view.news.blog.Component',
        /**
         * @member {String} contentRoute='#/'
         */
        contentRoute: '#/',
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/'
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
     * @summary Routes resolved `learn/blog/` targets to `news/blog/<slug>` and all other `learn/` targets to `learn/`.
     * @param {String} target a relative link target, fragment already stripped
     * @returns {String|null}
     * @protected
     */
    resolveContentId(target) {
        const id = super.resolveContentId(target);

        if (!id) {
            return null
        }

        return id.startsWith('blog/') ? `news/${id}` : `learn/${id}`
    }
}

export default Neo.setupClass(Component);
