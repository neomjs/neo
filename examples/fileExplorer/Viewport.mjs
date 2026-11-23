import BaseViewport       from '../../src/container/Viewport.mjs';
import Component          from '../../src/component/Base.mjs';
import Container          from '../../src/container/Base.mjs';
import DetailPane         from './DetailPane.mjs';
import FileStore          from './FileStore.mjs';
import FileTree           from './FileTree.mjs';
import {PROJECT}          from './project.mjs';
import TextField          from '../../src/form/field/Text.mjs';
import ThemeSwitcher      from '../../src/button/ThemeSwitcher.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @summary A file explorer on `Neo.tree.List`: a small web shop's folders and files beside a detail pane. Drag a
 * file onto a folder to move it, rename an entry in place, filter by name, and open `logs`, which loads its 365
 * files the first time it opens.
 * @class Neo.examples.fileExplorer.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.Viewport'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.Viewport',
        /**
         * @member {String[]} cls=['file-explorer-viewport']
         * @reactive
         */
        cls: ['file-explorer-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['fe-header'],
            flex  : 'none',
            layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['fe-title'],
                tag   : 'h1',
                text  : 'storefront'
            }, {
                module: Component,
                cls   : ['fe-hint'],
                flex  : 1,
                text  : 'Drag a file onto a folder to move it, double-click or press F2 to rename, type to filter.'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['fe-body'],
            flex  : 1,
            layout: {ntype: 'flexbox', align: 'stretch', direction: 'row'},

            items: [{
                module: Container,
                cls   : ['fe-sidebar'],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},

                items: [{
                    module         : TextField,
                    clearable      : true,
                    flex           : 'none',
                    hideLabel      : true,
                    listeners      : {change: 'onFilterChange'},
                    placeholderText: 'Filter by name',
                    reference      : 'filter'
                }, {
                    module   : FileTree,
                    flex     : 1,
                    listeners: {itemClick: 'onTreeItemClick', move: 'refreshDetails'},
                    reference: 'tree',
                    store    : {module: FileStore, data: PROJECT}
                }]
            }, {
                module   : DetailPane,
                flex     : 1,
                reference: 'detail'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
