import Canvas    from './Canvas.mjs';
import Container from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.services.Container
 * @extends Neo.container.Base
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
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.getItem('canvas').onMouseLeave(data)
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.getItem('canvas').onMouseMove(data)
    }
}

export default Neo.setupClass(ServicesContainer);