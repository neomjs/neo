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
         * @reactive
         */
        cls: ['portal-home-parts-colors'],
        /**
         * @member {String} headline='Amazing Potential'
         * @reactive
         */
        headline: 'Amazing Potential',
        /**
         * @member {String} learnMoreRoute='#/learn/benefits/body/MultiWindow'
         * @reactive
         */
        learnMoreRoute: '#/learn/benefits/body/MultiWindow',
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
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'Click the start button to see the view reflect changes in the data. And the app is multi-window: the table ',
            'and charts can be undocked into their own windows. In fact, the entire demo can be undocked. ',
            'All windows share the same data - less traffic and costs.'
        ].join(''),
        /**
         * @member {String} subHeadline='Socket Data'
         * @reactive
         */
        subHeadline: 'Shared Socket Data'
    }
}

export default Neo.setupClass(Colors);
