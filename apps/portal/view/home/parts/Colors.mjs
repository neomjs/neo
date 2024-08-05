import BaseContainer from './BaseContainer.mjs';
import LivePreview   from '../../../../../src/code/LivePreview.mjs';

/**
 * @class Portal.view.home.parts.Colors
 * @extends Portal.view.home.parts.BaseContainer
 */
class Colors extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Colors'
         * @protected
         */
        className: 'Portal.view.home.parts.Colors',
        /**
         * @member {String[]} cls=['portal-home-parts-colors']
         */
        cls: ['portal-home-parts-colors'],
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
                cls : ['neo-h1'],
                flex: 'none',
                html: 'Amazing Potential',
                tag : 'h1'
            }, {
                cls : ['neo-h2'],
                flex: 'none',
                html: 'Socket Data',
                tag : 'h2'
            }, {
                flex: 'none',
                tag : 'p',

                html: [
                    'This is similar to the Helix demo &mdash; it\'s an extremely fast multi-window app. Click the start button ',
                    'to see the view reflect changes in the data. And the app is multi-window: the table and charts can be ',
                    'undocked into their own windows. In fact, the entire demo can be undocked.'
                ].join('')
            }, {
                flex: 'none',
                html: 'But the demo differs from the helix example because the data is provided via a <i>socket</i>.',
                tag : 'p'
            }, {
                flex: 'none',
                tag : 'p',

                html: [
                    'Neo.mjs uniquely fits the bill for applications that need real-time visualizations of real-time data, such as ',
                    'stock market trading data and medical or scientific telemetry.'
                ].join('')
            }]
        }, {
            ntype : 'container',
            cls   : 'portal-content-wrapper',
            flex  : '2',
            layout: 'fit',
            items : [{
                module   : LivePreview,
                cls      : ['page-live-preview'],
                height   : '100%',
                reference: 'live-preview',

                value: [
                    "import Viewport from '../../apps/colors/view/Viewport.mjs';",
                    "",
                    "class MainView extends Viewport {",
                    "    static config = {",
                    "        className: 'Portal.view.Colors',",
                    "        theme    : 'neo-theme-dark'",
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

Neo.setupClass(Colors);

export default Colors;
