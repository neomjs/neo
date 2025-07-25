import Component from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld2.view.article.TagListComponent
 * @extends Neo.component.Base
 */
class TagListComponent extends Component {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='RealWorld2.view.article.TagListComponent'
         * @protected
         */
        className: 'RealWorld2.view.article.TagListComponent',
        /**
         * @member {String|null} activeTag_
         * @reactive
         */
        activeTag_: null,
        /**
         * @member {String[]} baseCls=['rw2-taglist-component']
         */
        baseCls: ['rw2-taglist-component'],
        /**
         * @member {String[]} tags_=[]
         * @reactive
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
                    text: 'Popular Tags'
                }, {
                    cls: ['tag-list']
                }]
            }]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.DomEvents.registerPreventDefaultTargets({
            name: 'click',
            cls : 'tag-pill'
        });

        let me = this;

        me.addDomListeners({
            click: {
                fn      : me.onTagLinkClick,
                delegate: '.tag-pill',
                scope   : me
            }
        });
    }

    /**
     * Triggered after the activeTag config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetActiveTag(value, oldValue) {
        if (oldValue !== undefined) {
            this.fire('tagChange', {
                oldValue: oldValue,
                value   : value
            });
        }
    }

    /**
     * Triggered after the tags config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetTags(value, oldValue) {
        let me = this;

        me.vdom.cn[0].cn[1].cn = [];

        if (Array.isArray(value)) {
            value.forEach(item => {
                me.vdom.cn[0].cn[1].cn.push({
                    tag : 'a',
                    cls : ['tag-pill', 'tag-default'],
                    href: '',
                    text: item,
                    id  : me.getTagVdomId(item)
                });
            });

            me.update();
        }
    }

    /**
     * @param {String} nodeId
     * @returns {String}
     */
    getTagId(nodeId) {
        return nodeId.split('__')[1];
    }

    /**
     * @param {String} name
     * @returns {String}
     */
    getTagVdomId(name) {
        return this.id + '__' + name;
    }

    /**
     * @param {Object} data
     */
    onTagLinkClick(data) {
        this.activeTag = this.getTagId(data.path[0].id);
    }
}

export default Neo.setupClass(TagListComponent);
