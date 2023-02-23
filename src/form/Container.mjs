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
            key, ns, nsArray;

        fields.forEach(item => {
            if (item.name) {
                nsArray = item.name.split('.');
                key     = nsArray.pop();
                ns      = Neo.ns(nsArray, true, values);
            } else {
                key = item.id;
                ns  = values;
            }

            if (Object.hasOwn(ns, key)) {
                if (!Array.isArray(ns[key])) {
                    ns[key] = [ns[key]]
                }

                ns[key].unshift(item.value)
            } else {
                ns[key] = item.value;
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
        let keys   = values ? Object.keys(values) : [],
            fields = await this.getFields(),
            index;

        fields.forEach(item => {
            index = keys.indexOf(item.name);

            if (index < 0) {
                index = keys.indexOf(item.id);
            }

            item.reset(index > -1 ? values[keys[index]] : null);
        })
    }

    /**
     * Set field values by field name or field id
     * @param {Object} values={}
     */
    async setValues(values={}) {
        let keys   = Object.keys(values),
            fields = await this.getFields(),
            index;

        fields.forEach(item => {
            index = keys.indexOf(item.name);

            if (index < 0) {
                index = keys.indexOf(item.id);
            }

            if (index > -1) {
                item.value = values[keys[index]];
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
