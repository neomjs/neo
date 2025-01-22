import Base   from '../core/Base.mjs';
import Logger from '../util/Logger.mjs';
import Model  from './Model.mjs';

const
    dataSymbol        = Symbol.for('data'),
    initialDataSymbol = Symbol.for('initialData');

let instance;

/**
 * @class Neo.data.RecordFactory
 * @extends Neo.core.Base
 * @singleton
 */
class RecordFactory extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.RecordFactory'
         * @protected
         */
        className: 'Neo.data.RecordFactory',
        /**
         * @member {String} recordNamespace='Neo.data.record'
         */
        recordNamespace: 'Neo.data.record',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} data
     * @param {Object} data.field
     * @param {Neo.data.RecordFactory} data.me
     * @param {Neo.data.Model} data.model
     * @param {String} data.path=''
     */
    createField({field, me, model, path=''}) {
        let fieldName = field.name,
            fieldPath = path === '' ? fieldName : `${path}.${fieldName}`,
            properties;

        if (field.fields) {
            field.fields.forEach(childField => {
                this.createField({field: childField, me, model, path: fieldPath})
            })
        } else {
            properties = {
                [fieldPath]: {
                    configurable: true,
                    enumerable  : true,
                    get() {
                        if (model.hasNestedFields) {
                            return Neo.ns(fieldPath, false, this[dataSymbol])
                        }

                        return this[dataSymbol][fieldName]
                    },
                    set(value) {
                        let me       = this,
                            oldValue = me[dataSymbol][fieldName];

                        value = instance.parseRecordValue(me, field, value);

                        if (!Neo.isEqual(value, oldValue)) {
                            instance.setRecordData({fieldName: fieldPath, model, record: me, value});

                            me._isModified = true;
                            me._isModified = instance.isModified(me, model.trackModifiedFields);

                            instance.onRecordChange({
                                fields: [{name: fieldPath, oldValue, value}],
                                model,
                                record: me
                            })
                        }
                    }
                }
            };

            Object.defineProperties(me, properties)
        }
    }

    /**
     * @param {Neo.data.Model} model
     * @param {Object} config
     * @returns {Object}
     */
    createRecord(model, config) {
        let recordClass = Neo.ns(`${this.recordNamespace}.${model.className}.${model.id}`);

        if (!recordClass) {
            recordClass = this.createRecordClass(model)
        }

        return new recordClass(config)
    }

    /**
     * @param {Neo.data.Model} model
     * @param {Boolean} overwrite=false
     * @returns {Object}
     */
    createRecordClass(model, overwrite=false) {
        if (model instanceof Model) {
            let className = `${this.recordNamespace}.${model.className}.${model.id}`,
                ns        = Neo.ns(className),
                key, nsArray, cls;

            if (!ns || overwrite) {
                nsArray = className.split('.');
                key     = nsArray.pop();
                ns      = Neo.ns(nsArray, true);
                cls     = ns[key] = class Record {
                    // We do not want to minify the ctor class name in dist/production
                    static name = 'Record';

                    [dataSymbol] = {}

                    /**
                     * @param {Object} config
                     */
                    constructor(config) {
                        let me = this;

                        if (model.trackModifiedFields) {
                            me[initialDataSymbol] = {};
                            me.setInitial(config)
                        }

                        me.setSilent(config); // We do not want to fire change events when constructing
                        me._isModified = false
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    set(fields) {
                        instance.setRecordFields({fields, model, record: this})
                    }

                    /**
                     * If the model uses trackModifiedFields, we will store the initial data
                     * for tracking the dirty state (changed fields)
                     * @param {Object} fields
                     * @protected
                     */
                    setInitial(fields) {
                        instance.setRecordFields({fields, model, record: this, silent: true, useInitialData: true})
                    }

                    /**
                     * Bulk-update multiple record fields at once without triggering a change event
                     * @param {Object} fields
                     */
                    setSilent(fields) {
                        instance.setRecordFields({fields, model, record: this, silent: true})
                    }

                    /**
                     * When using JSON.stringify(this), we want to get the raw data
                     * @returns {Object}
                     */
                    toJSON() {
                        return this[dataSymbol]
                    }
                };

                if (Array.isArray(model.fields)) {
                    model.fields.forEach(field => {
                        instance.createField({field, me: cls.prototype, model})
                    })
                }

                Object.defineProperty(cls.prototype, 'isRecord', {value: true});
                Object.defineProperty(cls, 'isClass', {value: true});

                return ns[key]
            }

            return ns
        }
    }

    /**
     * @param {Object} record
     * @param {Boolean} trackModifiedFields
     * @returns {Boolean} true in case a change was found
     */
    isModified(record, trackModifiedFields) {
        if (trackModifiedFields) {
            return Neo.isEqual(record[dataSymbol], record[initialDataSymbol])
        }

        return record._isModified
    }

    /**
     * @param {Object} record
     * @param {String} fieldName
     * @returns {Boolean|null} null in case the model does not use trackModifiedFields, true in case a change was found
     */
    isModifiedField(record, fieldName) {
        if (!record.hasOwnProperty(fieldName)) {
            Logger.logError('The record does not contain the field', fieldName, record)
        }

        let modifiedField = this.ovPrefix + fieldName;

        if (record.hasOwnProperty(modifiedField)) {
            return !Neo.isEqual(record[fieldName], record[modifiedField])
        }

        return null
    }

    /**
     * Tests if a given object is an instance of a class created by this factory
     * @param {Object} record
     * @returns {Boolean}
     */
    isRecord(record) {
        return record?.isRecord || false
    }

    /**
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     */
    onRecordChange(opts) {
        Neo.get(opts.model.storeId)?.onRecordChange(opts)
    }

    /**
     * todo: parse value for more field types
     * @param {Object} record
     * @param {Object} field
     * @param {*} value
     * @param {Object} recordConfig=null
     * @returns {*}
     */
    parseRecordValue(record, field, value, recordConfig=null) {
        if (field.calculate) {
            return field.calculate(record, field, recordConfig)
        }

        if (field.convert) {
            value = field.convert(value)
        }

        let fieldName = field.name,
            {mapping, maxLength, minLength, nullable} = field,
            oldValue  = recordConfig?.[fieldName] || record[fieldName],
            type      = field.type?.toLowerCase();

        // only trigger mappings for initial values
        // dynamic changes of a field will not pass the recordConfig
        if (mapping && recordConfig) {
            let ns  = mapping.split('.'),
                key = ns.pop();

            ns    = Neo.ns(ns, true, recordConfig);
            value = ns[key]
        }

        if (Object.hasOwn(field, 'maxLength')) {
            if (value?.toString().length > maxLength) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with maxLength: ${maxLength}`);
                return oldValue
            }
        }

        if (Object.hasOwn(field, 'minLength')) {
            if (value?.toString().length < minLength) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with minLength: ${minLength}`);
                return oldValue
            }
        }

        if (Object.hasOwn(field, 'nullable')) {
            if (nullable === false && value === null) {
                console.warn(`Setting record field: ${fieldName} value: ${value} conflicts with nullable: ${nullable}`);
                return oldValue
            }
        }

        if (type === 'date' && Neo.typeOf(value) !== 'Date') {
            return new Date(value)
        }

        else if (type === 'float' && value) {
            value = parseFloat(value)
        }

        else if (type === 'html' && value) {
            value = value + ''
        }

        else if ((type === 'int' || type === 'integer') && value) {
            value = parseInt(value)
        }

        else if (type === 'string' && value) {
            value = value + '';
            value =  value.replace(/(<([^>]+)>)/ig, '')
        }

        return value
    }

    /**
     * @param {Object}         data
     * @param {String}         data.fieldName
     * @param {Neo.data.Model} data.model
     * @param {Record}         data.record
     * @param {*}              data.value
     * @param {Boolean}        data.useInitialData=false true will apply changes to the initialData symbol
     * @protected
     */
    setRecordData({fieldName, model, record, useInitialData=false, value}) {
        let scope = useInitialData ? initialDataSymbol : dataSymbol;

        if (model.hasNestedFields && fieldName.includes('.')) {
            let ns, nsArray;

            nsArray   = fieldName.split('.');
            fieldName = nsArray.pop();
            ns        = Neo.ns(nsArray, true, record[scope]);

            ns[fieldName] = value
        } else {
            record[scope][fieldName] = value
        }
    }

    /**
     * @param {Object}         data
     * @param {Object[]}       data.changedFields=[] Internal flag
     * @param {Object}         data.fields
     * @param {Neo.data.Model} data.model
     * @param {Object}         data.record
     * @param {Boolean}        data.silent=false
     * @param {Boolean}        data.useInitialData=false true will apply changes to the initialData symbol
     */
    setRecordFields({changedFields=[], fields, model, record, silent=false, useInitialData=false}) {
        let {fieldsMap} = model,
            fieldExists, oldValue;

        Object.entries(fields).forEach(([key, value]) => {
            fieldExists = fieldsMap.has(key);

            if (Neo.isObject(value) && !fieldExists) {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    this.setRecordFields({
                        changedFields,
                        fields: {[`${key}.${childKey}`]: childValue},
                        model,
                        record,
                        silent: true,
                        useInitialData
                    })
                })
            } else if (fieldExists) {
                oldValue = record[key];
                value    = instance.parseRecordValue(record, model.getField(key), value);

                if (!Neo.isEqual(oldValue, value)) {
                    instance.setRecordData({fieldName: key, model, record, useInitialData, value});

                    record._isModified = true;
                    changedFields.push({name: key, oldValue, value})
                }
            }
        });

        if (!silent && Object.keys(changedFields).length > 0) {
            Neo.get(model.storeId)?.onRecordChange({fields: changedFields, model, record})
        }
    }
}

instance = Neo.setupClass(RecordFactory);

export default instance;
