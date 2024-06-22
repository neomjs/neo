import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from '../../learn/LivePreview.mjs';

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
            flex  : '2',
            style : {background: 'grey', padding: '20px'},
            layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
            items : [{
                module    : LivePreview,
                activeView: 'preview',
                cls       : ['page-live-preview'],
                height    : '100%',
                style     : {background: 'white'},

                value: [
                    "import Viewport from '../../../../examples/component/multiWindowHelix/Viewport.mjs';",
                    "",
                    "class MainView extends Viewport {",
                    "    static config = {",
                    "        className           : 'Portal.view.MultiWindowHelix',",
                    "        showGitHubStarButton: false,",
                    "        theme               : 'neo-theme-dark'",
                    "    }",
                    "}",
                    "",
                    "Neo.setupClass(MainView);"
                ].join('\n')
            }]
        }]
    }
}

Neo.setupClass(CoolStuff);

export default CoolStuff;
