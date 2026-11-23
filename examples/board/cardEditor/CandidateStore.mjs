import CardModel from '../../../src/board/CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

// The pipeline by stage: [invented name, role, recruiter]
const pipeline = {
    applied: [
        ['Aiko Brandt',     'Frontend engineer',   'Avery'],
        ['Bruno Okafor',    'Data analyst',        'Jordan'],
        ['Carla Mendes',    'Product designer',    'Sam'],
        ['Dev Narang',      'Backend engineer',    'Avery'],
        ['Elif Sorensen',   'QA engineer',         'Jordan'],
        ['Felix Amari',     'Frontend engineer',   'Sam'],
        ['Greta Lindqvist', 'Engineering manager', 'Avery']
    ],
    screen: [
        ['Hamza Petrov',    'Backend engineer',    'Jordan'],
        ['Ines Varga',      'Product designer',    'Sam'],
        ['Jonah Takeda',    'Frontend engineer',   'Avery'],
        ['Kira Duval',      'Data analyst',        'Jordan'],
        ['Luca Ferraro',    'QA engineer',         'Sam'],
        ['Maya Holm',       'Backend engineer',    'Avery']
    ],
    interview: [
        ['Nils Okoye',      'Engineering manager', 'Jordan'],
        ['Oriana Bell',     'Frontend engineer',   'Sam'],
        ['Pavel Kim',       'Data analyst',        'Avery'],
        ['Quinn Adler',     'Product designer',    'Jordan'],
        ['Rosa Nakamura',   'Backend engineer',    'Sam']
    ],
    offer: [
        ['Samir Haddad',    'Frontend engineer',   'Avery'],
        ['Tess Moreau',     'QA engineer',         'Jordan'],
        ['Umar Lindgren',   'Backend engineer',    'Sam']
    ],
    hired: [
        ['Vera Castillo',   'Product designer',    'Avery'],
        ['Wes Ibarra',      'Data analyst',        'Jordan'],
        ['Yara Svensson',   'Frontend engineer',   'Sam']
    ]
};

/**
 * @summary The hiring pipeline's 24 invented candidates across five stages, the same set on every load.
 * @description A candidate is a board card: the name is its title, the role its one tag and the recruiter its one
 * assignee, so the card shows every field the card editor edits. Ids run `c-01` to `c-24` in stage order, so a witness
 * can name a candidate before the page opens. `order` stays unset: the board numbers each column when it loads.
 * @class Neo.examples.board.cardEditor.CandidateStore
 * @extends Neo.data.Store
 */
class CandidateStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardEditor.CandidateStore'
         * @protected
         */
        className: 'Neo.examples.board.cardEditor.CandidateStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CardModel
         */
        model: CardModel
    }

    /**
     * @summary Seeds the candidates once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.items?.length) {
            me.add(me.generateData())
        }
    }

    /**
     * @summary Builds the 24 candidates from the pipeline table, numbering them in stage order.
     * @returns {Object[]}
     */
    generateData() {
        return Object.entries(pipeline)
            .flatMap(([status, rows]) => rows.map(([title, role, recruiter]) => ({status, title, tags: [role], assignees: [recruiter]})))
            .map((record, index) => ({id: `c-${String(index + 1).padStart(2, '0')}`, ...record}))
    }
}

export default Neo.setupClass(CandidateStore);
