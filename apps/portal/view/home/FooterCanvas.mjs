import SharedCanvas from '../shared/Canvas.mjs';

/**
 * @class Portal.view.home.FooterCanvas
 * @extends Portal.view.shared.Canvas
 */
class FooterCanvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.FooterCanvas'
         * @protected
         */
        className: 'Portal.view.home.FooterCanvas',
        /**
         * @member {String[]} cls=['portal-footer-canvas']
         */
        cls: ['portal-footer-canvas'],
        /**
         * @member {String} importMethodName='importFooterCanvas'
         */
        importMethodName: 'importFooterCanvas',
        /**
         * @member {String} rendererClassName='Portal.canvas.FooterCanvas'
         */
        rendererClassName: 'Portal.canvas.FooterCanvas',
        /**
         * @member {Object} style
         */
        style: {
            position: 'absolute',
            top     : 0,
            left    : 0,
            width   : '100%',
            height  : '100%',
            zIndex  : 0
        }
    }
}

export default Neo.setupClass(FooterCanvas);
