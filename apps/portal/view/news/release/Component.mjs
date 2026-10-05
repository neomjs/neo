import ContentComponent from '../../../../../src/app/content/Component.mjs';

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
}

export default Neo.setupClass(Component);
