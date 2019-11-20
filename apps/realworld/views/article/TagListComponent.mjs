import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.article.TagListComponent
 * @extends Neo.component.Base
 */
class TagListComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.article.TagListComponent'
         * @private
         */
        className: 'RealWorld.views.article.TagListComponent',
        /**
         * @member {String} ntype='realworld-article-taglistcomponent'
         * @private
         */
        ntype: 'realworld-article-taglistcomponent',
        /**
         * @member {String[]} cls=['col-md-3']
         */
        cls: ['col-md-3'],
        /**
         * @member {String[]} tags_=[]
         */
        tags_: [],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['sidebar'],
                cn : [{
                    tag : 'p',
                    html: 'Popular Tags'
                }, {
                    cls: ['tag-list']
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        Neo.main.DomEvents.registerPreventDefaultTarget({
            name: 'click',
            cls : 'tag-pill'
        });
    }

    /**
     * Triggered after the tags config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @private
     */
    afterSetTags(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[0].cn[1].cn = [];

        if (Array.isArray(value)) {
            value.forEach(item => {
                vdom.cn[0].cn[1].cn.push({
                    tag : 'a',
                    cls : ['tag-pill', 'tag-default'],
                    href: '',
                    html: item,
                    id  : me.getTagId(item)
                });
            });

            me.vdom = vdom;
        }
    }

    /**
     *
     * @param {String} name
     * @returns {String}
     */
    getTagId(name) {
        return this.id + '__' + name;
    }
}

Neo.applyClassConfig(TagListComponent);

export {TagListComponent as default};