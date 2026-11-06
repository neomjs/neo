import Canvas    from './Canvas.mjs';
import Container from '../../../../src/container/Base.mjs';

/**
 * @summary Connects visitors with Neo's public tools, setup guides and development community.
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
 * 3.  **Content Structure:** Offers practical next steps for building apps, adding agent memory and contributing.
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
                text : 'Connect'
            }, {
                ntype: 'component',
                cls  : ['portal-connect-intro'],
                tag  : 'p',
                text : 'Build with your coding agent, give it lasting project knowledge, and take part in the work behind Neo.'
            }, {
                ntype: 'container',
                cls  : ['portal-glass-card'],
                items: [{
                    ntype: 'component',
                    cls  : ['portal-content-box-headline'],
                    tag  : 'h2',
                    text : 'Build an application'
                }, {
                    ntype: 'component',
                    cls  : ['portal-content-box-content'],
                    vdom : {cn: [
                        {tag: 'p', text: 'Start with the open-source Neo.mjs engine. Explore a working example, or create an app and work with its source, conventions and runtime tools alongside your coding agent.'},
                        {tag: 'p', cls: ['portal-connect-links'], cn: [{
                            tag : 'a', href: 'https://github.com/neomjs/create-app',
                            text: 'Create an app', target: '_blank', rel: 'noopener noreferrer'
                        }, {
                            tag: 'a', href: '#/examples', text: 'Explore examples'
                        }]}
                    ]}
                }]
            }, {
                ntype: 'container',
                cls  : ['portal-glass-card'],
                items: [{
                    ntype: 'component',
                    cls  : ['portal-content-box-headline'],
                    tag  : 'h2',
                    text : 'Give your agent project memory'
                }, {
                    ntype: 'component',
                    cls  : ['portal-content-box-content'],
                    vdom : {cn: [
                        {tag: 'p', text: 'Keep repository knowledge and past decisions available across sessions. The open-source Agent OS provides Memory Core and a Knowledge Base, with local and cloud deployment paths on your own infrastructure.'},
                        {tag: 'p', cls: ['portal-connect-links'], cn: [{
                            tag : 'a', href: 'https://github.com/neomjs/neo-agent-brain',
                            text: 'Explore the Agent OS', target: '_blank', rel: 'noopener noreferrer'
                        }]}
                    ]}
                }]
            }, {
                ntype: 'container',
                cls  : ['portal-glass-card'],
                items: [{
                    ntype: 'component',
                    cls  : ['portal-content-box-headline'],
                    tag  : 'h2',
                    text : 'Join the public development work'
                }, {
                    ntype: 'component',
                    cls  : ['portal-content-box-content'],
                    vdom : {cn: [
                        {tag: 'p', text: 'Bring a question, discuss a design or contribute a change. Neo’s human and AI maintainers work through public issues, discussions and pull requests, so you can follow the reasoning as well as the code.'},
                        {tag: 'p', cls: ['portal-connect-links'], cn: [{
                            tag : 'a', href: 'https://github.com/orgs/neomjs/discussions',
                            text: 'Join the discussion', target: '_blank', rel: 'noopener noreferrer'
                        }, {
                            tag : 'a', href: 'https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md',
                            text: 'Contribute a change', target: '_blank', rel: 'noopener noreferrer'
                        }]}
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
