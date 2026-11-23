import ContentComponent   from '../../../../../src/app/content/Component.mjs';
import {rewriteRepoLinks} from '../../../Util.mjs';

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

    /**
     * @summary Resolves the relative links the blog and learn routes leave alone against the post's folder in
     * the repository, so a link to a source file opens it on GitHub.
     * @param {String} html
     * @returns {String}
     */
    rewriteLinks(html) {
        let me   = this,
            path = me.getContentPath(me.record);

        html = super.rewriteLinks(html);

        // Less the base path, the fetch path is the file's path in the repository
        return path ? rewriteRepoLinks(html, path.slice(Neo.config.basePath.length)) : html
    }
}

export default Neo.setupClass(Component);
