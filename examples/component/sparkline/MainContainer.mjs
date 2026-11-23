import Button                  from '../../../src/button/Base.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import {METRICS}               from './metrics.mjs';
import Sparkline               from '../../../src/component/Sparkline.mjs';
import SwitchField             from '../../../src/form/field/Switch.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary Six metric cards, each a reading and a `Neo.component.Sparkline` of the last thirty seconds, which a
 * simulated feed extends once a second. The sparklines draw in the canvas worker. The switches turn the feed,
 * the sparklines' pulse (`usePulse`) and their eased updates (`useTransition`) on and off, and Restart replays
 * the opening readings.
 *
 * @class Neo.examples.component.sparkline.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.sparkline.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.sparkline.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-sparkline']
         */
        cls: ['neo-examples-sparkline'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['neo-examples-sparkline-toolbar'],
            flex  : 'none',
            layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['neo-examples-sparkline-title'],
                text  : 'Checkout service, last 30 seconds'
            }, '->', {
                module    : SwitchField,
                checked   : true,
                hideLabel : true,
                listeners : {change: 'onFeedChange'},
                reference : 'feed',
                valueLabel: 'Live feed'
            }, {
                module    : SwitchField,
                checked   : true,
                hideLabel : true,
                listeners : {change: 'onPulseChange'},
                reference : 'pulse',
                valueLabel: 'Pulse'
            }, {
                module    : SwitchField,
                checked   : true,
                hideLabel : true,
                listeners : {change: 'onTransitionChange'},
                reference : 'transition',
                valueLabel: 'Smooth updates'
            }, {
                module : Button,
                handler: 'onRestartClick',
                text   : 'Restart'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['neo-examples-sparkline-cards'],
            flex  : 1,
            layout: null,

            items: METRICS.map(metric => ({
                module: Container,
                cls   : ['neo-examples-sparkline-card'],
                layout: null,

                items: [{
                    module: Component,
                    cls   : ['neo-examples-sparkline-label'],
                    text  : metric.label
                }, {
                    module   : Component,
                    cls      : ['neo-examples-sparkline-value'],
                    reference: `${metric.id}-value`
                }, {
                    module   : Sparkline,
                    reference: `${metric.id}-sparkline`
                }]
            }))
        }]
    }
}

export default Neo.setupClass(MainContainer);
