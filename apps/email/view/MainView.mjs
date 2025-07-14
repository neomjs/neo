import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';
import GridContainer                from '../../../src/grid/Container.mjs';
import EmailsStore                  from '../store/Emails.mjs';
import RowModel                     from '../../../src/selection/grid/RowModel.mjs';

export default defineComponent({
    config: {
        className: 'Email.view.MainView',
        cls      : ['email-mainview']
    },
    createVdom() {
        const [selectedEmail, setSelectedEmail] = useConfig(null);

        const paneStyle = {
            border : '1px solid #c0c0c0',
            margin : '10px',
            padding: '10px'
        };

        const onSelectionChange = ({records}) => {
            setSelectedEmail(records[0] || null);
        };

        return {
            cn: [{
                style: {...paneStyle, flex: '0 0 200px'},
                text : 'Folders'
            }, {
                style: {...paneStyle, flex: '1 1 600px', padding: '0'},
                cn: [{
                    module      : GridContainer,
                    id          : 'email-grid',
                    store       : EmailsStore,
                    wrapperStyle: {height: '100%', width: '100%'},
                    bodyConfig: {
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
                            text     : 'Date',
                            width    : 100,
                            renderer : (({value}) => new Date(value).toLocaleDateString())
                        }
                    ]
                }]
            }, {
                style: {...paneStyle, flex: '1 1 600px'},
                cn: selectedEmail ? [
                    {tag: 'h2', text: selectedEmail.title},
                    {tag: 'p', text: `From: ${selectedEmail.sender}`},
                    {tag: 'div', style: {marginTop: '10px'}, text: selectedEmail.content}
                ] : [{
                    text: 'Select an email to read'
                }]
            }]
        }
    }
});
