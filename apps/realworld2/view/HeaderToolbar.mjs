import HeaderToolbarController from './HeaderToolbarController.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';

/**
 * @class RealWorld2.view.HeaderToolbar
 * @extends Neo.toolbar.Base
 */
class HeaderToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.HeaderToolbar'
         * @protected
         */
        className: 'RealWorld2.view.HeaderToolbar',
        /**
         * @member {String[]} baseCls=['rw2-header-toolbar','neo-toolbar']
         */
        baseCls: ['rw2-header-toolbar', 'neo-toolbar'],
        /**
         * @member {Neo.controller.Component} controller=HeaderToolbarController
         */
        controller: HeaderToolbarController,
        /**
         * @member {Number} height=56
         */
        height: 56,
        /**
         * @member {Number} minHeight=56
         */
        minHeight: 56,
        /**
         * @member {Array} items
         */
        items: [{
            text   : 'conduit',
            handler: 'onHomeButtonClick'
        }, '->', {
            iconCls: 'fa fa-home',
            text   : 'Home',
            handler: 'onHomeButtonClick'
        }, {
            iconCls: 'fa fa-sign-in-alt',
            text   : 'Login',
            handler: 'onLoginButtonClick'
        }, {
            iconCls: 'fa fa-dna',
            text   : 'Helix',
            handler: 'onHelixButtonClick'
        }, {
            iconCls: 'fa fa-images',
            text   : 'Gallery',
            handler: 'onGalleryButtonClick'
        }, {
            iconCls: 'fa fa-edit',
            text   : 'New Article',
            handler: 'onNewArticleButtonClick'
        }, {
            iconCls: 'fa fa-user-cog',
            text   : 'Settings',
            handler: 'onSettingsButtonClick'
        }, {
            text   : 'Profile',
            handler: 'onProfileButtonClick'
        }]
    }
}

Neo.setupClass(HeaderToolbar);

export default HeaderToolbar;
