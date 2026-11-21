import CardEditor from '../../../src/board/CardEditor.mjs';

// The pipeline's words for the board's standard fields
const labels = {assignees: 'Recruiter', status: 'Stage', tags: 'Role'};

/**
 * @summary The board's card editor in the hiring pipeline's words: a candidate's stage, role and recruiter.
 * @description The board builds its one editor from `cardEditorModule`, and the standard fields keep their engine
 * behavior (the stage select lists the board's columns, and a new stage moves the card through `moveCard`); only
 * their labels change.
 * @class Neo.examples.board.cardEditor.CandidateEditor
 * @extends Neo.board.CardEditor
 */
class CandidateEditor extends CardEditor {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardEditor.CandidateEditor'
         * @protected
         */
        className: 'Neo.examples.board.cardEditor.CandidateEditor'
    }

    /**
     * @summary The standard field configs, relabelled for a candidate.
     * @returns {Object[]}
     */
    getStandardFieldConfigs() {
        return super.getStandardFieldConfigs().map(config => labels[config.name] ? {...config, labelText: labels[config.name]} : config)
    }
}

export default Neo.setupClass(CandidateEditor);
