import Base     from './Base.mjs';
import Toolbar  from '../toolbar/Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.container.AccordionItem
 * @extends Neo.container.Base
 */
class AccordionContainer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.container.AccordionItem'
         * @protected
         */
        className: 'Neo.container.AccordionItem',
        /**
         * @member {String} ntype='accordionitem'
         * @protected
         */
        ntype: 'accordionitem',
        /**
         * @member {String[]} baseCls=['neo-accordion-component']
         */
        baseCls: ['neo-accordion-item'],

        /**
         * Additional cls for the arrow, in case you need to customize it
         * @member {String[]|String|null} arrowCls=null
         */
        arrowCls: null,
        /**
         * Expand or collapse (true/false) this value
         * @member {Boolean} expanded=false
         */
        expanded_: false,
        /**
         * cls for the icon in front of the title
         * May be empty. 'fa' is preset,
         * so if you use fontawesome you do not have to add it.
         *
         * @member {String[]|String|null} iconCls=null
         */
        iconCls_: null,
        /**
         * Title for Headerbar
         * @member {String|null} title=null
         */
        title_: null
    }

    /**
     * Runs after afterSetTitle, so that the title component does not exist prior.
     * @protected
     */
    createItems() {
        let me       = this,
            arrowCls = me.arrowCls || 'fa-caret-down',
            iconCls  = me.iconCls || ['no-icon'],
            items    = me.items,
            title    = me.title,
            header, content;

        if (!Neo.isArray(iconCls)) {
            iconCls = iconCls.split(' ')
        }

        if (!Neo.isArray(arrowCls)) {
            arrowCls = arrowCls.split(' ')
        }

        header = Neo.create({
            module: Toolbar,
            items : [{
                flag   : 'iconEl',
                ntype  : 'component',
                baseCls: ['neo-accordion-header-icon'],
                cls    : ['fa', ...iconCls],
            }, {
                flag   : 'titleEl',
                ntype  : 'component',
                baseCls: ['neo-accordion-header-title'],
                html   : title
            }, {
                ntype  : 'component',
                baseCls: ['neo-accordion-header-arrow'],
                cls    : ['fa', ...arrowCls]
            }]
        });

        content = {
            ntype  : 'container',
            flag   : 'content',
            baseCls: ['neo-accordion-content', 'neo-container'],
            items  : items
        };

        me.items = [header, content];

        super.createItems();

        me.addDomListeners([
            {click: me.onExpandClick, delegate: 'neo-accordion-header-arrow'}
        ])
    }

    /**
     * After changing expanded, we expand/collapse via CSS
     * @param {Boolean} isExpanded
     */
    afterSetExpanded(isExpanded) {
        let me  = this,
            cls = me.cls,
            fn  = isExpanded ? 'add' : 'remove';

        NeoArray[fn](cls, 'neo-expanded');
        me.cls = cls;

        // Ensure scrollbars are not flipping in and out
        me.timeout(450).then(() => {
            NeoArray[fn](cls, 'neo-scrollable');
            me.cls = cls;
        })
    }

    /**
     * The initial title is set before the component is created,
     * so we have to check if it exists.
     *
     * @param {String[]|String} newValue
     * @param {String[]} oldValue
     */
    afterSetIconCls(newValue, oldValue) {
        let iconEl = this.down({flag: 'iconEl'});

        if (iconEl) {
            let cls = iconEl.cls;

            if (!Neo.isArray(newValue)) {
                newValue = newValue.split(' ')
            }

            NeoArray.remove(cls, oldValue);
            NeoArray.add(cls, newValue);
            iconEl.cls = cls;
        }
    }

    /**
     * The initial title is set before the component is created,
     * so we have to check if it exists.
     *
     * @param {String} newValue
     */
    afterSetTitle(newValue) {
        let titleEl = this.down({flag: 'titleEl'});

        if (titleEl) titleEl.html = newValue;
    }

    /**
     * If the parent is an AccordionContainer, we run the parent function.
     * Otherwise we set this.expanded to the new value.
     */
    onExpandClick() {
        let me           = this,
            currentState = me.expanded,
            parent       = me.up('accordion');

        if (parent.ntype === 'accordion') {
            parent.childExpandChange({
                expanded: !currentState,
                target  : me
            });
        } else {
            me.expanded = !currentState;
        }
    }
}

Neo.setupClass(AccordionContainer);

export default AccordionContainer;
