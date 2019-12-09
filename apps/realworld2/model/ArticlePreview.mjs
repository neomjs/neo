import Model  from '../../../src/data/Model.mjs';

/**
 * @class RealWorld2.model.ArticlePreview
 * @extends Neo.data.Model
 */
class ArticlePreview extends Model {
    static getConfig() {return {
        className: 'RealWorld2.model.ArticlePreview',

        fields: [{
            name: 'author',
            type: 'Object'
        }, {
            name: 'body',
            type: 'String'
        }, {
            name: 'createdAt',
            type: 'String' // date
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'favorited',
            type: 'Boolean'
        }, {
            name: 'favoritesCount',
            type: 'Number'
        }, {
            name: 'slug',
            type: 'String'
        }, {
            name: 'tagList',
            type: 'Array'
        }, {
            name: 'title',
            type: 'String'
        }, {
            name: 'updatedAt',
            type: 'String' // date
        }]
    }}
}

Neo.applyClassConfig(ArticlePreview);

export {ArticlePreview as default};