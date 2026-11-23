import CommissionModel from './CommissionModel.mjs';
import Store           from '../../../src/data/Store.mjs';

const COMMISSIONS = [
    // Enquiry (4)
    {
        id               : 'c-01',
        title            : 'Kanso Tea House identity',
        commissionSummary: 'Kyoto pop-up · wordmark, tin labels & menu system',
        status           : 'enquiry',
        tags             : ['identity', 'print'],
        assignees        : ['Mina'],
        color            : '#64748b'
    },
    {
        id               : 'c-02',
        title            : 'Fjord Acoustics packaging',
        commissionSummary: 'Studio monitor sleeve & moulded pulp insert',
        status           : 'enquiry',
        tags             : ['packaging'],
        assignees        : ['Soren']
    },
    {
        id               : 'c-03',
        title            : 'Kunsthalle autumn signage',
        commissionSummary: 'Wayfinding banners & gallery wall captions',
        status           : 'enquiry',
        tags             : ['spatial', 'type'],
        assignees        : ['Clara']
    },
    {
        id               : 'c-04',
        title            : 'Vesper Press monograph',
        commissionSummary: '240pp clothbound architecture survey',
        status           : 'enquiry',
        tags             : ['editorial'],
        assignees        : ['Theo']
    },

    // Quote (3)
    {
        id               : 'c-05',
        title            : 'Solstice Botanicals bottle set',
        commissionSummary: 'Apothecary glass labels · 6 SKU foil spec',
        status           : 'quote',
        tags             : ['packaging', 'print'],
        assignees        : ['Mina', 'Theo'],
        color            : '#38bdf8'
    },
    {
        id               : 'c-06',
        title            : 'Meridian Transit map refresh',
        commissionSummary: 'Harbour ferry schematic & pier totems',
        status           : 'quote',
        tags             : ['spatial', 'systems'],
        assignees        : ['Soren']
    },
    {
        id               : 'c-07',
        title            : 'Loom & Ledger web flagship',
        commissionSummary: 'Editorial lookbook & sample request flow',
        status           : 'quote',
        tags             : ['digital'],
        assignees        : ['Clara']
    },

    // In work (4)
    {
        id               : 'c-08',
        title            : 'Nordic Roasters bag architecture',
        commissionSummary: 'Single-origin colour coding & valve stamp',
        status           : 'in-work',
        tags             : ['packaging', 'identity'],
        assignees        : ['Mina'],
        progress         : 65,
        color            : '#a78bfa'
    },
    {
        id               : 'c-09',
        title            : 'Aether Synth panel typography',
        commissionSummary: 'Silkscreen legend grid for anodised chassis',
        status           : 'in-work',
        tags             : ['industrial', 'type'],
        assignees        : ['Soren', 'Theo'],
        progress         : 45
    },
    {
        id               : 'c-10',
        title            : 'Civic Conservatory season book',
        commissionSummary: 'Chamber programme spreads & ticket wallet',
        status           : 'in-work',
        tags             : ['editorial', 'print'],
        assignees        : ['Clara'],
        progress         : 80
    },
    {
        id               : 'c-11',
        title            : 'Halcyon Cycle Club kit & badge',
        commissionSummary: 'Woven crest, bidon graphics & route cards',
        status           : 'in-work',
        tags             : ['identity'],
        assignees        : ['Theo'],
        progress         : 30
    },

    // Review (3)
    {
        id               : 'c-12',
        title            : 'Atelier Verrerie catalogue',
        commissionSummary: 'Wet-proof colour check with printer in Ghent',
        status           : 'review',
        tags             : ['editorial', 'print'],
        assignees        : ['Clara', 'Mina'],
        progress         : 90,
        color            : '#f59e0b'
    },
    {
        id               : 'c-13',
        title            : 'Boreal Skincare refill system',
        commissionSummary: 'Dieline sign-off on refill pouch & carton',
        status           : 'review',
        tags             : ['packaging'],
        assignees        : ['Soren'],
        progress         : 85
    },
    {
        id               : 'c-14',
        title            : 'Kino Palast festival title suite',
        commissionSummary: ' Cinema bumper frames & street poster trio',
        status           : 'review',
        tags             : ['motion', 'type'],
        assignees        : ['Theo'],
        progress         : 95
    },

    // Archive (3 — folded at the start)
    {
        id               : 'c-15',
        title            : 'Harbour Biennial 2025 identity',
        commissionSummary: 'Archived press kit & pavilion stencil master',
        status           : 'archive',
        tags             : ['spatial', 'identity'],
        assignees        : ['Mina']
    },
    {
        id               : 'c-16',
        title            : 'Orchard Cider winter edition',
        commissionSummary: 'Numbered woodcut neck tags · 2025 vintage',
        status           : 'archive',
        tags             : ['packaging'],
        assignees        : ['Clara']
    },
    {
        id               : 'c-17',
        title            : 'Studio type specimen no. 4',
        commissionSummary: 'Riso broadsheet & archival glyph sheet',
        status           : 'archive',
        tags             : ['type', 'print'],
        assignees        : ['Theo']
    },

    // Delivered (3 — locked, last)
    {
        id               : 'c-18',
        title            : 'Alba Ceramics flagship signage',
        commissionSummary: 'Brass fascia lettering & kiln room plaques',
        status           : 'delivered',
        tags             : ['spatial'],
        assignees        : ['Soren'],
        progress         : 100,
        color            : '#34d399'
    },
    {
        id               : 'c-19',
        title            : 'Saffron & Salt cookbook',
        commissionSummary: 'Final print files delivered to bindery',
        status           : 'delivered',
        tags             : ['editorial'],
        assignees        : ['Clara'],
        progress         : 100
    },
    {
        id               : 'c-20',
        title            : 'Polestar Audio brand guidelines',
        commissionSummary: 'Design tokens, grid spec & icon library shipped',
        status           : 'delivered',
        tags             : ['systems', 'digital'],
        assignees        : ['Mina', 'Soren'],
        progress         : 100
    }
];

/**
 * @summary Deterministic 20-commission store for the design studio column-arrangement board (`examples/board/columns`).
 * @description Seeds 20 commissions across six studio stages (`enquiry: 4`, `quote: 3`, `in-work: 4`, `review: 3`,
 * `archive: 3`, `delivered: 3`) using {@link Neo.examples.board.columns.CommissionModel}.
 * @class Neo.examples.board.columns.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.columns.MainStore'
         * @protected
         */
        className: 'Neo.examples.board.columns.MainStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CommissionModel
         */
        model: CommissionModel
    }

    /**
     * @summary Populates the 20 studio commissions once on construction unless explicit records were supplied.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.items?.length) {
            this.add(this.generateData())
        }
    }

    /**
     * @summary Returns fresh clones of the 20 initial studio commission records.
     * @returns {Object[]}
     */
    generateData() {
        return COMMISSIONS.map((item, index) => ({
            ...item,
            assignees: [...item.assignees],
            order    : (index + 1) * 1000,
            tags     : [...item.tags]
        }))
    }
}

export default Neo.setupClass(MainStore);
