import BaseContainer from './BaseContainer.mjs';
import LivePreview   from '../../../../../src/code/LivePreview.mjs';
import Button        from "../../../../../src/button/Base.mjs";

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
         * @member {Object} responsive
         */
        // responsive: {
        //     medium: {layout: {ntype: 'vbox', align: 'stretch', pack: 'center'}},
        //     large : {layout: {ntype: 'hbox', align: 'stretch', pack: 'center'}}
        // },
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            flex  : 'none',
            style : {paddingTop: '2rem', overflow: 'visible'},
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                cls : 'neo-h1',
                flex: 'none',
                html: 'Extreme Speed',
                vdom: {tag: 'h1'}
            }, {
                ntype: 'container',
                cls  : 'overlay-outer',
                items: [{
                    ntype: 'container',
                    cls  : 'overlay-container',
                    items: [{
                        cls : 'neo-h2 overlay-content',
                        flex: 'none',
                        html: '40,000 Updates /s',
                        vdom: {tag: 'h2'}
                    }, {
                        cls : 'neo-h3 overlay-content',
                        vdom: {tag: 'p'},
                        html: [
                            'This demo shows the Neo.mjs helix component, along with a "Helix Controls" panel. ',
                            'Move your cursor over the helix, then rapidly scroll left and right to rotate, and up and down to zoom. ',
                            'As you do, look at the delta updates counter at the top. ',
                            'Neo.mjs easily handles 40,000 updates per second, and beyond.'
                        ].join('')
                    }, {
                        cls : 'neo-h3 overlay-content',
                        vdom: {tag: 'p'},
                        html: [
                            'Click on the small window icon in the Helix Controls title bar and the controls open in their own window ',
                            'which can be moved to a separate monitor. But the application logic doesn\'t care &mdash; ',
                            'the logic updates the controls just like before, and framework seamlessly handles updating the DOM across windows.'
                        ].join('')
                    }, {
                        module : Button,
                        cls    : 'toggle-button',
                        iconCls: 'fa fa-angle-up',
                        state  : 'down',
                        handler: function (event) {
                            const button           = event.component,
                                  overlayContainer = button.up();

                            if (button.state === 'down') {
                                button.iconCls = 'fa fa-angle-down';
                                overlayContainer.addCls('hidden');
                                button.state = 'up';
                            } else {
                                button.iconCls = 'fa fa-angle-up';
                                overlayContainer.removeCls('hidden');
                                button.state = 'down';
                            }
                            button.update();
                        }
                    }]
                }]
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
        await this.timeout(1000);
        this.getReference('live-preview').activeView = 'preview'
    }
}

Neo.setupClass(Helix);

export default Helix;
