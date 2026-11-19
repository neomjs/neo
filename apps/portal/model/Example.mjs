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
         * `family` names the record's home group, one id of `Portal.view.examples.MainContainer#familyDefinitions`;
         * `alsoIn` lists the other groups that show it (empty by default). `component` names its renderer.
         * `featured` independently marks a showcase record and defaults to false; it does not assign a family.
         * `feature` states what the example demonstrates and `lookFor` gives a concrete action.
         * Optional `scope` qualifies external dependencies or limits of that demonstration.
         * `image` names an existing published cover; a record without one stays in the catalog and gets no card.
         * `kind` is `'demonstration'` (the default, a card) or `'component'`: one component in the workbench, shown as
         * a tile whose `image` is its crop. Both kinds publish under the same rule.
         * Relative destinations resolve against List.baseUrl or List.sourceBaseUrl; HTTP links
         * remain explicit, including external apps whose mode routes differ from Engine paths.
         *
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name        : 'alsoIn',
            type        : 'Array',
            defaultValue: []
        }, {
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
            name        : 'kind',
            type        : 'String',
            defaultValue: 'demonstration'
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

    /**
     * @summary Whether a record shows in a group: its home group, or a group its `alsoIn` names.
     * @param {Object} record A catalog record or its raw row
     * @param {String} family A group id
     * @returns {Boolean}
     */
    static belongsTo(record, family) {
        return record.family === family || !!record.alsoIn?.includes(family)
    }

    /**
     * @summary The address a record opens in a build mode: its explicit external link, or its path below `baseUrl`.
     * @param {Object} record A catalog record or its raw row
     * @param {String} mode A build mode id, e.g. 'dist_prod'
     * @param {String} [baseUrl='https://neomjs.com/']
     * @returns {String|null} null when the mode cannot open the record
     */
    static href(record, mode, baseUrl='https://neomjs.com/') {
        const url = record.urls?.[mode];

        return !url ? null : url.startsWith('http') ? url : baseUrl + url
    }

    /**
     * @summary Whether a record publishes a card in a build mode: it names a cover, and the mode can open it.
     *
     * The one rule the group stores, the tab publication and `Portal.view.examples.List` read. A build script cannot
     * import this class, so `buildScripts/docs/seo/seoJson.mjs` applies the same rule for `dist_prod`, and a spec
     * holds both to one result.
     * @param {Object} record A catalog record or its raw row
     * @param {String} mode A build mode id, e.g. 'dist_prod'
     * @returns {Boolean}
     */
    static publishes(record, mode) {
        return !!record.image && !record.hidden && !record.hiddenIn?.includes(mode) && !!record.urls?.[mode]
    }
}

export default Neo.setupClass(Example);
