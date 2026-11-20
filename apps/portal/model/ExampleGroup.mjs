import Model from '../../../src/data/Model.mjs';

/**
 * @summary One example group of the Portal's examples section, as the selected build publishes it.
 *
 * `family`, `band`, `title`, `route`, `iconCls`, `sentence` and optional `tileHeading` come from
 * `Portal.view.examples.MainContainer#familyDefinitions`. `count` and `crossCount` follow the catalog and the
 * selected build (`Portal.view.examples.MainContainerController#publishGroups()`). `count` holds the group's home records
 * that publish, cards and tiles alike, so every example counts once and the counts add up to the overview's headline.
 * `crossCount` holds the ones other groups lend it through `alsoIn`: they show on its page and in its number
 * (`countText`, `countLabel`: `count + crossCount`), never in the overview's headline. `tileCount` holds the
 * tiles its page shows, its own and lent ones (`kind: 'component'`): the page heads its cards and its tiles only when it
 * shows both.
 * @class Portal.model.ExampleGroup
 * @extends Neo.data.Model
 */
class ExampleGroup extends Model {
    static config = {
        /**
         * @member {String} className='Portal.model.ExampleGroup'
         * @protected
         */
        className: 'Portal.model.ExampleGroup',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'band',
            type: 'String'
        }, {
            name        : 'count',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name        : 'crossCount',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name: 'family',
            type: 'String'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'route',
            type: 'String'
        }, {
            name: 'sentence',
            type: 'String'
        }, {
            name        : 'tileCount',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name: 'tileHeading',
            type: 'String'
        }, {
            name: 'title',
            type: 'String'
        }],
        /**
         * @member {String} keyProperty='family'
         * @reactive
         */
        keyProperty: 'family'
    }

    /**
     * @summary A group's count in words, as its list entry and its page say it: every live example its page shows,
     * its own and the ones other groups lend it.
     * @param {Object} record A group record or its raw row
     * @returns {String} e.g. '1 live example' or '11 live examples'
     */
    static countLabel({count, crossCount}) {
        const total = count + crossCount;

        return total === 1 ? '1 live example' : `${total} live examples`
    }

    /**
     * @summary A group's number in the list, the figure of {@link #countLabel}. A borrowed example counts in every group
     * that shows it, so the numbers add up to more than the overview's headline; the line under the list says so.
     * @param {Object} record A group record or its raw row
     * @returns {String}
     */
    static countText({count, crossCount}) {
        return String(count + crossCount)
    }
}

export default Neo.setupClass(ExampleGroup);
