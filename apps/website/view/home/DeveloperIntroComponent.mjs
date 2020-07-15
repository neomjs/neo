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
        vdom: {innerHTML: [
            '<h1>Content</h1>',
            '<ol>',
                '<li><a class="nav-link" data-target="exec-nav-1">Introduction</a></li>',
                '<li>',
                    '<a class="nav-link" data-target="exec-nav-2">Current pain points inside the UI sector</a>',
                    '<ul>',
                        '<li>2.1 <a class="nav-link" data-target="dev-nav-2.1">Performance</a></li>',
                        '<li>2.2 <a class="nav-link" data-target="dev-nav-2.2">Multi Browser Window Apps</a></li>',
                        '<li>2.3 <a class="nav-link" data-target="dev-nav-2.3">Developing UIs inside nodejs</a></li>',
                        '<li>2.4 <a class="nav-link" data-target="dev-nav-2.4">Scalable Architectures</a></li>',
                        '<li>2.5 <a class="nav-link" data-target="dev-nav-2.5">Memory Leaks</a></li>',
                        '<li>2.6 <a class="nav-link" data-target="dev-nav-2.6">No Templates</a></li>',
                        '<li>2.7 <a class="nav-link" data-target="dev-nav-2.7">Consistent Code</a></li>',
                    '</ul>',
                '</li>',
            '<ol>'
        ].join('')}
    }}
}

Neo.applyClassConfig(DeveloperIntroComponent);

export {DeveloperIntroComponent as default};