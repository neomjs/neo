import Base from '../../../../src/component/Base.mjs';

/**
 * @class Portal.view.home.ContentBox
 * @extends Neo.component.Base
 */
class ContentBox extends Base {
    static config = {
        /**
         * @member {String} className='Portal.view.home.ContentBox'
         * @protected
         */
        className: 'Portal.view.home.ContentBox',
        /**
         * @member {String[]} baseCls=['portal-content-box']
         * @protected
         */
        baseCls: ['portal-content-box'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }
}

Neo.setupClass(ContentBox);

export default ContentBox;
