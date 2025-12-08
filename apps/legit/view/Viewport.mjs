import BaseViewport       from '../../../src/container/Viewport.mjs';
import Container          from '../../../src/container/Base.mjs';
import LivePreview        from '../../../src/code/LivePreview.mjs';
import TreeList           from '../../../src/tree/List.mjs';
import FileStore          from '../store/Files.mjs';
import Splitter           from '../../../src/component/Splitter.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Legit.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Legit.view.Viewport'
         * @protected
         */
        className: 'Legit.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {String} legitApiKey=null
         */
        legitApiKey: null,
        /*
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module                    : TreeList,
            store                     : FileStore,
            showCollapseExpandAllIcons: false,
            width                     : 300
        }, {
            module      : Splitter,
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items: [{
                module: LivePreview,
                style : {minHeight: '85%', minWidth: '85%'},
                value: [
                    "import Viewport from '../../examples/component/multiWindowHelix/Viewport.mjs';",
                    "",
                    "class MainView extends Viewport {",
                    "    static config = {",
                    "        className           : 'Portal.view.MultiWindowHelix',",
                    "        showGitHubStarButton: false,",
                    "        theme               : 'neo-theme-dark'",
                    "    }",
                    "}",
                    "",
                    "MainView = Neo.setupClass(MainView);"
                ].join('\n'),
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
