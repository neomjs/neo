import FeatureSection from '../FeatureSection.mjs';

/**
 * @class Portal.view.home.parts.How
 * @extends Portal.view.home.FeatureSection
 */
class How extends FeatureSection {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.How'
         * @protected
         */
        className: 'Portal.view.home.parts.How',
        /**
         * @member {String[]} cls=['portal-home-parts-how']
         */
        cls: ['portal-home-parts-how'],
        /**
         * @member {Object[]} contentItems
         */
        contentItems: [{
            ntype : 'container',
            cls   : 'portal-content-container',
            layout: 'fit',
            items : [{
                cls : 'neo-worker-setup',
                tag : 'element-loader',
                vdom: {src: '../../resources/images/workers-focus.svg'}
            }]
        }],
        /**
         * @member {String} headline='How?'
         */
        headline: 'How?',
        /**
         * @member {String} learnMoreRoute='#/learn/WhyNeo-Speed'
         */
        learnMoreRoute: '#/learn/WhyNeo-Speed',
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'When a Neo.mjs app launches three webworkers are spawned: one that holds app logic, one for tracking delta DOM updates, ',
            'and one for backend calls. Each webworker runs in its own thread, and thus, in its own processor core. ',
            'This means these processes run in parallel: your app logic isn\'t affected by DOM changes or ',
            'by Ajax or socket calls. If you have processor-intensive tasks you can easily run them in their own threads.'
        ].join(''),
        /**
         * @member {String} subHeadline='How does Neo.mjs do it?'
         */
        subHeadline: 'How does Neo.mjs do it?'
    }
}

Neo.setupClass(How);

export default How;
