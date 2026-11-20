import Model from '../../../src/data/Model.mjs';

/**
 * @summary One example group of the Portal's examples section, as the selected build publishes it.
 *
 * `family`, `band`, `title`, `route`, `iconCls`, `sentence` and optional `tileHeading` come from
 * `Portal.view.examples.MainContainer#familyDefinitions`. `count` and `crossCount` follow the catalog and the
 * selected build (`Portal.view.examples.MainContainerController#publishGroups()`). `count` holds the group's home records
 * that publish, cards and tiles alike, so every example counts once and the counts add up to the overview's headline.
 * `crossCount` holds the ones other groups lend it through `alsoIn`: shown on its page, not counted. `tileCount` holds the
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
     * @summary A group's count in words, as its card and its page say it.
     * @param {Object} record A group record or its raw row
     * @returns {String} e.g. '21 examples', '4 examples, 4 from other groups' or '2 from other groups'
     */
    static countLabel({count, crossCount}) {
        if (count === 0) {
            return `${crossCount === 1 ? '1 live example' : `${crossCount} live examples`} from other groups`
        }

        const home = count === 1 ? '1 live example' : `${count} live examples`;

        return crossCount > 0 ? `${home}, ${crossCount} from other groups` : home
    }

    /**
     * @summary A group's number in the banded index: its home records, and none for a group that owns none. What a
     * group borrows from others is said in words by {@link #countLabel}, the entry's `aria-label` and its page's line.
     * @param {Object} record A group record or its raw row
     * @returns {String}
     */
    static countText({count}) {
        return count > 0 ? String(count) : ''
    }
}

export default Neo.setupClass(ExampleGroup);
