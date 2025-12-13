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
         * @member {String[]} cls=['legit-viewport']
         */
        cls: ['legit-viewport'],
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
            cls                       : ['legit-files-tree'],
            listeners                 : {leafItemClick: 'onFileItemClick', select: 'onTreeListSelect'},
            reference                 : 'files-tree',
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
                    module   : Button,
                    disabled : true,
                    handler  : 'onNewFileButtonClick',
                    iconCls  : 'fa fa-plus',
                    reference: 'new-file-button',
                    text     : 'New File'
                }, {
                    module   : Button,
                    disabled : true,
                    handler  : 'onSaveButtonClick',
                    iconCls  : 'fa fa-cloud-upload',
                    reference: 'save-button',
                    style    : {marginLeft: '.5em'},
                    text     : 'Save'
                }]
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'vbox', align: 'center', pack: 'center'},
                items: [{
                    module   : LivePreview,
                    language : 'markdown',
                    listeners: {editorChange: 'onEditorChange'},
                    reference: 'code-live-preview',
                    style    : {height: '85%', width: '85%'}
                }]
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);