import Base from '../../../../src/component/Base.mjs';

/**
 * @class LearnNeo.view.home.ContentComponent
 * @extends Neo.component.Base
 */
class ContentComponent extends Base {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.ContentComponent'
         * @protected
         */
        className: 'LearnNeo.view.home.ContentComponent',
        /**
         * @member {String[]} baseCls=['learn-content']
         * @protected
         */
         baseCls: ['learn-content']
    }
}

Neo.applyClassConfig(ContentComponent);

export default ContentComponent;
