import ContentComponent   from '../../../../../src/app/content/Component.mjs';
import {rewriteRepoLinks} from '../../../Util.mjs';

/**
 * @class Portal.view.news.release.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.release.Component'
         * @protected
         */
        className: 'Portal.view.news.release.Component',
        /**
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/'
    }

    /**
     * @summary Resolves a release-note path against the base the notes are served from
     * (`releaseNotesBasePath` in the Portal's `neo-config.json`).
     * @param {Object} record
     * @param {String} record.path
     * @returns {String|null}
     */
    getContentPath({path}) {
        return path ? Neo.config.basePath + Neo.config.releaseNotesBasePath + path : null
    }

    /**
     * @summary Resolves the relative links of a release note against its folder in the repository.
     * @param {String} html
     * @returns {String}
     */
    rewriteLinks(html) {
        let me   = this,
            path = me.getContentPath(me.record);

        html = super.rewriteLinks(html);

        // Less the base path, the fetch path is the file's path in the repository
        return path ? rewriteRepoLinks(html, path.slice(Neo.config.basePath.length), me.windowId) : html
    }
}

export default Neo.setupClass(Component);
