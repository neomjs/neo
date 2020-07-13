import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Website.view.home.ExecutiveIntroComponent
 * @extends Neo.component.Base
 */
class ExecutiveIntroComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.home.ExecutiveIntroComponent'
         * @protected
         */
        className: 'Website.view.home.ExecutiveIntroComponent',
        /**
         * @member {Object} vdom
         */
        vdom: {innerHTML: 'Amazing text to describe neo.mjs for executives'}
    }}
}

Neo.applyClassConfig(ExecutiveIntroComponent);

export {ExecutiveIntroComponent as default};