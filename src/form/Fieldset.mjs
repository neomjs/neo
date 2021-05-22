import Container from '../container/Base.mjs';
import Legend    from '../component/Legend.mjs';

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
         * @member {Boolean} collapsible_=true,
         */
        collapsible_: true,
        /**
         * @member {String} iconCls_='far fa-check-square'
         */
        iconCls_: 'far fa-check-square',
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
     * Triggered after the collapsible config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCollapsible(value, oldValue) {
        if (value) {
            let me           = this,
                domListeners = me.domListeners || [];

            domListeners.push({
                click   : me.onLegendClick,
                delegate: 'neo-legend',
                scope   : me.handlerScope || me
            });

            me.domListeners = domListeners;
        }
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        this.updateLegend();
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
     * @param {Object} data
     */
    onLegendClick(data) {
        console.log('onLegendIconClick', data);
    }

    /**
     *
     */
    updateLegend() {
        let me      = this,
            items   = me.items,
            iconCls = me.iconCls,
            title   = me.title;

        if (iconCls === '' && title === '') {
            if (me.legend) {
                me.removeAt(0);
            }
        } else {
            if (me.legend) {
                items[0].iconCls = iconCls;
                items[0].text    = title;
            } else {
                me.legend = me.insert(0, {
                    module : Legend,
                    iconCls: me.iconCls,
                    text   : me.title
                });
            }
        }
    }
}

Neo.applyClassConfig(Fieldset);

export {Fieldset as default};
