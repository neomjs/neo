import Base   from '../core/Base.mjs';
import Logger from '../util/Logger.mjs';
import Model  from './Model.mjs';

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
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * The internal record prefix for original field values.
         * Only used in case the model has trackModifiedFields set to true.
         * @member {String} ovPrefix='ov_'
         */
        ovPrefix: 'ov_',
        /**
         * @member {String} recordNamespace='Neo.data.record'
         */
        recordNamespace: 'Neo.data.record'
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
     * @returns {Object}
     */
    createRecordClass(model) {
        if (model instanceof Model) {
            let className = `${this.recordNamespace}.${model.className}.${model.id}`,
                ns        = Neo.ns(className),
                key, nsArray, cls;

            if (!ns) {
                nsArray = className.split('.');
                key     = nsArray.pop();
                ns      = Neo.ns(nsArray, true);
                cls     = ns[key] = class Record {
                    // We do not want to minify the ctor class name in dist/production
                    static name = 'Record'

                    constructor(config) {
                        let me = this,
                            properties;

                        Object.defineProperties(me, {
                            _isModified: {
                                value   : false,
                                writable: true
                            }
                        });

                        if (Array.isArray(model.fields)) {
                            model.fields.forEach(field => {
                                let value  = config[field.mapping || field.name],
                                    symbol = Symbol.for(field.name),
                                    parsedValue;

                                if (!Object.hasOwn(config, field.name) && Object.hasOwn(field, 'defaultValue')) {
                                    value = field.defaultValue
                                }

                                parsedValue = instance.parseRecordValue(me, field, value, config);

                                properties = {
                                    [symbol]: {
                                        value   : parsedValue,
                                        writable: true
                                    },
                                    [field.name]: {
                                        configurable: true,
                                        enumerable  : true,
                                        get() {
                                            return this[symbol]
                                        },
                                        set(value) {
                                            let me       = this,
                                                oldValue = me[symbol];

                                            value = instance.parseRecordValue(me, field, value);

                                            if (!Neo.isEqual(value, oldValue)) {
                                                me[symbol] = value;

                                                me._isModified = true;
                                                me._isModified = instance.isModified(me, model.trackModifiedFields);

                                                instance.onRecordChange({
                                                    fields: [{name: field.name, oldValue, value}],
                                                    model,
                                                    record: me
                                                })
                                            }
                                        }
                                    }
                                };

                                // adding the original value of each field
                                if (model.trackModifiedFields) {
                                    properties[instance.ovPrefix + field.name] = {
                                        value: parsedValue
                                    }
                                }

                                Object.defineProperties(me, properties)
                            })
                        }
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    set(fields) {
                        instance.setRecordFields(model, this, fields)
                    }

                    /**
                     * Bulk-update multiple record fields at once without triggering a change event
                     * @param {Object} fields
                     */
                    setSilent(fields) {
                        instance.setRecordFields(model, this, fields, true)
                    }
                };

                Object.defineProperty(cls.prototype, 'isRecord', { value : true });
                Object.defineProperty(cls, 'isClass', { vale : true });

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
            let fields = Object.keys(record),
                i      = 0,
                len    = fields.length,
                field;

            for (; i < len; i++) {
                field = fields[i];

                if (!Neo.isEqual(record[field], record[this.ovPrefix + field])) {
                    return true
                }
            }

            return false
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
        return record?.isRecord
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
     * @param {Neo.data.Model} model
     * @param {Object} record
     * @param {Object} fields
     * @param {Boolean} silent=false
     */
    setRecordFields(model, record, fields, silent=false) {
        let changedFields = [],
            oldValue;

        Object.entries(fields).forEach(([key, value]) => {
            oldValue = record[key];
            value    = instance.parseRecordValue(record, model.getField(key), value);

            if (!Neo.isEqual(oldValue, value)) {
                record[Symbol.for(key)] = value; // silent update
                record._isModified = true;
                changedFields.push({name: key, oldValue, value})
            }
        });

        if (!silent && Object.keys(changedFields).length > 0) {
            Neo.get(model.storeId)?.onRecordChange({fields: changedFields, model, record})
        }
    }
}

instance = Neo.setupClass(RecordFactory);

export default instance;
