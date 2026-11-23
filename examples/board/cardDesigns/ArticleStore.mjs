import ArticleModel from './ArticleModel.mjs';
import Store        from '../../../src/data/Store.mjs';

const DESK_COLORS = {
    Cities : '#0ea5e9',
    Climate: '#10b981',
    Culture: '#ec4899',
    Science: '#6366f1',
    Tech   : '#f59e0b'
};

const SEED_ARTICLES = [
    // Idea (13 pitches — realistic pitch funnel that keeps vertical overflow in all three card designs)
    {
        id         : 'art-1',
        status     : 'idea',
        order      : 1,
        desk       : 'Climate',
        title      : 'How North Sea tidal batteries are turning abandoned offshore salt caverns into week-long grid storage',
        standfirst : 'Field report from Wilhelmshaven as engineers pressure-test brined caverns for winter wind droughts.',
        tags       : ['Climate', 'Cover story'],
        percentDone: 25,
        author     : 'Maya Lin',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-2',
        status     : 'idea',
        order      : 2,
        desk       : 'Cities',
        title      : 'Night trams and micro-freight: Vienna retools empty 02:00 streetcar tracks for bakery deliveries',
        standfirst : 'Municipal rail planners share six months of acoustic and kerbside emissions measurements.',
        tags       : ['Cities', 'Dispatch'],
        percentDone: 15,
        author     : 'Nadia Okafor',
        editor     : null
    },
    {
        id         : 'art-3',
        status     : 'idea',
        order      : 3,
        desk       : 'Science',
        title      : 'Glass-free cryo-microscopy on a benchtop',
        standfirst : 'Liquid-jet sample holders cut prep time from four hours to twelve minutes without liquid ethane.',
        tags       : [],
        percentDone: 0,
        author     : 'Henrik Lind',
        editor     : null
    },
    {
        id         : 'art-4',
        status     : 'idea',
        order      : 4,
        desk       : 'Tech',
        title      : 'Why browser SharedWorkers outlast tab reloads in trading desks',
        standfirst : 'Inside multi-window web runtimes that keep live state in worker memory rather than main-thread trees.',
        tags       : ['Tech', 'Deep dive'],
        percentDone: 20,
        author     : 'Priya Nair',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-5',
        status     : 'idea',
        order      : 5,
        desk       : 'Culture',
        title      : 'The quiet revival of letterpress Type-High foundries across northern Portugal',
        standfirst : 'Three family workshops cast new lead-antimony display founts for independent bookbinders.',
        tags       : ['Culture'],
        percentDone: 0,
        author     : 'Elena Rostova',
        editor     : null
    },
    {
        id         : 'art-6',
        status     : 'idea',
        order      : 6,
        desk       : 'Climate',
        title      : 'Alpine glacier melt sensors move onto LoRa mesh buoys',
        standfirst : 'Low-power acoustic rangers survive winter freeze-thaw cycles above 3,100 metres.',
        tags       : ['Climate', 'Fieldwork'],
        percentDone: 10,
        author     : 'Soren Falk',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-7',
        status     : 'idea',
        order      : 7,
        desk       : 'Science',
        title      : 'Mapping deep-sea basalt microbes that mineralize carbon in ninety days',
        standfirst : 'Core samples off Reykjanes Ridge challenge decades-old carbonate timeline assumptions.',
        tags       : ['Science'],
        percentDone: 0,
        author     : 'Maya Lin',
        editor     : null
    },
    {
        id         : 'art-8',
        status     : 'idea',
        order      : 8,
        desk       : 'Cities',
        title      : 'Daylighting urban culverts: Seoul’s next three buried tributaries',
        standfirst : 'Hydrologists weigh monsoon surge capacity against summer heat-island cooling.',
        tags       : [],
        percentDone: 0,
        author     : 'Nadia Okafor',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-9',
        status     : 'idea',
        order      : 9,
        desk       : 'Tech',
        title      : 'Formal verification meets RISC-V interrupt controllers',
        standfirst : 'Open-source proof scripts catch subtle priority-inversion edges before tape-out.',
        tags       : ['Tech'],
        percentDone: 15,
        author     : 'Priya Nair',
        editor     : null
    },
    {
        id         : 'art-10',
        status     : 'idea',
        order      : 10,
        desk       : 'Culture',
        title      : 'Restoring magnetic tape archives from 1970s experimental radio workshops',
        standfirst : 'Baking acetate reels and digitizing quadraphonic masters before binder hydrolysis wins.',
        tags       : ['Culture', 'Essay'],
        percentDone: 0,
        author     : 'Elena Rostova',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-11',
        status     : 'idea',
        order      : 11,
        desk       : 'Science',
        title      : 'Sodium-ion cells pass 6,000 cold-weather cycles in stationary microgrids',
        standfirst : 'Prussian-white cathodes trade peak energy density for sub-zero resilience.',
        tags       : ['Science', 'Data'],
        percentDone: 10,
        author     : 'Henrik Lind',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-12',
        status     : 'idea',
        order      : 12,
        desk       : 'Cities',
        title      : 'Timber modular overbuilds add two storeys above post-war clinics',
        standfirst : 'Cross-laminated spruce frames install over weekends without closing hospital wards.',
        tags       : ['Cities'],
        percentDone: 0,
        author     : 'Soren Falk',
        editor     : null
    },
    {
        id         : 'art-13',
        status     : 'idea',
        order      : 13,
        desk       : 'Tech',
        title      : 'Zero-copy WebGL2 scene graphs driven from worker threads',
        standfirst : 'Transferable OffscreenCanvas pipelines hold 60 fps while main-thread DOM menus stay idle.',
        tags       : ['Tech', 'Graphics'],
        percentDone: 20,
        author     : 'Priya Nair',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-32',
        status     : 'idea',
        order      : 14,
        desk       : 'Climate',
        title      : 'Salt-marsh oyster reefs absorb storm surge along North Frisian dikes',
        standfirst : 'Living breakwaters accrete three centimetres of sediment per winter season.',
        tags       : ['Climate'],
        percentDone: 0,
        author     : 'Maya Lin',
        editor     : null
    },

    // Draft (5 active manuscripts)
    {
        id         : 'art-14',
        status     : 'draft',
        order      : 1,
        desk       : 'Science',
        title      : 'Inside the subterranean optical clocks comparing gravity shifts across three European mountain passes',
        standfirst : 'Strontium lattice links resolve centimetre-scale geoid height changes in real time.',
        tags       : ['Science', 'Feature'],
        percentDone: 55,
        author     : 'Henrik Lind',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-15',
        status     : 'draft',
        order      : 2,
        desk       : 'Cities',
        title      : 'Copenhagen’s rainwater boulevards ten years after the cloudburst plan',
        standfirst : 'Sunken skate bowls and permeable cobbles kept cellars dry through autumn storms.',
        tags       : [],
        percentDone: 45,
        author     : 'Nadia Okafor',
        editor     : null
    },
    {
        id         : 'art-16',
        status     : 'draft',
        order      : 3,
        desk       : 'Tech',
        title      : 'Small subsea repeaters turning Pacific telecom cables into tsunami gauges',
        standfirst : 'Optical polarization drift spots seafloor pressure waves twenty minutes ahead of buoys.',
        tags       : ['Tech', 'Climate'],
        percentDone: 60,
        author     : 'Maya Lin',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-17',
        status     : 'draft',
        order      : 4,
        desk       : 'Culture',
        title      : 'Cartographers who hand-draw shaded relief for winter mountaineering maps',
        standfirst : 'Why Swiss and Japanese topo sheets still blend airbrush craft with LiDAR DEMs.',
        tags       : ['Culture', 'Visuals'],
        percentDone: 40,
        author     : 'Elena Rostova',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-18',
        status     : 'draft',
        order      : 5,
        desk       : 'Climate',
        title      : 'Geothermal district loops replace gas boilers across former coal towns',
        standfirst : 'Flooded mine workings supply steady 28 °C water to heat pumps serving 14,000 homes.',
        tags       : ['Climate'],
        percentDone: 50,
        author     : 'Soren Falk',
        editor     : null
    },

    // Edit (5 desk-edit pieces, including one unassigned guest column)
    {
        id         : 'art-19',
        status     : 'edit',
        order      : 1,
        desk       : 'Tech',
        title      : 'When software keeps object permanence: why multi-agent engineering teams outgrow stateless chat',
        standfirst : 'Inspectable scene graphs and durable memory turn ephemeral prompts into accountable maintenance.',
        tags       : ['Tech', 'Essay'],
        percentDone: 82,
        author     : 'Priya Nair',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-20',
        status     : 'edit',
        order      : 2,
        desk       : 'Culture',
        title      : 'Concert hall acoustics tuned with kiln-dried cedar diffusers',
        standfirst : 'Parametric milled ribs scatter high frequencies evenly without electronic reverb.',
        tags       : ['Culture'],
        percentDone: 75,
        author     : null,
        editor     : null
    },
    {
        id         : 'art-21',
        status     : 'edit',
        order      : 3,
        desk       : 'Climate',
        title      : 'Electric harbor tugs complete their first full winter in Rotterdam',
        standfirst : 'Megawatt shore chargers turn around 70-tonne bollard-pull vessels in twenty-five minutes.',
        tags       : ['Climate', 'Report'],
        percentDone: 88,
        author     : 'Soren Falk',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-22',
        status     : 'edit',
        order      : 4,
        desk       : 'Science',
        title      : 'Pollen DNA in lake varves reconstructs medieval orchard varieties',
        standfirst : 'Sediment cores name lost pear and chestnut cultivars across the Loire valley.',
        tags       : [],
        percentDone: 70,
        author     : 'Henrik Lind',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-23',
        status     : 'edit',
        order      : 5,
        desk       : 'Cities',
        title      : 'Library tool-lending annexes double repair café attendance',
        standfirst : 'Thermal cameras, sewing machines, and torque wrenches circulate on standard library cards.',
        tags       : ['Cities', 'Brief'],
        percentDone: 85,
        author     : 'Nadia Okafor',
        editor     : 'Claire Dubois'
    },

    // Scheduled (4 proofed pieces locked for print & web)
    {
        id         : 'art-24',
        status     : 'scheduled',
        order      : 1,
        desk       : 'Cities',
        title      : 'Fifteen-minute freight hubs: how Utrecht moved parcel vans off canal bridges onto cargo bikes',
        standfirst : 'Consolidation micro-depots at ring-road rail sidings cut inner-ring van kilometres by 64%.',
        tags       : ['Cities', 'Lead'],
        percentDone: 96,
        author     : 'Nadia Okafor',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-25',
        status     : 'scheduled',
        order      : 2,
        desk       : 'Science',
        title      : 'Autonomous saildrones map Southern Ocean winter carbon uptake',
        standfirst : 'Uncrewed surface hulls braved twelve-metre swells to close a seasonal flux gap.',
        tags       : ['Science', 'Climate'],
        percentDone: 95,
        author     : 'Maya Lin',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-26',
        status     : 'scheduled',
        order      : 3,
        desk       : 'Culture',
        title      : 'In praise of pocket field guides printed on stone-ground waterproof stock',
        standfirst : 'Botanists test sewn-spine notebooks that survive tidal pools and rucksack rain.',
        tags       : ['Culture'],
        percentDone: 100,
        author     : 'Elena Rostova',
        editor     : null
    },
    {
        id         : 'art-27',
        status     : 'scheduled',
        order      : 4,
        desk       : 'Tech',
        title      : 'Deterministic replay debugging for distributed SQLite state machines',
        standfirst : 'Seeded virtual clocks reproduce week-long consensus races in four seconds.',
        tags       : ['Tech', 'Systems'],
        percentDone: 98,
        author     : 'Priya Nair',
        editor     : 'Tomás Vega'
    },

    // Published (4 live issue features)
    {
        id         : 'art-28',
        status     : 'published',
        order      : 1,
        desk       : 'Science',
        title      : 'High-temperature superconducting tape shrinks hospital MRI magnets without liquid helium',
        standfirst : 'Conduction-cooled REBCO coils bring diagnostic imaging to regional clinics far from cryogen plants.',
        tags       : ['Science', 'Cover story'],
        percentDone: 100,
        author     : 'Henrik Lind',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-29',
        status     : 'published',
        order      : 2,
        desk       : 'Climate',
        title      : 'Rewetted peatlands in Friesland cut subsidence while growing cattail insulation',
        standfirst : 'Paludiculture trials pair water-table restoration with bio-based acoustic panels.',
        tags       : ['Climate', 'Feature'],
        percentDone: 100,
        author     : 'Soren Falk',
        editor     : 'Claire Dubois'
    },
    {
        id         : 'art-30',
        status     : 'published',
        order      : 3,
        desk       : 'Cities',
        title      : 'Acoustic cameras at school crossings quieten modified exhausts',
        standfirst : 'Beamforming microphone arrays pair decibel readouts with roadside LED feedback.',
        tags       : ['Cities'],
        percentDone: 100,
        author     : 'Nadia Okafor',
        editor     : 'Tomás Vega'
    },
    {
        id         : 'art-31',
        status     : 'published',
        order      : 4,
        desk       : 'Culture',
        title      : 'How community darkrooms brought silver-gelatin printing to a new generation',
        standfirst : 'Shared enlargers and recycled fixer loops keep analogue craft affordable.',
        tags       : ['Culture', 'Column'],
        percentDone: 100,
        author     : 'Elena Rostova',
        editor     : 'Claire Dubois'
    }
];

/**
 * @summary Returns fresh clones of the 32 editorial calendar records with desk accent colors applied.
 * @returns {Object[]}
 */
export function buildSeedArticles() {
    return SEED_ARTICLES.map(item => ({
        ...item,
        color: DESK_COLORS[item.desk] || '#5eead4',
        tags : Array.isArray(item.tags) ? [...item.tags] : []
    }))
}

/**
 * @summary Store holding the editorial calendar's 32 articles across `Idea`, `Draft`, `Edit`, `Scheduled`, and `Published`.
 * @class Neo.examples.board.cardDesigns.ArticleStore
 * @extends Neo.data.Store
 */
class ArticleStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.cardDesigns.ArticleStore'
         * @protected
         */
        className: 'Neo.examples.board.cardDesigns.ArticleStore',
        /**
         * @member {Neo.data.Model} model=ArticleModel
         */
        model: ArticleModel
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct({
            data: buildSeedArticles(),
            ...config
        })
    }
}

export default Neo.setupClass(ArticleStore);
