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
     * @param {Neo.container.Base} parent
     * @param {Object[]} modules
     * @returns {Object[]}
     */
    findNotLoadedModules(parent=this, modules=[]) {
        parent.items.forEach(item => {
            if (Neo.typeOf(item.module) === 'Function' && !item.isLoading) {
                modules.push({item, parent});
            } else {
                item.items && this.findNotLoadedModules(item, modules);
            }
        });

        return modules;
    }

    /**
     * Either pass a field name or id
     * @param {String} name
     * @returns {Promise<Neo.form.field.Base|null>} fields
     */
    async getField(name) {
        await this.loadModules();

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
     * @param {Neo.form.field.Base} field
     * @returns {String}
     */
    getFieldPath(field) {
        let path = field.formGroup ? field.formGroup.split('.') : [];

        path.push(field.name || field.id);

        return path.join('.');
    }

    /**
     * @returns {Promise<Neo.form.field.Base[]>} fields
     */
    async getFields() {
        let fields = [];

        await this.loadModules();

        ComponentManager.getChildComponents(this).forEach(item => {
            item instanceof BaseField && fields.push(item);
        });

        return fields;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getValues() {
        let fields = await this.getFields(),
            values = {},
            itemName, key, ns, nsArray, value;

        fields.forEach(item => {
            value = item.getValue();

            if (item.name) {
                itemName = item.name;

                if (item.formGroup) {
                    itemName = item.formGroup + '.' + itemName;
                }

                nsArray = itemName.split('.');
                key     = nsArray.pop();
                ns      = Neo.nsWithArrays(nsArray, true, values);
            } else {
                key = item.id;
                ns  = values;
            }

            /*
             * CheckBoxes need custom logic
             * => we only want to pass the uncheckedValue in case the field does not belong to a group
             * (multiple fields using the same name)
             */
            if (Object.hasOwn(ns, key) && value !== undefined) {
                if (ns[key] === field.uncheckedValue) {
                    ns[key] = []
                } else if (!Array.isArray(ns[key])) {
                    ns[key] = [ns[key]]
                }

                value !== field.uncheckedValue && ns[key].unshift(value)
            } else if (value !== undefined) {
                ns[key] = value
            }
        });

        return values;
    }

    /**
     * Returns true in case no form field isValid() call returns false
     * @returns {Promise<Boolean>}
     */
    async isValid() {
        let fields = await this.getFields(),
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
     * Loads all not loaded items inside card layouts
     * @returns {Promise<Neo.component.Base[]>}
     */
    async loadModules() {
        let me       = this,
            modules  = me.findNotLoadedModules(),
            promises = [];

        modules.forEach(module => {
            promises.push(module.parent.layout.loadModule(module.item));
        });

        modules = await Promise.all(promises);

        return modules;
    }

    /**
     * Resets field values by field name or field id.
     * Fields not included with a value will get reset to null.
     * @param {Object} [values]
     */
    async reset(values={}) {
        let me     = this,
            fields = await me.getFields(),
            path, value;

        fields.forEach(item => {
            path  = me.getFieldPath(item);
            value = Neo.nsWithArrays(path, false, values);

            item.reset(path ? value : null);
        })
    }

    /**
     * Set field values by field name or field id
     * @param {Object} values={}
     * @param {Boolean} suspendEvents=false
     */
    async setValues(values={}, suspendEvents=false) {
        let me     = this,
            fields = await me.getFields(),
            isRadio, path, value;

        fields.forEach(item => {
            if (suspendEvents) {
                item.suspendEvents = true;
            }

            path  = me.getFieldPath(item);
            value = Neo.nsWithArrays(path, false, values);

            if (Neo.typeOf(value) === 'Array') {
                // form.field.CheckBox
                if (value.includes(item.value)) {
                    item.checked = true;
                }
            } else if (value !== undefined) {
                isRadio = Neo.form.field?.Radio && item instanceof Neo.form.field.Radio;

                if (isRadio) {
                    item.checked = item.value === value;
                } else {
                    item.value = value;
                }
            }

            if (suspendEvents) {
                delete item.suspendEvents;
            }
        })
    }

    /**
     * Updates the invalid state for all fields which have validate() implemented.
     * This can be useful for create-entity forms which show up "clean" until pressing a submit button.
     * @returns {Promise<Boolean>}
     */
    async validate() {
        let isValid = true,
            fields  = await this.getFields(),
            validField;

        fields.forEach(item => {
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
