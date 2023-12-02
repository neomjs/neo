import Component from '../../../component/Base.mjs';
import NeoArray  from '../../../util/Array.mjs';

/**
 * Base class for form field Triggers
 * @class Neo.form.field.trigger.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    /**
     * Valid values for align
     * @member {String[]} alignValues=['end', 'start']
     * @protected
     * @static
     */
    static alignValues = ['end', 'start']

    static config = {
        /**
         * @member {String} className='Neo.form.field.trigger.Base'
         * @protected
         */
        className: 'Neo.form.field.trigger.Base',
        /**
         * @member {String} ntype='trigger'
         * @protected
         */
        ntype: 'trigger',
        /**
         * @member {String} align_='end'
         */
        align: 'end',
        /**
         * @member {String[]} baseCls=['neo-field-trigger']
         */
        baseCls: ['neo-field-trigger'],
        /**
         * @member {Neo.form.field.Base|null} field=null
         */
        field: null,
        /**
         * @member {String|null} iconCls_=null
         */
        iconCls_: null,
        /**
         * @member {Boolean} isHovered=false
         * @protected
         */
        isHovered: false,
        /**
         * The scope of the trigger handler
         * @member {Neo.core.Base|null} scope=null
         */
        scope: null,
        /**
         * @member {Boolean} showOnHover=false
         */
        showOnHover: false,
        /**
         * Internal flag used by field.getTrigger()
         * @member {String} type='base'
         * @protected
         */
        type: 'base',
        /**
         * @member {Object} _vdom={tabIndex: -1}
         */
        _vdom:
        {tabIndex: -1},
        /**
         * @member {Number} weight_=10
         */
        weight_: 10
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners(
            {click: me.onTriggerClick, scope: me}
        );

        if (me.showOnHover) {
            me.hidden = true;

            me.field.on('constructed', () => {
                me.field.addDomListeners([
                    {mouseenter: me.onMouseEnter, scope: me},
                    {mouseleave: me.onMouseLeave, scope: me}
                ]);
            }, me);
        }
    }

    /**
     * Triggered after the align config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAlign(value, oldValue) {
        let cls = this.cls;

        NeoArray[value === 'start' ? 'add' : 'remove'](cls, 'neo-align-start');
        this.cls = cls;
    }

    /**
     * Triggered after the hidden config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHidden(value, oldValue) {
        let style = this.style;

        style.display = value ? 'none' : 'inherit';
        this.style = style;
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        let cls = this.cls;

        NeoArray.remove(cls, oldValue);

        if (value && value !== '') {
            NeoArray.add(cls, value);
        }

        this.cls = cls;
    }

    /**
     * Triggered before the align config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetAlign(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'align', 'alignValues');
    }

    /**
     * @param {Boolean} updateParentVdom
     * @param {Boolean} silent
     */
    destroy(updateParentVdom, silent) {
        let me = this;

        me.removeDomListeners(
            {click: me.onTriggerClick, scope: me}
        );

        delete me.field;

        super.destroy(updateParentVdom, silent);
    }

    /**
     *
     */
    onMouseEnter() {
        this.isHovered = true;
        this.hidden    = false;
    }

    /**
     *
     */
    onMouseLeave() {
        this.isHovered = false;
        this.hidden    = true;
    }

    /**
     * click domEvent listener
     * @param {Object} data
     * @protected
     */
    onTriggerClick(data) {
        let me    = this,
            scope = me.scope || me;

        if (me.handler) {
            scope[me.handler].call(scope);
        }
    }
}

Neo.applyClassConfig(Base);

export default Base;
