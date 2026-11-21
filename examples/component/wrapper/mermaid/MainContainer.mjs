import Button                  from '../../../../src/button/Base.mjs';
import Component               from '../../../../src/component/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import {DIAGRAMS}              from './diagrams.mjs';
import MainContainerController from './MainContainerController.mjs';
import Mermaid                 from '../../../../src/component/wrapper/Mermaid.mjs';
import TextArea                from '../../../../src/form/field/TextArea.mjs';
import ThemeSwitcher           from '../../../../src/button/ThemeSwitcher.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @summary A diagram written as text beside the diagram `Neo.component.wrapper.Mermaid` draws from it. Each edit
 * draws it again, the four presets load one diagram of each kind, and the theme switch redraws it in Mermaid's
 * dark theme. Mermaid itself runs in the main thread, through `Neo.main.addon.Mermaid`.
 *
 * @class Neo.examples.component.wrapper.mermaid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.mermaid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.mermaid.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-mermaid']
         */
        cls: ['neo-examples-mermaid'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['neo-examples-mermaid-toolbar'],
            flex  : 'none',
            layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['neo-examples-mermaid-title'],
                text  : 'Diagrams as text'
            }, ...Object.keys(DIAGRAMS).map(name => ({
                module : Button,
                handler: 'onPresetClick',
                text   : name,
                ui     : 'secondary'
            })), '->', {
                module: ThemeSwitcher,
                ui    : 'secondary'
            }]
        }, {
            module: Container,
            cls   : ['neo-examples-mermaid-body'],
            flex  : 1,
            layout: null,

            items: [{
                module   : TextArea,
                hideLabel: true,
                listeners: {change: 'onSourceChange'},
                reference: 'source',
                value    : DIAGRAMS.Flowchart
            }, {
                module   : Mermaid,
                reference: 'diagram',
                value    : DIAGRAMS.Flowchart
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
