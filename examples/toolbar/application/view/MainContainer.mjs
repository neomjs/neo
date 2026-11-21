import Container               from '../../../../src/container/Base.mjs';
import Label                   from '../../../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import TextArea                from '../../../../src/form/field/TextArea.mjs';
import ThemeSwitcher           from '../../../../src/button/ThemeSwitcher.mjs';
import Toolbar                 from '../../../../src/toolbar/Base.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @summary A release notes editor whose toolbar items are loaded from JSON.
 * @class Neo.examples.toolbar.application.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.application.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.application.view.MainContainer',
        /**
         * @member {String[]} cls=['neo-toolbar-application']
         */
        cls: ['neo-toolbar-application'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-toolbar-application-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Label,
                flex  : 1,
                text  : 'Release notes'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module   : Toolbar,
            cls      : ['neo-toolbar-application-actions'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '8px'},
            reference: 'actions'
        }, {
            module       : TextArea,
            cls          : ['neo-toolbar-application-draft'],
            flex         : 'none',
            labelPosition: 'top',
            labelText    : 'Draft',
            reference    : 'draft',
            rows         : 6,
            value        : '# Engine release\n\n- Verify the published examples.'
        }, {
            module   : Label,
            cls      : ['neo-toolbar-application-status'],
            flex     : 'none',
            reference: 'status',
            role     : 'status',
            text     : 'Loading toolbar…'
        }]
    }

    /**
     * @summary Loads the toolbar once its component and controller exist.
     */
    onConstructed() {
        super.onConstructed();

        this.getController().loadToolbar()
    }
}

export default Neo.setupClass(MainContainer);
