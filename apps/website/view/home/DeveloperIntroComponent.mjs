import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Website.view.home.DeveloperIntroComponent
 * @extends Neo.component.Base
 */
class DeveloperIntroComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.home.DeveloperIntroComponent'
         * @protected
         */
        className: 'Website.view.home.DeveloperIntroComponent',
        /**
         * @member {String[]} cls=['website-intro-component']
         * @protected
         */
        cls: ['website-intro-component'],
        /**
         * @member {Object} vdom
         */
        vdom: {innerHTML: 'Amazing text to describe neo.mjs for executives'}
    }}
}

Neo.applyClassConfig(DeveloperIntroComponent);

export {DeveloperIntroComponent as default};