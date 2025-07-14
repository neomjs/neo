import {defineComponent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'Email.view.MainView',
        cls      : ['email-mainview']
    },
    createVdom() {
        const paneStyle = {
            border: '1px solid #c0c0c0',
            margin: '10px',
            padding: '10px'
        };

        return {
            cn: [{
                style: {...paneStyle, flex: '0 0 200px'},
                text : 'Folders'
            }, {
                style: {...paneStyle, flex: '1 1 400px'},
                text : 'Email List'
            }, {
                style: {...paneStyle, flex: '1 1 600px'},
                text : 'Email Details'
            }]
        }
    }
});
