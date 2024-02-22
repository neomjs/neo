import BaseCollection from '../../src/collection/Base.mjs';

function _random(max) {
    return Math.round(Math.random()*1000)%max;
}

/**
 * @class NeoApp.TableCollection
 * @extends Neo.collection.Base
 */
class TableCollection extends BaseCollection {
    static config = {
        /**
         * @member {String} className='NeoApp.TableCollection'
         * @protected
         */
        className: 'NeoApp.TableCollection',
        /**
         * @member {Number} idCounter=1
         */
        idCounter: 1
    }

    /**
     * @param {Number} count
     * @returns {Object[]}
     */
    buildData(count=1000) {
        let adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy'],
            colours    = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange'],
            nouns      = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'],
            data       = [],
            i          = 0;

        for (; i < count; i++) {
            data.push({
                id   : this.idCounter++,
                label: adjectives[_random(adjectives.length)] + ' ' + colours[_random(colours.length)] + ' ' + nouns[_random(nouns.length)]
            });
        }

        return data;
    }
}

Neo.setupClass(TableCollection);

export default TableCollection;
