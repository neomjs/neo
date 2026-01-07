import ContentComponent from '../shared/content/Component.mjs';

/**
 * @class Portal.view.learn.Component
 * @extends Portal.view.shared.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.Component'
         * @protected
         */
        className: 'Portal.view.learn.Component'
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
}

export default Neo.setupClass(Component);
