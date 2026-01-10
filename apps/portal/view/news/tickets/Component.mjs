import ContentComponent from '../../shared/content/Component.mjs';

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
        className: 'Portal.view.news.tickets.Component'
    }

    /**
     * @param {Object} record
     * @param {String} record.path
     * @returns {String|null}
     */
    getContentPath({path}) {
        return path ? Neo.config.basePath + path : null
    }
}

export default Neo.setupClass(Component);
