import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class LivePreview.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='LivePreview.MainContainer'
         * @protected
         */
        className: 'LivePreview.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         * @reactive
         */
        layout: {ntype: 'fit'}
    }
}

export default Neo.setupClass(MainContainer);
