import BaseViewport       from '../../../src/container/Viewport.mjs';
import CheckBox           from '../../../src/form/field/CheckBox.mjs';
import Helix              from '../../../src/component/Helix.mjs';
import ImageStore         from './ImageStore.mjs';
import NumberField        from '../../../src/form/field/Number.mjs';
import Panel              from '../../../src/container/Panel.mjs';
import RangeField         from '../../../src/form/field/Range.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @summary A 3D helix component example demonstrating advanced component lifecycle and interactivity.
 *
 * This class provides the main viewport for the Helix example, showcasing a complex 3D component (`Neo.component.Helix`)
 * integrated into a standard application layout. It demonstrates several key Neo.mjs concepts:
 *
 * - **Component Lifecycle:** The `construct` method is used to dynamically create the `Helix` instance and inject it into the items array before the component tree is mounted.
 * - **Reactivity & Hooks:** `afterSet` hooks (`afterSetMounted`, `afterSetShowGitHubStarButton`) are used to trigger side effects when configs change, such as adding external scripts or showing/hiding components.
 * - **Controller-View Interaction:** It delegates all event handling and business logic to its `ViewportController`.
 * - **Advanced Layouts:** It uses a combination of `hbox` and `fit` layouts to create a responsive UI with a main content area and a side control panel.
 *
 * This example is a good showcase for **3D transformations**, **component performance**, and **complex interactivity**.
 *
 * @class Neo.examples.component.helix.Viewport
 * @extends Neo.container.Viewport
 * @see Neo.component.Helix
 * @see Neo.examples.component.helix.ViewportController
 */
class Viewport extends BaseViewport {
    /**
     * Internally storing the windowIds, into which this container got mounted
     * @member {Number[]} windowIds=[]
     * @protected
     * @static
     */
    static windowIds = []

