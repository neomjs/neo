import Canvas    from './Canvas.mjs';
import Container from '../../../../src/container/Base.mjs';

/**
 * @summary The main container for the Portal's Services section, orchestrating the Neural Lattice background and content overlays.
 *
 * This container uses a `fit` layout to layer the interactive `Portal.view.services.Canvas` (background)
 * beneath the scrollable content cards. It handles user interaction by capturing DOM events at the
 * container level and delegating them to the canvas controller, ensuring smooth physics interactions
 * even when the mouse is over the text content.
 *
 * **Key Responsibilities:**
 * 1.  **Visual Layering:** Stacks the SharedWorker-driven canvas behind the UI content.
 * 2.  **Event Delegation:** Captures `mousemove` and `mouseleave` events and forwards them to the
 *     `Canvas` component to drive the "Neural Lattice" physics engine.
 * 3.  **Content Structure:** Defines the layout for the "Professional Trainings" and "Professional Services" cards.
 *
 * @class Portal.view.services.Container
 * @extends Neo.container.Base
 * @see Portal.view.services.Canvas
 * @see Portal.canvas.ServicesCanvas
 */
class ServicesContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Container'
         * @protected
         */
        className: 'Portal.view.services.Container',
        /**
         * @member {String[]} cls=['portal-services-component']
         * @reactive
         */
        cls: ['portal-services-component'],
        /**
         * DOM listeners are set on the container to capture interactions across the entire view,
         * including over the content cards.
         * @member {Object} domListeners
         */
        domListeners: {
            mouseleave: 'onMouseLeave',
            mousemove : {fn: 'onMouseMove', local: true}
        },
        /**
         * @member {Object} layout={ntype: 'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Canvas,
            reference: 'canvas',
            style    : {position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}
        }, {
            ntype : 'container',
            cls   : ['portal-services-content-wrapper'],
            layout: {ntype: 'vbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['neo-h1'],
                tag  : 'h1',
                text : 'Services'
            }, {
                ntype: 'container',
                cls  : ['portal-glass-card'],
                items: [{
                    ntype: 'component',
                    cls  : ['portal-content-box-headline'],
                    tag  : 'h2',
                    text : 'Professional Trainings'
                }, {
                    ntype: 'component',
                    cls  : ['portal-content-box-content'],
                    vdom : {cn: [
                        {tag: 'p',  text: [
                            'While we do have a self-study based Learning Section online, you can also hire us ',
                            'in case you prefer an Instructor-led Training for bringing your team up to speed.'
                        ].join('')},
                        {tag: 'ul', cn: [
                            {tag: 'li', text: 'One week packed with 40h of intense training.'},
                            {tag: 'li', text: 'Including hands-on Labs'},
                            {tag: 'li', text: '6 - 12 attendees'},
                            {tag: 'li', text: 'While Remote Trainings are possible, we strongly recommend On-Site Trainings instead.'},
                        ]},
                        {tag: 'p',  html: [
                            'Feel free to send us an <a href="mailto:trainings@neomjs.com">Email</a> to plan your training timeframe.',
                        ].join('')}
                    ]}
                }]
            }, {
                ntype: 'container',
                cls  : ['portal-glass-card'],
                items: [{
                    ntype: 'component',
                    cls  : ['portal-content-box-headline'],
                    tag  : 'h2',
                    text : 'Professional Services'
                }, {
                    ntype: 'component',
                    cls  : ['portal-content-box-content'],
                    vdom : {cn: [
                        {tag: 'p',  text: [
                            'We can help you to ensure your Neo.mjs based projects run successfully.',
                        ].join('')},
                        {tag: 'ul', cn: [
                            {tag: 'li', text: 'Feasibility Analysis: Is Neo.mjs a good fit for your project needs?'},
                            {tag: 'li', text: 'Creating a Neo.mjs PoC which matches your specific needs'},
                            {tag: 'li', text: 'Code Reviews'},
                            {tag: 'li', text: 'Frontend-Architecture Guidance'},
                            {tag: 'li', text: 'Application & Framework Debugging'},
                            {tag: 'li', text: 'Creation of Custom Components, Design Themes & new Features'},
                            {tag: 'li', text: 'Hands-On Application Development Support'}
                        ]},
                        {tag: 'p',  html: [
                            'In case you need help, send us an <a href="mailto:services@neomjs.com">Email</a>.',
                        ].join('')}
                    ]}
                }]
            }]
        }]
    }

    /**
     * Delegates mouse leave events to the canvas controller to reset physics state.
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.getItem('canvas').onMouseLeave(data)
    }

    /**
     * Delegates mouse move events to the canvas controller to update physics interactions.
     * @param {Object} data
     */
    onMouseMove(data) {
        this.getItem('canvas').onMouseMove(data)
    }
}

export default Neo.setupClass(ServicesContainer);