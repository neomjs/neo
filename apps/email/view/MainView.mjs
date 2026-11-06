import Button            from '../../../src/button/Base.mjs';
import GridContainer     from '../../../src/grid/Container.mjs';
import RowModel          from '../../../src/selection/grid/RowModel.mjs';
import {defineComponent} from '../../../src/functional/_export.mjs';

/**
 * @summary Functional inbox and folder navigation; the workspace owns the Store and movable views.
 * @class Email.view.MainView
 * @extends Neo.functional.component.Base
 */
export default defineComponent({
    config: {
        className: 'Email.view.MainView',
        cls      : ['email-main-view']
    },

    /**
     * @summary Keeps the buffered grid stable while selection updates the separate detail provider.
     * @returns {Object}
     */
    createVdom() {
        return {
            cn: [{
                cls: ['email-navigation'],
                cn : [{
                    module   : Button,
                    reference: 'composeButton',
                    text     : 'Compose'
                }, {
                    tag : 'h2',
                    text: 'Inbox'
                }, {
                    tag : 'p',
                    text: '250 demo messages'
                }]
            }, {
                cls: ['email-inbox'],
                cn : [{
                    module      : GridContainer,
                    bind        : {store: 'stores.emails'},
                    reference   : 'inbox',
                    wrapperStyle: {height: '100%', width: '100%'},
                    viewConfig  : {selectionModel: {module: RowModel}},
                    columns     : [
                        {dataField: 'sender', text: 'Sender', width: 160},
                        {dataField: 'title', text: 'Subject', flex: 1, minWidth: 180},
                        {dataField: 'dateSent', text: 'Date', width: 110}
                    ]
                }]
            }]
        }
    }
});
