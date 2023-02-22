import BaseContainer    from '../container/Base.mjs';
import BaseField        from '../form/field/Base.mjs';
import ComponentManager from '../manager/Component.mjs';

/**
 * @class Neo.form.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.form.Container'
         * @protected
         */
        className: 'Neo.form.Container',
        /**
         * @member {String} ntype='form-container'
         * @protected
         */
        ntype: 'form-container',
        /**
         * @member {String[]} baseCls=['neo-form-container'],
         * @protected
         */
        baseCls: ['neo-form-container'],
        /**
         * @member {Object} vdom={tag: 'form',cn:[],onsubmit:'return false;'}
         */
        vdom:
        {tag: 'form', cn: [], onsubmit: 'return false;'}
    }

    /**
     * @returns {Object[]}
     */
    findNotLoadedModules(parent=this) {
        let modules = [];

        parent.items.forEach(item => {
            if (Neo.typeOf(item.module) === 'Function') {
                modules.push({item, parent});
            } else {
                item.items && this.findNotLoadedModules(item);
            }
        });

        return modules;
    }

    /**
     * Either pass a field id or name
     * @param {String} name
     * @returns {Neo.form.field.Base|null} fields
     */
    getField(name) {
        let fields = ComponentManager.getChildComponents(this),
            field;

        for (field of fields) {
            if (field instanceof BaseField) {
                if (field.name === name || field.id === name) {
                    return field;
                }
            }
        }

        return null;
    }

    /**
     * @returns {Neo.form.field.Base[]} fields
     */
    getFields() {
        let fields = [];

        this.findNotLoadedModules();

        ComponentManager.getChildComponents(this).forEach(item => {
            item instanceof BaseField && fields.push(item);
        });

        return fields;
    }

    /**
     * @returns {Object}
     */
    getSubmitValues() {
        let values = {};

        this.getFields().forEach(item => {
            values[item.name || item.id] = item.getSubmitValue();
        });

        return values;
    }

    /**
     * @returns {Object}
     */
    getValues() {
        let values = {};

        this.getFields().forEach(item => {
            values[item.name || item.id] = item.value;
        });

        return values;
    }

    /**
     * Returns true in case no form field isValid() call returns false
     * @returns {Boolean}
     */
    isValid() {
        let fields = this.getFields(),
            i      = 0,
            len    = fields.length;

        for (; i < len; i++) {
            if (!fields[i].isValid()) {
                return false;
            }
        }

        return true;
    }

    /**
     * Resets field values by field name or field id.
     * Fields not included with a value will get reset to null.
     * @param {Object} [values]
     */
    reset(values={}) {
        let keys = values ? Object.keys(values) : [],
            index;

        this.getFields().forEach(item => {
            index = keys.indexOf(item.name);

            if (index < 0) {
                index = keys.indexOf(item.id);
            }

            item.reset(index > -1 ? values[keys[index]] : null);
        });
    }

    /**
     * Set field values by field name or field id
     * @param {Object} values={}
     */
    setValues(values={}) {
        let keys = Object.keys(values),
            index;

        this.getFields().forEach(item => {
            index = keys.indexOf(item.name);

            if (index < 0) {
                index = keys.indexOf(item.id);
            }

            if (index > -1) {
                item.value = values[keys[index]];
            }
        });
    }

    /**
     * Updates the invalid state for all fields which have validate() implemented.
     * This can be useful for create-entity forms which show up "clean" until pressing a submit button.
     * @returns {Boolean}
     */
    validate() {
        let isValid = true,
            validField;

        this.getFields().forEach(item => {
            validField = item.validate?.(false);

            if (!validField) {
                isValid = false;
            }
        });

        return isValid;
    }
}

Neo.applyClassConfig(Container);

export default Container;
