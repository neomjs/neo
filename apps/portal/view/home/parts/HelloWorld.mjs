import Button      from '../../../../../src/button/Base.mjs';
import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from "../../learn/LivePreview.mjs";

/**
 * @class Portal.view.home.parts.HelloWorld
 * @extends Neo.container.Base
 */
class HelloWorld extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.HelloWorld'
         * @protected
         */
        className: 'Portal.view.home.parts.HelloWorld',
        ntype    : 'hello-world',

        cls: ['page', 'hello-world'],

        responsiveConfig: {
            oldPhone: {maxWidth: 321},
            phone   : {maxWidth: 481},
            tablet  : {maxWidth: 769},
            medium  : {maxWidth: 841},
            large   : {minWidth: 840}
        },

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
                id  : 'neo-hello-world-h1',
                flex: 'none',
                html: 'Hello World'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: 'Your first code snippet'
            }, {
                cls : 'neo-content',
                flex: 'none',
                html: 'If you understand these lines, you are ready to start with Neo.mjs'
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
                    'Neo.setupClass(MainView);',
            }]
        }]
    }
}

Neo.setupClass(HelloWorld);

export default HelloWorld;
