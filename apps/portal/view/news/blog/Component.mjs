import ContentComponent from '../../../../../src/app/content/Component.mjs';

/**
 * @class Portal.view.news.blog.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.blog.Component'
         * @protected
         */
        className: 'Portal.view.news.blog.Component'
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
