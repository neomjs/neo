import Button                  from '../../../src/button/Base.mjs';
import CheckBox                from '../../../src/form/field/CheckBox.mjs';
import Container               from '../../../src/container/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';
// Layouts resolve by ntype once their classes are loaded
import '../../../src/layout/Card.mjs';
import '../../../src/layout/Cube.mjs';
import '../../../src/layout/Flexbox.mjs';
import '../../../src/layout/Grid.mjs';

/**
 * @summary One page that sets seven container layouts side by side over the same six items.
 *
 * Every container takes one `layout` config. The page shows fit, hbox, vbox, flexbox, grid, card and cube at
 * once, each frame holding the same six items, so a visitor compares what a layout does rather than reading it.
 * The toolbar changes `align`, `pack` and the items' flex on the three Flexbox layouts while they run, and steps
 * the card and the cube through the items. The frames themselves sit in a `grid` layout.
 *
 * The static `create*` methods build the item configs the static config declares, so a subclass can reshape a
 * frame, a group or the six items without copying the page.
 * @class Neo.examples.layout.sideBySide.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    /**
     * Returns a group of toggle buttons: a label, then one button per value, with the initial value pressed.
     * @param {Object} data
     * @param {String}   data.handler The controller method a click calls
     * @param {String}   data.name    The layout config the group sets
     * @param {String}   data.value   The initial value
     * @param {String[]} data.values  The values the group offers
     * @returns {Object}
     */
    static createButtonGroup({handler, name, value, values}) {
        return {
            module   : Container,
            cls      : ['examples-layouts-group'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: `${name}-buttons`,

            items: [{
                cls : ['examples-layouts-group-label'],
                html: name
            }, ...values.map(text => ({
                module : Button,
                handler,
                pressed: text === value,
                text
            }))]
        }
    }

    /**
     * Returns the cube container, angled so three of its faces show until Next item turns it to one.
     * @returns {Object}
     */
    static createCube() {
        return {
            module   : Container,
            cls      : ['examples-layouts-cube'],
            items    : this.createItems(),
            reference: 'cube',

            layout: {
                ntype      : 'cube',
                perspective: 600,
                rotateX    : 340,
                rotateY    : 35,
                sideX      : 110,
                sideY      : 110,
                sideZ      : 110
            }
        }
    }

    /**
     * Returns one frame: the layout's name, a line on what it does, and a stage that lays out the six items.
     * @param {Object} data
     * @param {Object[]} [data.items] The stage's items, when they are not the six items themselves
     * @param {String}   data.name    The layout's ntype
     * @param {Object}   data.stage   The stage container's configs: its layout, and a reference or cls where needed
     * @param {String}   data.text    What the layout does, in one line
     * @returns {Object}
     */
    static createFrame({items, name, stage, text}) {
        return {
            module: Container,
            cls   : ['examples-layouts-frame', `examples-layouts-frame-${name}`],
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                cls : ['examples-layouts-frame-title'],
                html: name,
                tag : 'h2'
            }, {
                cls : ['examples-layouts-frame-text'],
                html: text,
                tag : 'p'
            }, {
                module: Container,
                // Grows into a taller frame, never shrinks below its minimum: the grid row takes the frame's full height
                flex  : '1 0 auto',
                items : items || this.createItems(),
                ...stage,
                cls   : ['examples-layouts-stage', ...stage.cls || []]
            }]
        }
    }

    /**
     * Returns the six items every frame holds, as fresh configs, so that each frame owns its own components.
     * @returns {Object[]}
     */
    static createItems() {
        return [1, 2, 3, 4, 5, 6].map(number => ({
            cls : ['examples-layouts-item', `examples-layouts-item-${number}`],
            html: String(number)
        }))
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.layout.sideBySide.MainContainer'
         * @protected
         */
        className: 'Neo.examples.layout.sideBySide.MainContainer',
        /**
         * @member {String[]} cls=['examples-layouts-side-by-side']
         * @reactive
         */
        cls: ['examples-layouts-side-by-side'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            cls : ['examples-layouts-header'],
            flex: 'none',
            html: '<h1>Layouts side by side</h1>' +
                  '<p>A container lays out its items through one <code>layout</code> config. ' +
                  'The same six items sit under seven layouts here. ' +
                  '<code>align</code>, <code>pack</code> and <code>flex</code> change the three flex layouts as they run; ' +
                  '<b>Next item</b> steps the card and turns the cube.</p>'
        }, {
            module: Toolbar,
            cls   : ['examples-layouts-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

            items: [
                this.createButtonGroup({handler: 'onAlignClick', name: 'align', value: 'center', values: ['start', 'center', 'end', 'stretch']}),
                this.createButtonGroup({handler: 'onPackClick',  name: 'pack',  value: 'center', values: ['start', 'center', 'end']}),
                {
                    module    : CheckBox,
                    flex      : 'none',
                    hideLabel : true,
                    listeners : {change: 'onFlexChange'},
                    valueLabel: 'flex: 1 on every item'
                }, {
                    module : Button,
                    flex   : 'none',
                    handler: 'onNextClick',
                    iconCls: 'fa fa-forward-step',
                    text   : 'Next item'
                }
            ]
        }, {
            module: Container,
            cls   : ['examples-layouts-frames'],
            flex  : 1,
            layout: {ntype: 'grid'},

            items: [
                this.createFrame({
                    name : 'fit',
                    stage: {layout: {ntype: 'fit'}},
                    text : 'One item fills the whole container: the first of the six.'
                }),
                this.createFrame({
                    name : 'hbox',
                    stage: {layout: {ntype: 'hbox', align: 'center', pack: 'center'}, reference: 'hbox'},
                    text : 'A row. align places the items across it, pack along it.'
                }),
                this.createFrame({
                    name : 'vbox',
                    stage: {layout: {ntype: 'vbox', align: 'center', pack: 'center'}, reference: 'vbox'},
                    text : 'A column, with the same align and pack.'
                }),
                this.createFrame({
                    name : 'flexbox',
                    stage: {layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'center', wrap: 'wrap'}, reference: 'flexbox'},
                    text : 'A row that wraps when its items run out of room.'
                }),
                this.createFrame({
                    name : 'grid',
                    stage: {cls: ['examples-layouts-grid-stage'], layout: {ntype: 'grid'}},
                    text : 'A CSS grid. Its three columns come from the container\'s stylesheet.'
                }),
                this.createFrame({
                    name : 'card',
                    stage: {layout: {ntype: 'card', activeIndex: 0}, reference: 'card'},
                    text : 'One item at a time. activeIndex picks it.'
                }),
                this.createFrame({
                    items: [this.createCube()],
                    name : 'cube',
                    stage: {layout: {ntype: 'vbox', align: 'center', pack: 'center'}},
                    text : 'The six items as the faces of a cube. activeIndex turns it to one.'
                })
            ]
        }]
    }
}

export default Neo.setupClass(MainContainer);
