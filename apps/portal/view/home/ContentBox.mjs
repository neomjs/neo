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
         * @reactive
         */
        content_: null,
        /**
         * @member {String|null} header_=null
         * @reactive
         */
        header_: null,
        /**
         * @member {String|null} route_=null
         * @reactive
         */
        route_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'a', cn: [
            {tag: 'h4', cls: ['portal-content-box-headline']},
            {tag: 'div', cls: ['portal-content-box-content'], cn: [
                {tag: 'ul', cn: []}
            ]}
        ]}
    }

    /**
     * Triggered after the content config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetContent(value, oldValue) {
        let list = this.vdom.cn[1].cn[0];

        list.cn = [];

        value?.forEach(item => {
            list.cn.push({tag: 'li', text: item})
        });

        this.update()
    }

    /**
     * Triggered after the header config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHeader(value, oldValue) {
        this.vdom.cn[0].text = value;
        this.update()
    }

    /**
     * Triggered after the route config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRoute(value, oldValue) {
        this.vdom.href = value;
        this.update()
    }
}

export default Neo.setupClass(ContentBox);
