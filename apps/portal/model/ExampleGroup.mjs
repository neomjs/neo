import Model from '../../../src/data/Model.mjs';

/**
 * @summary One example group of the Portal's examples section, as the selected build publishes it.
 *
 * `family`, `band`, `title`, `route`, `iconCls`, `sentence` and `tile` come from
 * `Portal.view.examples.MainContainer#familyDefinitions`. `count`, `crossCount` and `image` follow the catalog and the
 * selected build (`Portal.view.examples.MainContainerController#publishGroups()`). `count` holds the group's home records
 * that publish a card, so every example counts once and the counts add up to the overview's headline. `crossCount` holds
 * the cards other groups lend it through `alsoIn`: shown on its page, not counted. `image` is the cover that stands for
 * the group: its `tile` record's, else its first card's.
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
            name: 'image',
            type: 'String'
        }, {
            name: 'route',
            type: 'String'
        }, {
            name: 'sentence',
            type: 'String'
        }, {
            name: 'tile',
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
        const cross = `${crossCount} from other groups`;

        if (count === 0) return cross;

        const home = count === 1 ? '1 example' : `${count} examples`;

        return crossCount > 0 ? `${home}, ${cross}` : home
    }

    /**
     * @summary A group's count in the banded index: its home records, or the examples it shows from other groups in
     * parentheses when it has none.
     * @param {Object} record A group record or its raw row
     * @returns {String}
     */
    static countText({count, crossCount}) {
        return count > 0 ? String(count) : `(${crossCount})`
    }
}

export default Neo.setupClass(ExampleGroup);
