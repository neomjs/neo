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
         * @member {String[]|null} content_=null
         */
        content_: null,
        /**
         * @member {String|null} header_=null
         */
        header_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'h3', cls: ['portal-content-box-headline']},
            {tag: 'ul', cls: ['portal-content-box-content'], cn: []}
        ]}
    }

    /**
     * Triggered after the content config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetContent(value, oldValue) {
        value?.forEach(item => {
            this.vdom.cn[1].cn.push({tag: 'li', html: item})
        })

        this.update()
    }

    /**
     * Triggered after the header config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHeader(value, oldValue) {
        this.vdom.cn[0].html = value;
        this.update()
    }
}

Neo.setupClass(ContentBox);

export default ContentBox;
