import Model from '../../../src/data/Model.mjs';

/**
 * @summary A canonical example identity, caption and explicit destinations for each build mode.
 * @class Portal.model.Example
 * @extends Neo.data.Model
 */
class Example extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.Example'
         * @protected
         */
        className: 'Portal.model.Example',
        /**
         * One record owns an example's stable string `id`, presentation and destinations.
         * `urls` maps `devmode`, `dist_dev`, `dist_esm` and `dist_prod` to explicit targets;
         * List.catalogMode selects the key. A missing target hides the example in that mode.
         * `sourceUrl` is the common source link; optional `sourceUrls` overrides it by mode.
         * `hiddenIn` lists curated mode exclusions (empty by default); `hidden` hides every mode.
         * `family` selects an overview through a Store filter, while `component` names its renderer.
         * `featured` independently marks a showcase record and defaults to false; it does not assign a family.
         * `feature` states what the example demonstrates and `lookFor` gives a concrete action.
         * Optional `scope` qualifies external dependencies or limits of that demonstration.
         * `image` names an existing published cover; null selects the typographic fallback.
         * Relative destinations resolve against List.baseUrl or List.sourceBaseUrl; HTTP links
         * remain explicit, including external apps whose mode routes differ from Engine paths.
         *
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'backgroundColor',
            type: 'String'
        }, {
            name        : 'browsers',
            type        : 'Array',
            defaultValue: ['Chrome', 'Edge', 'Firefox', 'Safari']
        }, {
            name: 'component',
            type: 'String'
        }, {
            name        : 'environments',
            type        : 'Array',
            defaultValue: ['Desktop']
        }, {
            name: 'family',
            type: 'String'
        }, {
            name: 'feature',
            type: 'String'
        }, {
            name        : 'featured',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name        : 'hidden',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name        : 'hiddenIn',
            type        : 'Array',
            defaultValue: []
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'lookFor',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'scope',
            type: 'String'
        }, {
            name        : 'sharedWorkers',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name: 'sourceUrl',
            type: 'String'
        }, {
            name: 'sourceUrls',
            type: 'Object'
        }, {
            name: 'urls',
            type: 'Object'
        }]
    }
}

export default Neo.setupClass(Example);
