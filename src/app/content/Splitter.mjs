import BaseSplitter from '../../component/Splitter.mjs';
import PageContainer from './PageContainer.mjs';

/**
 * @summary Resizes the visually preceding sidebar in the article-first content layout.
 *
 * The sidebar follows this splitter in DOM order, but CSS places it on the left.
 * @class Neo.app.content.Splitter
 * @extends Neo.component.Splitter
 */
class Splitter extends BaseSplitter {
    static config = {
        /**
         * @member {String} className='Neo.app.content.Splitter'
         * @protected
         */
        className: 'Neo.app.content.Splitter'
    }

    /**
     * @summary Uses the article as the visual neighbor opposite the sidebar.
     * @returns {Neo.app.content.PageContainer|null} The article container.
     * @protected
     */
    getOppositeSibling() {
        return this.parent?.items.find(item => item instanceof PageContainer) || null
    }

    /**
     * @summary Grows the left-hand sidebar when the pointer moves to the right.
     * @returns {Object|null} The resize configuration with its visual direction.
     * @protected
     */
    getResizeConfig() {
        const config = super.getResizeConfig();

        if (config) {
            config.resizeNext = false
        }

        return config
    }
}

export default Neo.setupClass(Splitter);
