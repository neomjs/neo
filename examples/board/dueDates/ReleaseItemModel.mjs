import CardModel from '../../../src/board/CardModel.mjs';

/**
 * @summary Release deliverable record schema extending {@link Neo.board.CardModel} for the `dueDates` Task Board example.
 * @description Inherits `id`, `title`, `description`, `status`, `order`, `assignees`, `tags`, `progress`, `color`, and
 * `dueDate` from `CardModel`, adding `area` for release-stream provenance.
 * @class Neo.examples.board.dueDates.ReleaseItemModel
 * @extends Neo.board.CardModel
 */
class ReleaseItemModel extends CardModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.dueDates.ReleaseItemModel'
         * @protected
         */
        className: 'Neo.examples.board.dueDates.ReleaseItemModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            ...CardModel.config.fields,
            {name: 'area', type: 'String'}
        ]
    }
}

export default Neo.setupClass(ReleaseItemModel);
