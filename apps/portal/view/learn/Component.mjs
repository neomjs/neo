import ContentComponent   from '../../../../src/app/content/Component.mjs';
import {rewriteRepoLinks} from '../../Util.mjs';

/**
 * @class Portal.view.learn.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.Component'
         * @protected
         */
        className: 'Portal.view.learn.Component',
        /**
         * Relative Markdown links inside a guide are rewritten onto the learn route, so the same
         * authored link works for a GitHub reader and inside the app.
         * @member {String} contentRoute='#/learn/'
         */
        contentRoute: '#/learn/',
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/'
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        let path        = this.getStateProvider().getData('contentPath'),
            pagesFolder = path.includes('/learn/') ? '' : 'pages/';

        return path + `${pagesFolder + record.id.replaceAll('.', '/')}.md`
    }

    /**
     * @summary Resolves the relative links the learn route leaves alone against the guide's folder in the
     * repository, so a link to a source file opens it on GitHub.
     * @param {String} html
     * @returns {String}
     */
    rewriteLinks(html) {
        let me   = this,
            path = me.getContentPath(me.record);

        // Less the base path, the fetch path is the file's path in the repository
        return rewriteRepoLinks(super.rewriteLinks(html), path.slice(Neo.config.basePath.length))
    }
}

export default Neo.setupClass(Component);