    static config = {
        /**
         * @member {String} className='Neo.examples.component.helix.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.helix.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * Holds the dynamically created instance of the Helix component.
         * @member {Neo.component.Helix|null} helix=null
         */
        helix: null,
        /**
         * A configuration object that is passed to the Helix instance upon creation.
         * @member {Object|null} helixConfig=null
         */
        helixConfig: null,
        /**
         * @member {Object} layout={ntype: 'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * Controls the visibility of the GitHub star button.
         * @member {Boolean} showGitHubStarButton_=true
         * @reactive
         */
        showGitHubStarButton_: true,
        /**
         * @member {Object[]} items
         * @protected
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            style : {position: 'relative'},

            items: [{
                ntype: 'component',
                html : 'DeltaUpdates / s: <span id="neo-delta-updates"></span>',
                style: {
                    position: 'absolute',
                    right   : '150px',
                    top     : '25px',
                    width   : '200px',
                    zIndex  : 1
                }
            }, {
                ntype    : 'component',
                html     : '<a class="github-button" href="https://github.com/neomjs/neo" data-size="large" data-show-count="true" aria-label="Star neomjs/neo on GitHub">Star</a>',
                reference: 'github-button',

                style: {
                    position: 'absolute',
                    right   : '20px',
                    top     : '20px',
                    zIndex  : 1
                }
            }]
        }, {
            module   : Panel,
            layout   : {ntype: 'vbox', align: 'stretch'},
            cls      : ['neo-helix-controls-panel'],
            reference: 'controls-panel',
            style    : {backgroundColor: '#2b2b2b'},
            width    : 250,

            containerConfig: {
                flex : null,
                style: {overflowY: 'scroll'}
            },

            headers: [{
                dock: 'top',
                text: 'Helix Controls'
            }],

            itemDefaults: {
                ntype        : 'rangefield',
                flex         : '0 1 auto',
                labelWidth   : '100px',
                listeners    : {change: 'onRangefieldChange'},
                style        : {padding: '10px'},
                useInputEvent: true
            },

            items: [{
                labelText: 'Translate X',
                maxValue : 2000,
                minValue : -2000,
                name     : 'translateX',
                value    : 400
            }, {
                labelText: 'Translate Y',
                maxValue : 2500,
                minValue : -2500,
                name     : 'translateY',
                value    : -350
            }, {
                eventName: 'changeTranslateZ',
                labelText: 'Translate Z',
                listeners: {change: 'onRangefieldChange', mounted: 'onRangefieldMounted'},
                maxValue : 4500,
                minValue : -4500,
                name     : 'translateZ',
                value    : -1500
            }, {
                labelText : 'Delta Y',
                labelAlign: 'top',
                maxValue  : 600,
                minValue  : -600,
                name      : 'deltaY',
                value     : 70
            }, {
                eventName: 'changeRotation',
                labelText: 'Rotate',
                listeners: {change: 'onRangefieldChange', mounted: 'onRangefieldMounted'},
                minValue : -720,
                maxValue : 720,
                name     : 'rotationAngle',
                value    : 0
            }, {
                labelText: 'Radius',
                maxValue : 3500,
                minValue : 900,
                name     : 'radius',
                value    : 1500
            }, {
                labelText: 'Perspective',
                minValue : 50,
                maxValue : 3000,
                name     : 'perspective',
                value    : 800
            }, {
                labelText: 'Item Angle',
                minValue : 1,
                maxValue : 36,
                name     : 'itemAngle',
                value    : 8
            }, {
                labelText: 'Max Opacity',
                name     : 'maxOpacity',
                minValue : 0,
                maxValue : 100,
                value    : 80 // todo [30, 80]
            }, {
                labelText: 'Min Opacity',
                name     : 'minOpacity',
                minValue : 0,
                maxValue : 100,
                value    : 30
            }, {
                module   : NumberField,
                clearable: false,
                labelText: 'Max Items',
                maxValue : 600,
                minValue : 100,
                name     : 'maxItems',
                stepSize : 100,
                value    : 300
            }, {
                ntype    : 'button',
                handler  : 'onFlipItemsButtonClick',
                listeners: {},
                style    : {margin: '20px'},
                text     : 'Flip Items'
            }, {
                ntype    : 'button',
                disabled : true,
                handler  : 'onSortLastnameButtonClick',
                listeners: {},
                reference: 'sort-lastname-button',
                style    : {margin: '20px', marginBottom: '10px'},
                text     : 'Sort by Lastname'
            }, {
                ntype    : 'button',
                disabled : true,
                handler  : 'onSortFirstnameButtonClick',
                listeners: {},
                reference: 'sort-firstname-button',
                style    : {margin: '20px', marginTop: 0},
                text     : 'Sort by Firstname'
            }, {
                ntype    : 'button',
                handler  : 'onFollowSelectionButtonClick',
                iconCls  : 'fa fa-square',
                listeners: {},
                style    : {margin: '20px', marginBottom: '10px'},
                text     : 'Follow Selection'
            }, {
                module        : CheckBox,
                checked       : Neo.config.logDeltaUpdates,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'onLogDeltasCheckboxChange'},
                style         : {marginLeft: '10px', marginTop: '10px'},
                valueLabelText: 'logDeltaUpdates'
            }, {
                ntype: 'label',
                html : [
                    '<b>Navigation Concept</b>',
                    '<p>Click on an item to select it. Afterwards you can use the Arrow Keys to walk through the items.</p>',
                    '<p>Hit the Space Key to rotate the currently selected item to the front.</p>',
                    '<p>Hit the Enter Key to expand the currently selected item.</p>'
                ].join(''),

                style: {
                    backgroundColor: '#323232',
                    color          : '#ddd',
                    fontSize       : '13px',
                    margin         : '10px',
                    padding        : '10px',
                    whiteSpace     : 'normal'
                }
            }]
        }]
    }

    /**
     * Overrides the default `construct` method to dynamically create the Helix component.
     * This ensures the Helix is instantiated with the correct `windowId` and any specific
     * `helixConfig` before being added to the viewport's items.
     * @param {Object} config
     * @protected
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.helix = Neo.create({
            module   : Helix,
            appName  : me.appName,
            reference: 'helix',
            store    : ImageStore,
            windowId : me.windowId,
            ...me.helixConfig
        });

        me.items[0].items.unshift(me.helix)
    }

    /**
     * Triggered after the mounted config got changed. This hook is used to perform actions
     * that should only run once the component is live in the DOM.
     * @param {Boolean} value The new value of `mounted`
     * @param {Boolean} oldValue The old value of `mounted`
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            let me = this;

            // Enable render delta logging for performance monitoring.
            Neo.Main.setNeoConfig({
                key     : 'renderCountDeltas',
                value   : true,
                windowId: me.windowId
            });

            // Dynamically load the GitHub buttons script if the star button is visible.
            if (me.showGitHubStarButton) {
                me.timeout(200).then(() => {
                    let {windowId}  = me,
                        {windowIds} = Viewport;

                    if (!windowIds.includes(windowId)) {
                        windowIds.push(windowId);

                        Neo.main.DomAccess.addScript({
                            async: true,
                            defer: true,
                            src  : 'https://buttons.github.io/buttons.js',
                            windowId
                        })
                    }
                })
            }
        }
    }

    /**
     * A hook that fires after the `showGitHubStarButton` config is changed.
     * It toggles the visibility of the GitHub button component.
     * @param {Boolean} value The new value
     * @param {Boolean} oldValue The old value
     * @protected
     */
    afterSetShowGitHubStarButton(value, oldValue) {
        this.getItem('github-button').hidden = !value
    }
}

export default Neo.setupClass(Viewport);
