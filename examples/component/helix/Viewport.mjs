import BaseViewport       from '../../../src/container/Viewport.mjs';
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
         * @member {Object[]} items
         * @protected
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            style : {position: 'relative'}
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
                handler  : 'onSortLastnameButtonClick',
                listeners: {},
                style    : {margin: '20px', marginBottom: '10px'},
                text     : 'Sort by Lastname'
            }, {
                ntype    : 'button',
                handler  : 'onSortFirstnameButtonClick',
                listeners: {},
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

        me.items[0].items = [me.helix]
    }
}

export default Neo.setupClass(Viewport);
