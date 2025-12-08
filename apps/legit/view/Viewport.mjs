import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import Container             from '../../../src/container/Base.mjs';
import LivePreview           from '../../../src/code/LivePreview.mjs';
import TreeList              from '../../../src/tree/List.mjs';
import Splitter              from '../../../src/component/Splitter.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

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
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /*
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module                    : TreeList,
            bind                      : {store: 'stores.fileStore'},
            listeners                 : {leafItemClick: 'onFileItemClick'},
            showCollapseExpandAllIcons: false,
            width                     : 300,
        }, {
            module      : Splitter,
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items: [{
                module: Toolbar,
                flex  : 'none',
                items :['->', {
                    module : Button,
                    handler: 'onNewFileButtonClick',
                    iconCls: 'fa fa-plus',
                    text   : 'New File'
                }, {
                    module : Button,
                    iconCls: 'fa fa-cloud-upload',
                    style  : {marginLeft: '.5em'},
                    text   : 'Save'
                }]
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'vbox', align: 'center', pack: 'center'},
                items: [{
                    module: LivePreview,
                    listeners: {editorChange: 'onEditorChange'},
                    style : {height: '85%', width: '85%'},
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
                    ].join('\n')
                }]
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
