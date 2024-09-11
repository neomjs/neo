import BaseList from '../../../../src/list/Base.mjs';
import Examples from '../../store/Examples.mjs';

/**
 * @class Portal.view.examples.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    /**
     * A regex to enforce a maxLength (word break)
     * @member {RegExp} nameRegEx
     * @protected
     * @static
     */
    static nameRegEx = /^(.{65}[^\s]*).*/

    static config = {
        /**
         * @member {String} className='Portal.view.examples.List'
         * @protected
         */
        className: 'Portal.view.examples.List',
        /**
         * @member {String[]} baseCls=['portal-examples-list','neo-list']
         */
        baseCls: ['portal-examples-list', 'neo-list'],
        /**
         * @member {String} baseUrl='https://neomjs.com/'
         */
        baseUrl: 'https://neomjs.com/',
        /**
         * @member {Neo.data.Store} store=Examples
         */
        store: Examples,
        /**
         * @member {String|null} storeUrl_=null
         */
        storeUrl_: null,
        /**
         * @member {String} sourceBaseUrl='https://github.com/neo.mjs/neo/tree/dev/'
         */
        sourceBaseUrl: 'https://github.com/neo.mjs/neo/tree/dev/',
        /**
         * @member {Boolean} useWrapperNode=true
         */
        useWrapperNode: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'ul', cn: []}
        ]}
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (value) {
            if (value.isClass) {
                value = {
                    module: value,
                    url   : this.storeUrl
                };
            } else if (Neo.isObject(value)) {
                value.url = this.storeUrl;
            }
        }

        return super.beforeSetStore(value, oldValue);
    }

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        let basePath;

        if (Neo.config.isGitHubPages) {
            basePath = '../../../../resources_pub/website/examples';

            if (Neo.config.environment !== 'development') {
                basePath = '../../' + basePath
            }
        } else {
            basePath = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/website/examples'
        }

        return [
            {cls: ['content', 'neo-relative'], cn: [
                {cls: ['neo-full-size', 'preview-image'], style: {
                    backgroundImage: `url('${basePath}/${record.image}'), linear-gradient(#777, #333)`}
                },
                {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                    {tag: 'a', cls: ['neo-title'], href: this.baseUrl + record.url, target: '_blank', cn: [
                        {html: record.name.replace(List.nameRegEx, "$1")}
                    ]},
                    {cls: ['neo-top-20'], cn: [
                        {tag: 'a', cls: ['fab fa-github', 'neo-github-image'], href: this.sourceBaseUrl + record.sourceUrl, target: '_blank'},
                        {cls: ['neo-inner-content'], cn: [
                            {cls: ['neo-inner-details'], html: record.browsers.join(', ')},
                            {cls: ['neo-inner-details'], html: record.environments.join(', ')}
                        ]}
                    ]}
                ]}
            ]}
        ]
    }

    /**
     * @returns {Object}
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @returns {Object}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }
}

export default Neo.setupClass(List);
