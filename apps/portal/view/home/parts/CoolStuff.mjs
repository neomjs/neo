import Button      from '../../../../../src/button/Base.mjs';
import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from "../../learn/LivePreview.mjs";

/**
 * @class Portal.view.home.parts.CoolStuff
 * @extends Neo.container.Base
 */
class CoolStuff extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.CoolStuff'
         * @protected
         */
        className: 'Portal.view.home.parts.CoolStuff',

        cls: ['page', 'cool-stuff'],

        responsive: {
            medium: {layout: {ntype: 'vbox', align: 'stretch', pack: 'center'}},
            large : {layout: {ntype: 'hbox', align: 'stretch', pack: 'center'}}
        },

        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            flex  : '1',
            style : {padding: '2rem'},
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                cls : 'neo-h1',
                flex: 'none',
                html: 'Cool Stuff'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: 'WOW - See the power of Neo',
                // height: 200
            }, {
                cls : 'neo-content',
                flex: 'none',
                html: 'Neo uses several cores to run the application. See the spinner on the page?',
                // height: 200
            }]
        }, {
            module: Container,
            flex  : '0.8',
            // responsive: {
            //     medium: {flex: '1.2'},
            //     large: {flex: '0.6'}
            // },
            style : {background: 'grey', padding: '20px'},
            layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
            items : [{
                module: LivePreview,
                cls   : ['page-live-preview'],
                style : {background: 'white'},
                value :
                    'import Button    from "../../../../src/button/Base.mjs";\n' +
                    'import Container from "../../../../src/container/Base.mjs";\n' +
                    '\n' +
                    'class MainView extends Container {\n' +
                    '    static config = {\n' +
                    '        className: "Portal.view.MainView",\n' +
                    '        layout   : {ntype:"vbox", align:"stretch"},\n' +
                    '        items    : [{\n' +
                    '            module : Container,\n' +
                    '            html  : "Hello World"\n' +
                    '        }]\n' +
                    '    }\n' +
                    '}\n' +
                    '\n' +
                    'Neo.setupClass(MainView);'
            }]
        }]
    }
}

Neo.setupClass(CoolStuff);

export default CoolStuff;
