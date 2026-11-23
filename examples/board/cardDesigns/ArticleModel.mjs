import Model from '../../../src/data/Model.mjs';

/**
 * @summary Editorial calendar article record driving `Compact`, `Standard`, and `Detailed` card designs on `Neo.board.Container`.
 * @description Declares the headline (`title`), deck summary (`standfirst`), section/format chips (`tags`), completion
 * percentage (`percentDone`), and writer/editor names (`author`, `editor`), deriving `people` as `[author, editor].filter(Boolean)`
 * so articles without an assigned editor (or unstaffed pitches) omit missing entries cleanly without empty avatar slots or `"undefined"`.
 * @class Neo.examples.board.cardDesigns.ArticleModel
 * @extends Neo.data.Model
 */
class ArticleModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardDesigns.ArticleModel'
         * @protected
         */
        className: 'Neo.examples.board.cardDesigns.ArticleModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',          type: 'String'},
            {name: 'title',       type: 'String'},
            {name: 'standfirst',  type: 'String', defaultValue: ''},
            {name: 'status',      type: 'String', defaultValue: 'idea'},
            {name: 'order',       type: 'Int',    defaultValue: 0},
            {name: 'desk',        type: 'String', defaultValue: 'Science'},
            {name: 'color',       type: 'String', defaultValue: null},
            {name: 'tags',        type: 'Array',  defaultValue: []},
            {name: 'percentDone', type: 'Int',    defaultValue: 0},
            {name: 'author',      type: 'String', defaultValue: null},
            {name: 'editor',      type: 'String', defaultValue: null},
            {
                name     : 'people',
                type     : 'Array',
                depends  : ['author', 'editor'],
                calculate: data => [data.author, data.editor].filter(Boolean)
            }
        ]
    }
}

export default Neo.setupClass(ArticleModel);
