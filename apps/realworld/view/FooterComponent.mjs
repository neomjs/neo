import Component from '../../../src/component/Base.mjs';

/**
 * @class RealWorld.view.FooterComponent
 * @extends Neo.component.Base
 */
class FooterComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld.view.FooterComponent'
         * @protected
         */
        className: 'RealWorld.view.FooterComponent',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'footer', cn: [
            {cls: ['container'], cn: [
                {tag: 'a', cls: ['logo-font'], href: '#/', text: 'conduit'},
                {tag: 'span', cls: 'attribution', html: 'An interactive learning project from <a href="https://thinkster.io">Thinkster</a>. Code &amp; design licensed under MIT.'}
            ]}
        ]}
    }
}

export default Neo.setupClass(FooterComponent);
