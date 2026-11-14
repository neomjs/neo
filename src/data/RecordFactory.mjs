import {internalId} from '../core/ConfigSymbols.mjs';
import Base         from '../core/Base.mjs';
import Model        from './Model.mjs';

const
    dataSymbol         = Symbol.for('data'),
    initialIndexSymbol = Symbol.for('initialIndex'),
    isModifiedSymbol   = Symbol.for('isModified'),
    noValueSymbol      = Symbol.for('noValue'),
    originalDataSymbol = Symbol.for('originalData'),
    ownValuesSymbol    = Symbol.for('ownValues'),
    versionSymbol      = Symbol.for('version');

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
     * The record class each Model last got from createRecordClass(), so a release removes only its own:
     * a released Model's id may already name a successor's class.
     * @member {WeakMap} #recordClasses=new WeakMap()
     * @private
     */
    #recordClasses = new WeakMap()
    /**
     * @summary Active admission frames, present only while prepared field sets are being adopted.
     * @member {Map|null} #preparedFields=null
     * @private
     */
    #preparedFields = null
    /**
     * @summary Subscribers to committed changes, keyed by the record so store-less records can publish too.
     * @member {WeakMap} #recordObservers
     * @private
     */
    #recordObservers = new WeakMap()

    /**
     * @summary Resolves field mappings (dot and `[index]` segments, preserving falsy leaves and yielding `undefined` when absent so `defaultValue` applies) and assigns model default values.
     * @param {Object}         data
     * @param {Neo.data.Model} model
     * @returns {Object}
     */
    assignDefaultValues(data, model) {
        model.fieldsMap.forEach((field, fieldName) => {
            if (field.virtual) return;

            if (field.mapping && !Object.hasOwn(data, fieldName)) {
                let ns  = field.mapping.split('.'),
                    key = ns.pop(),
                    source;

                if (key.endsWith(']')) {
                    const value = Neo.nsWithArrays(field.mapping, false, data);

                    if (value !== undefined) {
                        data[fieldName] = value
                    }
                } else {
                    if (ns.length > 0) {
                        source = Neo.nsWithArrays(ns, false, data)
                    } else {
                        source = data
                    }

                    if (source && Object.hasOwn(source, key)) {
                        data[fieldName] = source[key]
                    }
                }
            }

            if (Object.hasOwn(field, 'defaultValue')) {
                const defaultValue = Neo.isFunction(field.defaultValue) ? field.defaultValue() : field.defaultValue;

                // We could always use Neo.assignToNs() => the check is just for improving the performance
                if (model.hasNestedFields) {
                    Neo.assignToNs(fieldName, defaultValue, data, false)
                } else if (data[fieldName] === undefined) {
                    data[fieldName] = defaultValue
                }
            }
        });

        return data
    }

    /**
     * @param {Object} data
     * @param {Object} data.field
     * @param {Neo.data.Model} data.model
     * @param {String} data.path=''
     * @param {Object} data.proto
     */
    createField({field, model, path='', proto}) {
        let fieldName = field.name,
            fieldPath = path === '' ? fieldName : `${path}.${fieldName}`,
            properties;

        if (field.fields) {
            field.fields.forEach(childField => {
                this.createField({field: childField, model, path: fieldPath, proto})
            })
        } else {
            if (field.virtual) {
                properties = {
                    [fieldPath]: {
                        configurable: true,
                        enumerable  : true,
                        get() {
                            return field.calculate(this[dataSymbol], this)
                        }
                    }
                }
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
                            this.notifyChange({fields: {[fieldPath]: value}, model, record: this})
                        }
                    }
                }
            }

            Object.defineProperties(proto, properties)
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

                    [dataSymbol]         = {};
                    [initialIndexSymbol] = null;
                    /**
                     * The current version of the record. Increments on every modification.
                     * Used for change tracking and optimization (e.g. short-circuiting grid rendering).
                     * @member {Number} [versionSymbol]=0
                     */
                    [versionSymbol] = 0;

                    /**
                     * The stable, globally unique internal ID for this record instance.
                     * @member {String} internalId
                     */
                    [internalId] = Neo.getId('record');

                    get isModified() {
                        let me = this;

                        if (model.trackModifiedFields) {
                            return !Neo.isEqual(me[dataSymbol], me[originalDataSymbol])
                        }

                        return me[isModifiedSymbol]
                    }

                    /**
                     * Returns the current version of the record.
                     * @returns {Number}
                     */
                    get version() {
                        return this[versionSymbol]
                    }

                    /**
                     * @param {Object} config
                     */
                    constructor(config) {
                        let me = this;

                        if (Object.hasOwn(config, initialIndexSymbol)) {
                            me[initialIndexSymbol] = config[initialIndexSymbol];
                            delete config[initialIndexSymbol]
                        }

                        if (Object.hasOwn(config, internalId)) {
                            // We do NOT delete it from config because it's a Symbol and won't affect setOriginal/setSilent
                            me[internalId] = config[internalId]
                        }

                        // the record parses the row's own data, never a value Soft Hydration kept on it
                        if (Object.hasOwn(config, ownValuesSymbol)) {
                            instance.restoreOwnValues(config)
                        }

                        config = instance.assignDefaultValues(config, model);

                        if (model.trackModifiedFields) {
                            me[originalDataSymbol] = {};
                            me.setOriginal(config)
                        } else {
                            me[isModifiedSymbol] = false
                        }

                        me.setSilent(config) // We do not want to fire change events when constructing
                    }

                    /**
                     * @param {String} field
                     * @returns {*}
                     */
                    get(field) {
                        if (model.getField(field)) {
                            return this[field]
                        }

                        if (field.includes('.')) {
                            return Neo.ns(field, false, this[dataSymbol])
                        }

                        return this[dataSymbol][field]
                    }

                    /**
                     * @param {String} fieldName
                     * @returns {Boolean|null} null in case the model does not use trackModifiedFields, true in case a change was found
                     */
                    isModifiedField(fieldName) {
                        let me = this;

                        if (model.trackModifiedFields) {
                            let dataScope, originalDataScope;

                            if (model.hasNestedFields && fieldName?.includes('.')) {
                                let nsArray = fieldName.split('.');

                                fieldName         = nsArray.pop();
                                dataScope         = Neo.ns(nsArray, false, me[dataSymbol]);
                                originalDataScope = Neo.ns(nsArray, false, me[originalDataSymbol])
                            } else {
                                dataScope         = me[dataSymbol];
                                originalDataScope = me[originalDataSymbol]
                            }

                            // Check if the field exists
                            if (
                                !model.getField(fieldName) &&        // Check for leaf fields (could be excluded inside the real data)
                                !Object.hasOwn(dataScope, fieldName) // Check the data tree
                            ) {
                                console.error('The record does not contain the field', fieldName, me)
                            }

                            return !Neo.isEqual(dataScope[fieldName], originalDataScope[fieldName])
                        }

                        return null
                    }

                    /**
                     * @summary Admits a native write. An interceptor sees the proposed fields before conversion.
                     * A sequence sees that the method ran, including attempts a prepared edit may later refuse.
                     * Subscribe through RecordFactory.observeRecord() for changes that have committed.
                     * @param {Object}         data
                     * @param {Object}         data.fields
                     * @param {Neo.data.Model} data.model
                     * @param {Object}         data.record
                     * @param {Boolean}        silent=false
                     * @returns {Object}
                     */
                    notifyChange(data, silent=false) {
                        const frame = instance.#preparedFields?.get(this);
                        if (frame) {
                            if (frame.expected !== data.fields || silent) throw new Error('Record is adopting prepared fields');
                            frame.expected = null;
                            data = {...data, changedFields: frame.changes};
                            silent = true
                        }
                        const param = {...data, silent}
                        instance.setRecordFields(param);
                        return param
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    reset(fields) {
                        this.setOriginal(fields);
                        this.set(fields)
                    }

                    /**
                     * Bulk-update multiple record fields at once
                     * @param {Object} fields
                     */
                    set(fields) {
                        this.notifyChange({fields, model, record: this})
                    }

                    /**
                     * If the model uses trackModifiedFields, we will store the original data
                     * for tracking the dirty state (changed fields)
                     * @param {Object} fields
                     * @protected
                     */
                    setOriginal(fields) {
                        instance.setRecordFields({fields, model, record: this, silent: true, useOriginalData: true})
                    }

                    /**
                     * Bulk-update multiple record fields at once without triggering a change event
                     * @param {Object} fields
                     */
                    setSilent(fields) {
                        this.notifyChange({fields, model, record: this}, true)
                    }

                    /**
                     * When using JSON.stringify(this), we want to get the raw data
                     * @returns {Object}
                     */
                    toJSON() {
                        return structuredClone(this[dataSymbol])
                    }
                };

                if (Array.isArray(model.fields)) {
                    model.fields.forEach(field => {
                        instance.createField({field, model, proto: cls.prototype})
                    })
                }

                Object.defineProperty(cls.prototype, 'isRecord', {value: true});
                Object.defineProperty(cls, 'isClass', {value: true});

                this.#recordClasses.set(model, cls);

                return ns[key]
            }

            return ns
        }
    }

    /**
     * @summary The value a record holds for one field without `calculate`: the field's datum in
     * {@link #deriveRecordData}'s result, passed through {@link #parseRecordValue} (convert, type).
     * @param {Object} recordData The result of `deriveRecordData()`
     * @param {Object} field
     * @param {String} fieldName The field's key in the model's `fieldsMap`: a nested field's path
     * @returns {*} The value, or `undefined` when the record holds none
     */
    deriveFieldValue(recordData, field, fieldName) {
        let value = Object.hasOwn(recordData, fieldName) ? recordData[fieldName] : noValueSymbol;

        if (value === noValueSymbol && fieldName.includes('.')) {
            value = Neo.ns(fieldName, false, recordData) ?? noValueSymbol
        }

        return value === noValueSymbol ? undefined : this.parseRecordValue({record: recordData, field, value})
    }

    /**
     * @summary The data a record created from `data` parses: the row's own values (Soft Hydration's kept ones
     * restored) after the record's own {@link #assignDefaultValues} pass, run on a copy, so `data` and its nested
     * objects stay unchanged. A mapping reads what the model's earlier fields assigned, as it does in the record.
     *
     * `Neo.data.Store` derives a raw Turbo Mode row's fields from it, so a row and its record share one derivation.
     * @param {Object}         data A raw row
     * @param {Neo.data.Model} model
     * @returns {Object} A new object
     */
    deriveRecordData(data, model) {
        const own = this.restoreOwnValues({...data});

        return this.assignDefaultValues(model.hasNestedFields ? Neo.clone(own, true) : own, model)
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
     * @summary Adopts non-key fields silently through each record's native writer, then publishes
     * their native change payloads. A failing conversion or seal restores the fields, including calculated
     * values, dirty state and version. The synchronous seal finishes any owner-managed work before the
     * first observer runs. Converters may normalize or retain the previous value; native deltas describe
     * what changed. An override that bypasses the admitted native write rejects the operation.
     * The seal must throw to refuse. Its owner manages membership and any external side effects.
     * @param {Neo.data.Model} model
     * @param {Object[]} updates Distinct current records of this model. The store owner manages membership.
     * @param {Object} updates[].record The original record instance.
     * @param {Object} updates[].fields Declared field names and their inputs. Use dotted names for nested fields.
     * @param {Function} [seal] Synchronous final adoption. Participating records reject further writes here.
     * @returns {Error[]} Errors for the caller to surface. Individual record notifications continue after a
     * subscriber throws. Binding effects flush through the ordinary reactive batch, whose error is also returned.
     */
    applyPreparedFields(model, updates, seal=Neo.emptyFn) {
        if (Object.prototype.toString.call(seal) === '[object AsyncFunction]') {
            throw new TypeError('Field adoption must be synchronous')
        }
        const Record = this.#recordClasses.get(model), store = Neo.get(model.storeId), key = store?.getKeyProperty() ?? model.keyProperty;
        const seen   = new Set(), checkpoints = updates.map(({record, fields: input}) => {
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a field map');
            const fields = Object.freeze({...input});
            if (!Record || !(record instanceof Record) || (store && (store.allItems || store).get(store.getKey(record)) !== record) ||
                seen.has(record) || this.#preparedFields?.has(record) ||
                Object.hasOwn(fields, key)) {
                throw new TypeError('Expected non-key fields on a record of this model')
            }
            seen.add(record);
            const slots = [];
            for (const name of new Set([...Object.keys(fields), ...model.calculatedFieldsMap.keys()])) {
                if (!model.getField(name) || name === key) throw new TypeError('Expected a declared, non-key field');
                const path  = model.hasNestedFields ? name.split('.') : [name];
                let   owner = record[dataSymbol], i = 0;
                // If a nested scope is absent, the write creates it. Restore its prior absence
                // instead of leaving an empty tree where a failed edit first created one.
                while (i < path.length - 1 && owner[path[i]] && typeof owner[path[i]] === 'object') {
                    owner = owner[path[i++]]
                }
                const field = path[i];
                slots.push({owner, field, existed: Object.hasOwn(owner, field), value: owner[field]})
            }
            return {record, fields, slots, changes: [], expected: null, version: record.version, modified: record[isModifiedSymbol]}
        });
        const preparing = this.#preparedFields ??= new Map();
        for (const frame of checkpoints) preparing.set(frame.record, frame);
        try {
            for (const frame of checkpoints) {
                const {record, fields} = frame;
                frame.expected = fields;
                try {
                    record.set(fields);
                    if (frame.expected) throw new Error('Record bypassed the prepared native field write')
                } finally { frame.expected = null }
            }
            const result = seal();
            if (result && typeof result.then === 'function') {
                Promise.resolve(result).catch(() => {});
                throw new TypeError('Field adoption must be synchronous')
            }
        } catch (error) {
            for (const {record, slots, version, modified} of checkpoints.reverse()) {
                for (const {owner, field, existed, value} of slots.reverse()) {
                    if (existed) owner[field] = value;
                    else delete owner[field]
                }
                record[versionSymbol] = version;
                if (!model.trackModifiedFields) record[isModifiedSymbol] = modified
            }
            throw error
        } finally {
            for (const {record} of checkpoints) preparing.delete(record);
            if (!preparing.size && this.#preparedFields === preparing) this.#preparedFields = null
        }
        const errors = [];
        try {
            Neo.batch(() => {
                for (const {record, changes} of checkpoints) {
                    if (changes.length) {
                        this.onRecordChange({model, record, fields: changes}, errors)
                    }
                }
            })
        } catch (error) {
            errors.push(error)
        }
        return errors
    }

    /**
     * @summary Identifies the exact prepared fields before a notifyChange interceptor delegates to the native
     * write. The admission is consumed there; a sequence running afterwards observes a method call.
     * @param {Object} record
     * @param {Object} fields
     * @returns {Boolean}
     */
    isApplyingPreparedFields(record, fields) {
        return !!fields && this.#preparedFields?.get(record)?.expected === fields
    }

    /**
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {Object[]} opts.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {Object} opts.record
     * @param {Error[]} [errors] Prepared publication collects subscriber errors; ordinary writes propagate them.
     */
    onRecordChange(opts, errors) {
        try {
            Neo.get(opts.model.storeId)?.onRecordChange(opts)
        } catch (error) {
            if (!errors) throw error;
            errors.push(error)
        }
        const observers = this.#recordObservers.get(opts.record);
        if (observers) {
            for (const listener of [...observers]) {
                if (observers.has(listener)) {
                    try {
                        listener(opts)
                    } catch (error) {
                        if (!errors) throw error;
                        errors.push(error)
                    }
                }
            }
        }
    }

    /**
     * @summary Subscribes to committed native field changes on one record, with or without an owning store.
     * Ordinary non-silent writes publish immediately; prepared writes publish after their seal succeeds.
     * @param {Object} record
     * @param {Function} listener Receives the record, its model and its native old/new field deltas.
     * @returns {Function} Removes this subscription.
     */
    observeRecord(record, listener) {
        if (!this.isRecord(record) || typeof listener !== 'function') {
            throw new TypeError('Expected a record and a field change listener')
        }
        let observers = this.#recordObservers.get(record);
        if (!observers) {
            this.#recordObservers.set(record, observers = new Set())
        }
        const subscription = change => listener(change);
        observers.add(subscription);
        return () => {
            if (observers.delete(subscription) && !observers.size) {
                this.#recordObservers.delete(record)
            }
        }
    }

    /**
     * @summary Puts a raw row's own values back where Soft Hydration (`Neo.data.Store#resolveField()`) kept derived
     * ones, and drops its record of them. A kept value the caller has replaced since stays: an explicit write wins.
     *
     * `data[Symbol.for('ownValues')]` maps each kept field name to `[ownValue, keptValue]`, `ownValue` being
     * `Symbol.for('noValue')` when the row had none. A spread copy of the row carries the same map.
     * @param {Object} data
     * @returns {Object} data
     */
    restoreOwnValues(data) {
        const ownValues = data[ownValuesSymbol];

        if (ownValues) {
            for (const fieldName in ownValues) {
                const [ownValue, keptValue] = ownValues[fieldName];

                if (Object.is(data[fieldName], keptValue)) {
                    if (ownValue === noValueSymbol) {
                        delete data[fieldName]
                    } else {
                        data[fieldName] = ownValue
                    }
                }
            }

            delete data[ownValuesSymbol]
        }

        return data
    }

    /**
     * @summary Drops the record class cached for a Model, so a retired Model leaves no class in the record namespace.
     * Records created earlier keep their class. An entry that no longer holds this Model's class, because a successor
     * reused its id, stays.
     * @param {Neo.data.Model} model
     */
    releaseRecordClass(model) {
        let ns = Neo.ns(`${this.recordNamespace}.${model.className}`);

        if (ns && ns[model.id] === this.#recordClasses.get(model)) {
            delete ns[model.id]
        }
    }

    /**
     * @summary Tests whether a non-null scalar `value` already holds `field`'s canonical primitive type
     * without needing {@link #parseRecordValue} conversion or length validation.
     * @param {Object} field Model field definition
     * @param {*}      value Raw field value
     * @returns {Boolean}
     */
    isCanonicalFieldValue(field, value) {
        if (value === null || value === undefined || field.calculate || field.convert ||
            field.maxLength !== undefined || field.minLength !== undefined) {
            return false
        }

        const type = field.type;

        if (type === 'String' || type === 'string') {
            return typeof value === 'string' && !value.includes('<')
        }

        if (type === 'Integer' || type === 'integer' || type === 'Int' || type === 'int') {
            return Number.isSafeInteger(value)
        }

        const lc = type?.toLowerCase();

        if (lc === 'string') {
            return typeof value === 'string' && !value.includes('<')
        }

        if (lc === 'int' || lc === 'integer') {
            return Number.isSafeInteger(value)
        }

        if (lc === 'html') {
            return typeof value === 'string'
        }

        return lc === 'float' && typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
    }

    /**
     * @summary Parses, converts, and validates a record field value, resolving initial field mappings.
     *
     * A `Date` field converts every value except `null` and `undefined`; only `nullable: false` refuses `null`.
     * @param {Object}  data
     * @param {Object}  data.record
     * @param {Object}  data.field
     * @param {*}       [data.value=null]
     * @param {Object}  [data.recordConfig=null]
     * @param {Boolean} [data.useOriginalData=false]
     * @returns {*}
     */
    parseRecordValue({record, field, value=null, recordConfig=null, useOriginalData=false}) {
        if (field.calculate) {
            return field.calculate(record[useOriginalData ? originalDataSymbol : dataSymbol], field)
        }

        if (field.convert) {
            value = field.convert(value, record)
        }

        let fieldName = field.name,
            {mapping, maxLength, minLength, nullable} = field,
            oldValue  = recordConfig?.[fieldName] || record[fieldName],
            type      = field.type?.toLowerCase();

        // only trigger mappings for initial values
        // dynamic changes of a field will not pass the recordConfig
        if (mapping && recordConfig) {
            if (mapping.endsWith(']')) {
                value = Neo.nsWithArrays(mapping, false, recordConfig)
            } else {
                let ns  = mapping.split('.'),
                    key = ns.pop();

                ns    = Neo.nsWithArrays(ns, true, recordConfig);
                value = ns[key]
            }
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

        if (type === 'date' && value != null && Neo.typeOf(value) !== 'Date') {
            return new Date(value)
        }

        else if (type === 'float' && value) {
            value = parseFloat(value)
        }

        else if (type === 'html' && value) {
            value = value + ''
        }

        else if ((type === 'int' || type === 'integer') && value) {
            if (!Number.isSafeInteger(value)) {
                value = parseInt(value)
            }
        }

        else if (type === 'string' && value) {
            if (typeof value !== 'string') {
                value = value + ''
            }

            if (value.includes('<')) {
                value = value.replace(/(<([^>]+)>)/ig, '')
            }
        }

        return value
    }

    /**
     * @param {Object}         data
     * @param {String}         data.fieldName
     * @param {Neo.data.Model} data.model
     * @param {Record}         data.record
     * @param {Boolean}        data.useOriginalData=false true will apply changes to the originalData symbol
     * @param {*}              data.value
     * @protected
     */
    setRecordData({fieldName, model, record, useOriginalData=false, value}) {
        if (useOriginalData && !model.trackModifiedFields) {
            return
        }

        let scope = useOriginalData ? originalDataSymbol : dataSymbol;

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
     * @param {Boolean}        data.useOriginalData=false true will apply changes to the originalData symbol
     */
    setRecordFields({changedFields=[], fields, model, record, silent=false, useOriginalData=false}) {
        const frame = this.#preparedFields?.get(record);
        if (frame && (useOriginalData || !silent || changedFields !== frame.changes)) {
            throw new Error('Only the admitted native field write may change this record')
        }
        let me = this,
            {calculatedFieldsMap, fieldsMap, trackModifiedFields} = model,
            fieldExists, hasChangedFields, oldValue;

        if (!trackModifiedFields && useOriginalData) {
            return
        }

        Object.entries(fields).forEach(([key, value]) => {
            fieldExists = fieldsMap.has(key);

            if (Neo.isObject(value) && !fieldExists) {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    me.setRecordFields({
                        changedFields,
                        fields: {[`${key}.${childKey}`]: childValue},
                        model,
                        record,
                        silent: true,
                        useOriginalData
                    })
                })
            } else if (fieldExists) {
                oldValue = record[key];
                value    = me.parseRecordValue({record, field: model.getField(key), value});

                if (!Neo.isEqual(oldValue, value)) {
                    me.setRecordData({fieldName: key, model, record, useOriginalData, value});

                    if (!trackModifiedFields && !useOriginalData) {
                        record[isModifiedSymbol] = true
                    }

                    changedFields.push({name: key, oldValue, value})
                }
            }
        });

        hasChangedFields = Object.keys(changedFields).length > 0;

        if (hasChangedFields) {
            record[versionSymbol]++;

            calculatedFieldsMap.forEach((value, key) => {
                if (value.virtual) return;

                oldValue = record[key];
                value    = me.parseRecordValue({record, field: model.getField(key), useOriginalData});

                if (!Neo.isEqual(oldValue, value)) {
                    me.setRecordData({fieldName: key, model, record, useOriginalData, value});

                    changedFields.push({name: key, oldValue, value})
                }
            })
        }

        if (!silent && !useOriginalData && hasChangedFields) {
            me.onRecordChange({fields: changedFields, model, record})
        }
    }
}

instance = Neo.setupClass(RecordFactory);

export default instance;
