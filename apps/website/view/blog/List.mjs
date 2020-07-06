import {default as BaseList} from '../../../../src/list/Base.mjs';
import BlogPosts             from '../../store/BlogPosts.mjs';
import {default as VDomUtil} from '../../../../src/util/VDom.mjs';

/**
 * @class Website.view.blog.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getStaticConfig() {return {
        /**
         * A regex to enforce a maxLength (word break)
         * @member {RegExp} nameRegEx
         * @protected
         * @static
         */
        nameRegEx: /^(.{65}[^\s]*).*/
    }}
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.blog.List'
         * @protected
         */
        className: 'Website.view.blog.List',
        /**
         * @member {String[]} cls=['website-blog-list','neo-list-container','neo-list']
         */
        cls: ['website-blog-list', 'neo-list-container', 'neo-list'],
        /**
         * @member {Neo.data.Store} store=BlogPosts
         */
        store: BlogPosts
    }}

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        const vdomCn = [{
            cls: ['content'],
            cn : [{
                cls  : ['neo-full-size', 'preview-image'],
                style: {
                    backgroundImage: `url('https://raw.githubusercontent.com/neomjs/pages/master/resources/website/blog/${record.image}'), linear-gradient(#777, #333)`
                }
            }, {
                cls: ['neo-relative'],
                cn : [{
                    cls: ['neo-absolute', 'neo-item-bottom-position'],
                    cn : [{
                        cls   : ['neo-title'],
                        href  : record.url,
                        tag   : 'a',
                        target: '_blank',
                        cn    : [{
                            flag: 'name',
                            html: record.name.replace(List.nameRegEx, "$1")
                        }]
                    }, {
                        cls: ['neo-top-20'],
                        cn : [{
                            tag: 'img',
                            cls: ['neo-user-image'],
                            src: `https://raw.githubusercontent.com/neomjs/pages/master/resources/website/blogAuthor/${record.authorImage}`
                        }, {
                            cls: ['neo-inner-content'],
                            cn : [{
                                cls : ['neo-inner-details'],
                                flag: 'author',
                                cn  : [{
                                    cls : ['neo-bold'],
                                    tag : 'span',
                                    html: record.author
                                }]
                            }, {
                                cls : ['neo-inner-details'],
                                html: record.date
                            }]
                        }]
                    }]
                }]
            }]
        }];

        if (record.publisher.length > 0) {
            VDomUtil.getByFlag(vdomCn[0], 'author').cn.push({
                vtype: 'text',
                html : ' in '
            }, {
                cls : ['neo-bold'],
                tag : 'span',
                html: record.publisher
            });
        }

        if (record.selectedInto.length > 0) {
            vdomCn[0].cn[1].cn.unshift({
                cls: ['neo-absolute', 'neo-item-top-position'],
                cn : [{
                    html: `Officially selected by ${record.provider} into`
                }, {
                    cls : ['neo-bold'],
                    html: record.selectedInto.join('</br>')
                }]
            });
        }

        return vdomCn;
    }

    /**
     * Custom filtering logic
     * @param {Object} data
     */
    filterItems(data) {
        let me         = this,
            store      = me.store,
            valueRegEx = new RegExp(data.value, 'gi'),
            vdom       = me.vdom,
            itemName, name, record;

        vdom.cn.forEach((item, index) => {
            itemName = VDomUtil.getByFlag(item, 'name');
            record   = store.getAt(index);
            name     = record.name.replace(List.nameRegEx, "$1");

            item.style = item.style || {};

            if (!data.value || data.value === '') {
                itemName.html = name;
                delete item.style.display;
            } else if (name.toLowerCase().includes(data.value.toLowerCase())) {
                itemName.html = name.replace(valueRegEx, match => `<span class="neo-highlight-search">${match}</span>`);
                delete item.style.display;
            } else {
                item.style.display = 'none';
            }
        });

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(List);

export {List as default};