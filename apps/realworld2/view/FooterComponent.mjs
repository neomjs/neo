import Component from '../../../src/component/Base.mjs';

/**
 * @class RealWorld2.view.FooterComponent
 * @extends Neo.component.Base
 */
class FooterComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.FooterComponent'
         * @protected
         */
        className: 'RealWorld2.view.FooterComponent',
        /**
         * @member {String[]} baseCls=['rw2-footer-component']
         */
        baseCls: ['rw2-footer-component'],
        /**
         * @member {Number} height=40
         */
        height: 40,
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
                    href: '#/',
                    html: 'conduit'
                }, {
                    tag : 'span',
                    cls : 'attribution',
                    html: 'An interactive learning project from <a href="https://thinkster.io">Thinkster</a>. Code &amp; design licensed under MIT.'
                }]
            }]
        }
    }
}

export default Neo.setupClass(FooterComponent);
