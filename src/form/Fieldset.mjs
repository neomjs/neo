import Container from '../container/Base.mjs';
import Legend    from '../component/Legend.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.form.Fieldset
 * @extends Neo.container.Base
 */
class Fieldset extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.Fieldset'
         * @protected
         */
        className: 'Neo.form.Fieldset',
        /**
         * @member {String} ntype='fieldset'
         * @protected
         */
        ntype: 'fieldset',
        /**
         * @member {String[]} cls=['neo-fieldset'],
         * @protected
         */
        cls: ['neo-fieldset'],
        /**
         * @member {Boolean} collapsed_=false,
         */
        collapsed_: false,
        /**
         * @member {Boolean} collapsible_=true,
         */
        collapsible_: true,
        /**
         * @member {Boolean} hasLabelClickListener=false,
         * @protected
         */
        hasLabelClickListener: false,
        /**
         * @member {String} iconClsChecked_='far fa-check-square'
         */
        iconClsChecked_: 'far fa-check',
        /**
         * @member {String} iconClsUnchecked_='far fa-check-square'
         */
        iconClsUnchecked_: 'far fa-square',
        /**
         * @member {Neo.component.Legend|null} legend=null
         */
        legend: null,
        /**
         * @member {String} title_=''
         */
        title_: '',
        /**
         * @member {Object} _vdom={tag:'fieldset',cn:[]}
         */
        _vdom:
        {tag: 'fieldset', cn: []}
    }}

    /**
     * Triggered after the collapsed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCollapsed(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        NeoArray[value ? 'add' : 'remove'](me._cls, 'neo-collapsed');

        if (oldValue !== undefined) {
            me.items.forEach((item, index) => {
                if (index === 0) {
                    item.iconCls = value ? me.iconClsUnchecked : me.iconClsChecked
                } else {
                    item.vdom.removeDom = value;
                }
            });
        }

        me.vdom = vdom;
    }

    /**
     * Triggered after the collapsible config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCollapsible(value, oldValue) {
        let me           = this,
            cls          = me.cls,
            domListeners = me.domListeners || [];

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-collapsible');
        me.cls = cls;

        if (me.legend) {
            me.legend.useIcon = value;
        }

        if (value && !me.hasLabelClickListener) {
            me.hasLabelClickListener = true;

            domListeners.push({
                click   : me.onLegendClick,
                delegate: 'neo-legend',
                scope   : me.handlerScope || me
            });

            me.domListeners = domListeners;
        }
    }

    /**
     * Triggered after the iconClsChecked config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconClsChecked(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateLegend();
        }
    }

    /**
     * Triggered after the iconClsUnchecked config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconClsUnchecked(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateLegend();
        }
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        this.updateLegend();
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        if (this.collapsed) {
            this.afterSetCollapsed(true, false);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onLegendClick(data) {
        let me = this;

        if (me.collapsible) {
            me.collapsed = !me.collapsed;
        }
    }

    /**
     *
     */
    updateLegend() {
        let me      = this,
            iconCls = me.collapsed ? me.iconClsUnchecked : me.iconClsChecked,
            title   = me.title,
            vdom    = me.vdom;

        if (iconCls === '' && title === '') {
            if (me.legend) {
                me.legend.vdom.reomveDom = true;
            }
        } else {
            if (me.legend) {
                me.legend.setSilent({
                    iconCls: iconCls,
                    text   : title
                });

                delete me.legend.vdom.reomveDom;
            } else {
                me.legend = me.insert(0, {
                    module : Legend,
                    iconCls: iconCls,
                    text   : title
                });
            }
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Fieldset);

export {Fieldset as default};
