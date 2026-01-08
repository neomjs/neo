import ContentComponent from '../../shared/content/Component.mjs';

/**
 * @class Portal.view.news.release.Component
 * @extends Portal.view.shared.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.release.Component'
         * @protected
         */
        className: 'Portal.view.news.release.Component'
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        return record.path ? Neo.config.basePath + record.path.substring(1) : null
    }
}

export default Neo.setupClass(Component);
