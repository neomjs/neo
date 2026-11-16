import BaseViewport          from '../../../src/container/Viewport.mjs';
import Desktop               from './Desktop.mjs';
import SignIn                from './SignIn.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @summary The wallpaper and the root: the sign-in screen while nobody is signed in, the desktop afterwards.
 * @class WebDesktop.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Viewport'
         * @protected
         */
        className: 'WebDesktop.view.Viewport',
        /**
         * @member {String[]} cls=['webdesktop-viewport']
         */
        cls: ['webdesktop-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: SignIn,
            bind  : {hidden: data => Boolean(data.account)},
            flex  : 1
        }, {
            module: Desktop,
            bind  : {hidden: data => !data.account},
            flex  : 1
        }]
    }
}

export default Neo.setupClass(Viewport);
