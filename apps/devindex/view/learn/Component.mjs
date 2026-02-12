import ContentComponent from '../../../../src/app/content/Component.mjs';

/**
 * @class DevIndex.view.learn.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='DevIndex.view.learn.Component'
         * @protected
         */
        className: 'DevIndex.view.learn.Component'
    }

    /**
     * @param {Object} record
     * @returns {String|null}
     */
    getContentPath(record) {
        let path = this.getStateProvider().getData('contentPath');
        return path + `${record.id}.md`
    }
}

export default Neo.setupClass(Component);
