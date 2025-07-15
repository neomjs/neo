import Button                       from '../../../src/button/Base.mjs';
import ComposeView                  from './ComposeView.mjs';
import EmailsStore                  from '../store/Emails.mjs';
import GridContainer                from '../../../src/grid/Container.mjs';
import RowModel                     from '../../../src/selection/grid/RowModel.mjs';
import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'Email.view.MainView',
        cls      : ['email-main-view']
    },
    createVdom() {
        const
            [isComposing,   setIsComposing]   = useConfig(false),
            [selectedEmail, setSelectedEmail] = useConfig(null);

        const paneStyle = {
            border : '1px solid #c0c0c0',
            margin : '10px',
            padding: '10px'
        };

        const onComposeClick = () => {
            setIsComposing(true)
        };

        const onCloseCompose = () => {
            setIsComposing(false);
        };

        const onSelectionChange = ({records}) => {
            setSelectedEmail(records[0] || null)
        };

        return {
            cn: [{
                style: {...paneStyle, flex: '0 0 200px'},
                cn: [{
                    module : Button,
                    handler: onComposeClick,
                    id     : 'compose-button',
                    text   : 'Compose',
                    style  : {marginBottom: '10px', width: '100%'}
                }, {
                    text : 'Folders'
                }]
            }, {
                style: {...paneStyle, flex: '1 1 600px', padding: '0'},
                cn: [{
                    module      : GridContainer,
                    id          : 'email-grid',
                    store       : EmailsStore,
                    wrapperStyle: {height: '100%', width: '100%'},
                    body: {
                        selectionModel: {
                            module   : RowModel,
                            listeners: {selectionChange: onSelectionChange}
                        }
                    },
                    columns: [
                        {dataField: 'sender', text: 'Sender', width: 150},
                        {dataField: 'title',  text: 'Title',  flex: 1, minWidth: 200},
                        {
                            cellAlign: 'right',
                            dataField: 'dateSent',
                            renderer : (({value}) => new Date(value).toLocaleDateString()),
                            text     : 'Date',
                            width    : 100
                        }
                    ]
                }]
            }, {
                style: {...paneStyle, flex: '1 1 600px'},
                cn: selectedEmail ? [
                    {tag: 'h2',  text: selectedEmail.title},
                    {tag: 'p',   text: `From: ${selectedEmail.sender}`},
                    {tag: 'div', style: {marginTop: '10px'}, text: selectedEmail.content}
                ] : [{
                    text: 'Select an email to read'
                }]
            }, isComposing && {
                module : ComposeView,
                id     : 'compose-view',
                onClose: onCloseCompose
            }]
        }
    }
});
