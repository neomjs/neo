import Model from '../data/Model.mjs';

/**
 * @summary The card of a board: the fields the board reads, and the fields its default card items render.
 * @description `status` and `order` are the board's truth. A column is the records whose status equals its own,
 * sorted by `order`, and a move is one `set` of both — the view follows. `lane` is the second axis the swimlane
 * leaf projects. The other fields feed the default card items (title, tags, progress, dueDate, avatars).
 *
 * A consumer may bring its own model: `Neo.board.Container` reads the field names it needs from `statusField`,
 * `orderField` and `laneField`, and the card items name their fields.
 * @class Neo.board.CardModel
 * @extends Neo.data.Model
 */
class CardModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.board.CardModel'
         * @protected
         */
        className: 'Neo.board.CardModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id'
        }, {
            name: 'title',
            type: 'String'
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'status',
            type: 'String'
        }, {
            // The swimlane axis; null = no lane
            name        : 'lane',
            type        : 'String',
            defaultValue: null
        }, {
            // A fractional rank inside a column: the midpoint of its neighbours after a move
            name: 'order',
            type: 'Float'
        }, {
            // Names, or objects with a `name`
            name: 'assignees'
        }, {
            name: 'tags'
        }, {
            name: 'progress',
            type: 'Int'
        }, {
            // A CSS color the card paints as its accent
            name        : 'color',
            type        : 'String',
            defaultValue: null
        }, {
            // A date string or a Date. Untyped on purpose: a typed date field turns null into the epoch.
            name: 'dueDate'
        }],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id'
    }
}

export default Neo.setupClass(CardModel);
