import BaseContainer from './BaseContainer.mjs';
import LivePreview   from '../../../../../src/code/LivePreview.mjs';

/**
 * @class Portal.view.home.parts.Helix
 * @extends Portal.view.home.parts.BaseContainer
 */
class Helix extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Helix'
         * @protected
         */
        className: 'Portal.view.home.parts.Helix',
        /**
         * @member {String[]} cls=['portal-home-parts-helix']
         */
        cls: ['portal-home-parts-helix'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'hbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['portal-content-text'],
            flex  : '1',
            style : {padding: '2rem'},
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                cls : 'neo-h1',
                flex: 'none',
                html: 'Extreme Speed',
                tag : 'h1'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: '40,000 Updates /s',
                tag : 'h2'
            }, {
                cls : 'neo-h3',
                flex: 'none',
                tag : 'p',

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
                tag : 'h1'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: 'Seamless and Simple',
                tag : 'h2'
            }, {
                cls : 'neo-h3',
                flex: 'none',
                tag : 'p',

                html: [
                    'Click on the small window icon in the Helix Controls title bar and the controls open in their own window ',
                    'which can be moved to a separate monitor. But the application logic doesn\'t care &mdash; ',
                    'the logic updates the controls just like before, and framework seamlessly handles updating the DOM across windows.'
                ].join('')
            }]
        }, {
            ntype : 'container',
            flex  : '2',
            style : {background: 'lightgray', padding: '20px'},
            layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
            items : [{
                module   : LivePreview,
                cls      : ['page-live-preview'],
                height   : '100%',
                reference: 'live-preview',

                value: [
                    "import Viewport from '../../examples/component/multiWindowHelix/Viewport.mjs';",
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
    async activate() {
        let me       = this,
            {parent} = me;

        await me.timeout(1000);

        if (parent.activePartsId === me.id && parent.mounted) {
            me.getReference('live-preview').activeView = 'preview'
        }
    }
}

Neo.setupClass(Helix);

export default Helix;
