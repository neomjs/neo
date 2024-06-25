import Container   from '../../../../../src/container/Base.mjs';
import LivePreview from '../../learn/LivePreview.mjs';

/**
 * @class Portal.view.home.parts.Helix
 * @extends Neo.container.Base
 */
class Helix extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Helix'
         * @protected
         */
        className: 'Portal.view.home.parts.Helix',
        /**
         * @member {String[]} cls=['page','cool-stuff']
         */
        cls: ['page', 'cool-stuff'],
        /**
         * @member {Object} responsive
         */
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
                html: 'Extreme Speed',
                vdom: {tag: 'h1'}
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: '40,000 Updates /s',
                vdom: {tag: 'h2'}
            }, {
                cls : 'neo-h3',
                flex: 'none',
                vdom: {tag: 'p'},

                html: [
                    'This demo shows the Neo.mjs helix component, along with a "Helix Controls" panel. ',
                    'Move your cursor over the helix, then rapidly scroll left and right to rotate, and up and down to zoom. ',
                    'As you do, look at the delta updates counter at the top. ',
                    'Neo.mjs easily handles 40,000 updates per second, and beyond.'
                ].join('')
            }, {
                cls : 'neo-h1',
                flex: 'none',
                html: 'Multi-Window',
                vdom: {tag: 'h1'}
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: 'Seamless and Simple',
                vdom: {tag: 'h2'}
            }, {
                cls : 'neo-h3',
                flex: 'none',
                vdom: {tag: 'p'},

                html: [
                    'Click on the small window icon in the Helix Controls title bar and the controls open in their own window ',
                    'which can be moved to a separate monitor. But the application logic doesn\'t care &mdash; ',
                    'the logic updates the controls just like before, and framework seamlessly handles updating the DOM across windows.'
                ].join('')
            }]
        }, {
            module: Container,
            flex  : '2',
            style : {background: 'lightgray', padding: '20px'},
            layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
            items : [{
                module   : LivePreview,
                cls      : ['page-live-preview'],
                height   : '100%',
                reference: 'live-preview',

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

    /**
     *
     */
    activate() {
        this.getReference('live-preview').activeView = 'preview'
    }
}

Neo.setupClass(Helix);

export default Helix;
