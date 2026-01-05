import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import CommitGrid            from './CommitGrid.mjs';
import Container             from '../../../src/container/Base.mjs';
import LivePreview           from '../../../src/code/LivePreview.mjs';
import Panel                 from '../../../src/container/Panel.mjs';
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
         * @reactive
         */
        cls: ['legit-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         * @reactive
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
            size        : 5
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items: [{
                module: Toolbar,
                flex  : 'none',
                style : {marginRight: '15px'},
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
                module   : LivePreview,
                flex     : 3,
                language : 'markdown',
                listeners: {editorChange: 'onEditorChange'},
                reference: 'code-live-preview',
                style : {margin: '20px'}
            }, {
                module      : Splitter,
                direction   : 'horizontal',
                resizeTarget: 'previous',
                size        : 5
            }, {
                module: Panel,
                cls   : ['legit-commit-grid-panel'],
                flex  : 1,
                style : {margin: '20px'},
                headers: [{
                    dock: 'top',
                    text: 'Legit History'
                }],
                items : [{
                    module      : CommitGrid,
                    wrapperStyle: {minHeight: '200px'}
                }]
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
