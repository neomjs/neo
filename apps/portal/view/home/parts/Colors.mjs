import FeatureSection from '../FeatureSection.mjs';

/**
 * @class Portal.view.home.parts.Colors
 * @extends Portal.view.home.FeatureSection
 */
class Colors extends FeatureSection {
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
         * @member {String} headline='Amazing Potential'
         */
        headline: 'Amazing Potential',
        /**
         * @member {String} learnMoreRoute='#/learn/WhyNeo-Speed'
         */
        learnMoreRoute: '#/learn/WhyNeo-Speed',
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
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
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'This is similar to the Helix demo &mdash; it\'s an extremely fast multi-window app. Click the start button ',
            'to see the view reflect changes in the data. And the app is multi-window: the table and charts can be ',
            'undocked into their own windows. In fact, the entire demo can be undocked.'
        ].join(''),
        /**
         * @member {String} subHeadline='Socket Data'
         */
        subHeadline: 'Socket Data',
        /**
         * @member {String} textContainerPosition='end'
         */
        textContainerPosition: 'end'
    }
}

export default Neo.setupClass(Colors);
