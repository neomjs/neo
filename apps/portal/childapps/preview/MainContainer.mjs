import Viewport from '../../../../src/container/Viewport.mjs';

/**
 * @class PortalPreview.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='PortalPreview.MainContainer'
         * @protected
         */
        className: 'PortalPreview.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'}
    }
}

export default Neo.setupClass(MainContainer);
