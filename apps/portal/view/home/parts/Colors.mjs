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
         * @member {String} learnMoreRoute='https://itnext.io/sharing-real-time-websocket-data-across-multiple-browser-windows-4e0538dd7563?source=friends_link&sk=9efb3e4f38c82fb3e04899c61bb5fcb8'
         */
        learnMoreRoute: 'https://itnext.io/sharing-real-time-websocket-data-across-multiple-browser-windows-4e0538dd7563?source=friends_link&sk=9efb3e4f38c82fb3e04899c61bb5fcb8',
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
         */
        subHeadline: 'Shared Socket Data'
    }
}

export default Neo.setupClass(Colors);
