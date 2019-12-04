import {default as Component} from '../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.FooterComponent
 * @extends Neo.component.Base
 */
class FooterComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.FooterComponent'
         * @private
         */
        className: 'RealWorld.views.FooterComponent',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tag: 'footer',
            cn : [{
                cls: ['container'],
                cn : [{
                    tag : 'a',
                    cls : ['logo-font'],
                    href: '/',
                    html: 'conduit'
                }, {
                    tag : 'span',
                    cls : 'attribution',
                    html: 'An interactive learning project from <a href="https://thinkster.io">Thinkster</a>. Code &amp; design licensed under MIT.'
                }]
            }]
        }
    }}
}

Neo.applyClassConfig(FooterComponent);

export {FooterComponent as default};