import FeatureSection from '../FeatureSection.mjs';

/**
 * @class Portal.view.home.parts.Helix
 * @extends Portal.view.home.FeatureSection
 */
class Helix extends FeatureSection {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Helix'
         * @protected
         */
        className: 'Portal.view.home.parts.Helix',
        /**
         * @member {String[]} cls=['portal-home-parts-helix']
         */
        cls: ['portal-home-parts-helix'],
        /**
         * @member {String} headline='Extreme Speed'
         */
        headline: 'Extreme Speed',
        /**
         * @member {String} learnMoreRoute='#/learn/WhyNeo-Speed'
         */
        learnMoreRoute: '#/learn/WhyNeo-Speed',
        /**
         * @member {String} livePreviewCode
         */
        livePreviewCode: [
            "import Viewport from '../../examples/component/multiWindowHelix/Viewport.mjs';",
            "",
            "class MainView extends Viewport {",
            "    static config = {",
            "        className           : 'Portal.view.MultiWindowHelix',",
            "        showGitHubStarButton: false,",
            "        theme               : 'neo-theme-dark'",
            "    }",
            "}",
            "",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'),
        /**
         * @member {String} paragraph
         */
        paragraph: [
            'This demo shows the Neo.mjs helix component, along with a "Helix Controls" panel. ',
            'Move your cursor over the helix, then rapidly scroll left and right to rotate, and up and down to zoom. ',
            'As you do, look at the delta updates counter at the top. ',
            'Neo.mjs easily handles 40,000 updates per second, and beyond.'
        ].join(''),
        /**
         * @member {String} subHeadline='40,000 Updates /s'
         */
        subHeadline: '40,000 Updates /s'
    }
}

export default Neo.setupClass(Helix);
