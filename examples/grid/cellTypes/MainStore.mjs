import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

const COMPACT = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1, notation: 'compact'});

/**
 * @summary Deterministic 32-bit PRNG (Mulberry32) so generated sponsorship figures and live feed ticks reproduce the
 * exact same initial frame on every load.
 * @param {Number} seed
 * @returns {Function} `() => Number` in `[0, 1)`
 */
export function createSeededRandom(seed = 0x21187) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t     = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/**
 * Thirty-two public open-source maintainers indexed in DevIndex (`users.jsonl`), pairing verified GitHub logins,
 * avatar IDs, ISO-2 country codes, public LinkedIn slugs, top repositories, GitHub organizations, and 8-year
 * contribution trends.
 */
const MAINTAINERS = [
    {login: 'tobiu',               name: 'Tobias Uhlig',          avatarUrl: 1177434,  cc: 'DE', location: 'Stuttgart, Germany',  ecosystem: 'Multi-worker UI',   linkedin: 'tobiasuhlig',                 repo: ['neomjs/neo',                        21199], orgs: [['neomjs', 55371235]],                                                       trend: [886, 5993, 4792, 2993, 3562, 3727, 5839, 5755]},
    {login: 'zkochan',             name: 'Zoltan Kochan',         avatarUrl: 1927579,  cc: 'HU', location: 'Budapest, Hungary',   ecosystem: 'Package tooling',   linkedin: 'zkochan',                     repo: ['pnpm/pnpm',                          9562], orgs: [['pnpm', 21320719], ['teambit', 24789812], ['package-community', 29317256]], trend: [12433, 14766, 13203, 12081, 9963, 9059, 8834, 16074]},
    {login: 'nicolas-grekas',      name: 'Nicolas Grekas',        avatarUrl: 243674,   cc: 'FR', location: 'Paris, France',       ecosystem: 'PHP runtime',       linkedin: 'nicolasgrekas',               repo: ['symfony/symfony',                   19929], orgs: [['symfony', 143937], ['doctrine', 209254]],                                  trend: [17363, 12367, 12271, 6614, 10378, 7077, 8948, 7486]},
    {login: 'michaelklishin',      name: 'Michael Klishin',       avatarUrl: 1090,     cc: 'CA', location: 'Vancouver, Canada',   ecosystem: 'Message brokers',   linkedin: 'michaelklishin',              repo: ['rabbitmq/rabbitmq-server',          15610], orgs: [['ruby-amqp', 551719], ['clojurewerkz', 1180937], ['defprotocol', 1759345]], trend: [12459, 7921, 4647, 4855, 4938, 5238, 4556, 3465]},
    {login: 'MikeMcQuaid',         name: 'Mike McQuaid',          avatarUrl: 125011,   cc: 'GB', location: 'Edinburgh, UK',       ecosystem: 'macOS packaging',   linkedin: 'mkmcqd',                      repo: ['Homebrew/brew',                     13720], orgs: [['Homebrew', 1503512], ['GitInPractice', 6018188]],                          trend: [4399, 10947, 5709, 3187, 4328, 4388, 4792, 6645]},
    {login: 'snicoll',             name: 'Stéphane Nicoll',       avatarUrl: 490484,   cc: 'BE', location: 'Liège, Belgium',      ecosystem: 'Java services',     linkedin: 'snicoll',                     repo: ['spring-projects/spring-boot',       18796], orgs: [['spring-projects', 317776], ['bsblabs', 1290380]],                          trend: [5226, 6583, 7344, 6432, 3141, 3266, 7532, 2419]},
    {login: 'kdy1',                name: 'Donny Kang',            avatarUrl: 29931815, cc: 'KR', location: 'Seoul, South Korea',  ecosystem: 'Rust compilers',    linkedin: 'kdy1',                        repo: ['swc-project/swc',                    4855], orgs: [['nodejs', 9950313], ['swc-project', 26715726], ['dudykr', 56416142]],       trend: [1475, 6873, 4131, 9692, 5788, 5741, 7396, 8167]},
    {login: 'sebastianbergmann',   name: 'Sebastian Bergmann',    avatarUrl: 25218,    cc: 'DE', location: 'Siegburg, Germany',   ecosystem: 'Unit testing',      linkedin: 'sebastian-bergmann-phpunit',  repo: ['sebastianbergmann/phpunit',         20272], orgs: [['thePHPcc', 377661], ['phar-io', 13421177]],                                trend: [2195, 4126, 3076, 3093, 5078, 3703, 3526, 2618]},
    {login: 'hajimehoshi',         name: 'Hajime Hoshi',          avatarUrl: 16950,    cc: 'JP', location: 'Tokyo, Japan',        ecosystem: '2D game engine',    linkedin: 'hajimehoshi',                 repo: ['hajimehoshi/ebiten',                10209], orgs: [['go-gl', 2505184], ['golang', 4314092], ['gopherjs', 6654647]],             trend: [2378, 3684, 3111, 3824, 3014, 4145, 5183, 3204]},
    {login: 'LorenzMeier',         name: 'Lorenz Meier',          avatarUrl: 1208119,  cc: 'CH', location: 'Zurich, Switzerland', ecosystem: 'Flight control',    linkedin: 'meierlorenz',                 repo: ['PX4/PX4-Autopilot',                  9067], orgs: [['cvg', 840224], ['mavlink', 961247], ['arktools', 1004683]],                trend: [2227, 5722, 2926, 980, 1240, 1620, 2110, 2490]},
    {login: 'TomasVotruba',        name: 'Tomas Votruba',         avatarUrl: 924196,   cc: 'CZ', location: 'Prague, Czechia',     ecosystem: 'AST refactoring',   linkedin: 'tomas-votruba',               repo: ['rectorphp/rector',                  18250], orgs: [['symplify', 16455105], ['rectorphp', 32097581]],                            trend: [8400, 15539, 10699, 6551, 6796, 4282, 4624, 2375]},
    {login: 'brillout',            name: 'Romuald Brillout',      avatarUrl: 1005638,  cc: 'DE', location: 'Munich, Germany',     ecosystem: 'SSR routing',       linkedin: 'brillout',                    repo: ['vikejs/vike',                       15550], orgs: [['telefunc', 70205140], ['vikejs', 86403530], ['hattipjs', 100227078]],      trend: [2934, 4398, 20634, 13827, 9389, 7060, 6953, 4258]},
    {login: 'leecalcote',          name: 'Lee Calcote',           avatarUrl: 7570704,  cc: 'US', location: 'Austin, USA',         ecosystem: 'Cloud mesh',        linkedin: 'leecalcote',                  repo: ['meshery/meshery',                   12965], orgs: [['cncf', 13455738], ['docker-captains', 18412632], ['istio', 23534644]],     trend: [2902, 6663, 7143, 7524, 9991, 10056, 9958, 7283]},
    {login: 'hsbt',                name: 'Hiroshi Shibata',       avatarUrl: 12301,    cc: 'JP', location: 'Tokyo, Japan',        ecosystem: 'Ruby core gems',    linkedin: 'hiroshi-shibata-04264122',    repo: ['ruby/ruby',                          4780], orgs: [['jenkinsci', 107424], ['rubygems', 208761], ['ruby', 210414]],              trend: [3542, 3774, 3114, 3643, 6679, 5905, 6042, 4342]},
    {login: 'The-Compiler',        name: 'Freya Bruhin',          avatarUrl: 625793,   cc: 'CH', location: 'Winterthur, Switzerland', ecosystem: 'Qt web browser',    linkedin: 'freya-bruhin',                repo: ['qutebrowser/qutebrowser',           18682], orgs: [['pyside', 534804], ['PyCQA', 8749848]],                                     trend: [3179, 4241, 3442, 2344, 1428, 1616, 1540, 1193]},
    {login: 'normanmaurer',        name: 'Norman Maurer',         avatarUrl: 439362,   cc: 'DE', location: 'Karlsruhe, Germany',  ecosystem: 'Async networking',  linkedin: 'normanmaurer',                repo: ['netty/netty',                        4689], orgs: [['netty', 473791], ['mashupbots', 1463346], ['vert-x', 1746886]],            trend: [2942, 4947, 5294, 2416, 3151, 3882, 4585, 1836]},
    {login: 'saghul',              name: 'Saúl Ibarra Corretgé',  avatarUrl: 317464,   cc: 'NL', location: 'Amsterdam, Netherlands', ecosystem: 'WebRTC & libuv', linkedin: 'saghul',                      repo: ['jitsi/jitsi-meet',                   2108], orgs: [['jitsi', 3671647], ['OpenSIPS', 3853758], ['libuv', 4030929]],              trend: [2303, 2285, 2209, 2806, 2444, 2917, 2691, 1903]},
    {login: 'rich-iannone',        name: 'Richard Iannone',       avatarUrl: 5612024,  cc: 'CA', location: 'Toronto, Canada',     ecosystem: 'Data tables',       linkedin: 'richard-iannone-a5640017',    repo: ['rstudio/gt',                         8300], orgs: [['rstudio', 513560], ['WeAreVisualizers', 8945357]],                         trend: [2198, 2909, 3337, 4173, 4439, 3845, 6879, 6066]},
    {login: 'GrahamCampbell',      name: 'Graham Campbell',       avatarUrl: 2829600,  cc: 'GB', location: 'York, UK',            ecosystem: 'HTTP clients',      linkedin: 'grahamjcampbell123',          repo: ['BootstrapCMS/CMS',                   1603], orgs: [['thephpleague', 527621], ['guzzle', 638632], ['phpseclib', 1820952]],       trend: [3291, 4262, 7059, 6790, 7580, 5152, 5371, 3800]},
    {login: 'benbalter',           name: 'Ben Balter',            avatarUrl: 282759,   cc: 'US', location: 'Washington, DC',      ecosystem: 'Civic open data',   linkedin: 'benbalter',                   repo: ['benbalter/benbalter.github.com',     5871], orgs: [['unitedstates', 2200203], ['government', 5321787]],                         trend: [2387, 1681, 2151, 2737, 4073, 5265, 7615, 7717]},
    {login: 'kishikawakatsumi',    name: 'Kishikawa Katsumi',     avatarUrl: 40610,    cc: 'JP', location: 'Tokyo, Japan',        ecosystem: 'Swift playgrounds', linkedin: 'kishikawakatsumi',            repo: ['SwiftFiddle/swiftfiddle-web',        1698], orgs: [['potatotips', 5772323], ['SwiftFiddle', 88049787]],                         trend: [1610, 1852, 3285, 2207, 4402, 5436, 23740, 19322]},
    {login: 'mikermcneil',         name: 'Mike McNeil',           avatarUrl: 618009,   cc: 'US', location: 'Austin, Texas',       ecosystem: 'Node MVC',          linkedin: 'mikermcneil',                 repo: ['balderdashy/sails',                  5265], orgs: [['balderdashy', 1445252], ['sailshq', 5460813], ['expressjs', 5658226]],     trend: [1727, 1605, 1838, 1338, 3590, 2053, 1144, 830]},
    {login: 'qiangxue',            name: 'Qiang Xue',             avatarUrl: 993322,   cc: 'US', location: 'Virginia, USA',       ecosystem: 'Go & PHP web',      linkedin: 'qiangxue',                    repo: ['yiisoft/yii2',                       1930], orgs: [['yiisoft', 993323], ['go-ozzo', 15002228]],                                 trend: [931, 834, 620, 540, 610, 710, 580, 690]},
    {login: 'winlinvip',           name: 'Winlin',                avatarUrl: 2777660,  cc: 'CA', location: 'Toronto, Canada',     ecosystem: 'Live video',        linkedin: 'winlinvip',                   repo: ['ossrs/srs',                          8239], orgs: [['ossrs', 12165287], ['pion', 38192892]],                                    trend: [3662, 9147, 7776, 3304, 1709, 1593, 1409, 1058]},
    {login: 'ehsandeep',           name: 'Sandeep Singh',         avatarUrl: 8293321,  cc: 'IN', location: 'Bengaluru, India',    ecosystem: 'Security scanners', linkedin: 'ehsandeepsingh',              repo: ['projectdiscovery/nuclei-templates',  5462], orgs: [['projectdiscovery', 50994705]],                                             trend: [970, 3307, 8930, 6193, 6639, 18491, 7494, 5637]},
    {login: 'nilbuild',            name: 'Kamran Ahmed',          avatarUrl: 4921183,  cc: 'GB', location: 'London, UK',          ecosystem: 'Developer guides',  linkedin: 'nilbuild',                    repo: ['nilbuild/developer-roadmap',         4417], orgs: [['roadmapsh', 120650344]],                                                   trend: [5913, 4903, 5135, 2802, 2702, 2658, 3755, 5776]},
    {login: 'code-yeongyu',        name: 'YeonGyu Kim',           avatarUrl: 11153873, cc: 'KR', location: 'Seoul, South Korea',  ecosystem: 'Agent CLI harnesses',linkedin: 'y30ngyu',                    repo: ['code-yeongyu/oh-my-openagent',       8670], orgs: [['jungvengers', 73050524], ['sisyphuslabs', 251170166]],                     trend: [589, 828, 3619, 1535, 3127, 7195, 9719, 21537]},
    {login: 'jbrooksuk',           name: 'James Brooks',          avatarUrl: 246103,   cc: 'GB', location: 'Manchester, UK',      ecosystem: 'Status pages',      linkedin: 'jbrooksuk',                   repo: ['cachethq/cachet',                    4576], orgs: [['SublimeText', 684879], ['laravel', 958072], ['cachethq', 9951502]],        trend: [2134, 3029, 3270, 3691, 3180, 3068, 4587, 1601]},
    {login: 'utilForever',         name: 'Chris Ohk',             avatarUrl: 5622661,  cc: 'KR', location: 'Seongnam, KR',        ecosystem: 'C++ & graphics',    linkedin: 'utilforever',                 repo: ['utilForever/RosettaStone',          10189], orgs: [['EpicGames', 6615685], ['NVIDIAGameWorks', 7717624], ['rust-kr', 10530291]], trend: [3471, 4117, 5265, 5928, 3770, 3393, 2296, 5349]},
    {login: 'driesvints',          name: 'Dries Vints',           avatarUrl: 594614,   cc: 'BE', location: 'Antwerp, Belgium',    ecosystem: 'Laravel CLI',       linkedin: 'driesvints',                  repo: ['codeat3/blade-zondicons',            2507], orgs: [['laravel', 958072], ['laravelio', 5324953], ['GitHub-Stars', 61242156]],    trend: [3593, 4196, 3886, 6287, 3314, 2805, 2996, 2417]},
    {login: 'snoyberg',            name: 'Michael Snoyman',       avatarUrl: 49415,    cc: 'IL', location: 'Tel Aviv, Israel',    ecosystem: 'Haskell builds',    linkedin: 'snoyberg',                    repo: ['commercialhaskell/stackage',         3654], orgs: [['yesodweb', 930379], ['mezzohaskell', 1567449]],                            trend: [2438, 1310, 837, 487, 500, 729, 1690, 860]},
    {login: 'yegor256',            name: 'Yegor Bugayenko',       avatarUrl: 526301,   cc: 'CN', location: 'Shanghai, China',     ecosystem: 'OO compilers',      linkedin: 'yegor256',                    repo: ['objectionary/eo',                   17422], orgs: [['jcabi', 5272640], ['teamed', 7436563], ['zerocracy', 24234201]],           trend: [6895, 3273, 3094, 7073, 6795, 20531, 60980, 26906]}
];

const TIER_ICONS = ['fa-solid fa-circle-check', 'fa-solid fa-award', 'fa-solid fa-bolt'];
const GOALS      = [24000, 30000, 36000, 48000, 60000];

/**
 * @summary Builds the deterministic 32-row maintainer dataset from a fixed PRNG seed so initial renders, cover
 * captures, and E2E assertions observe identical values on every boot.
 * @returns {Object[]}
 */
export function buildDirectoryRows() {
    const rand = createSeededRandom(0x21187);

    return MAINTAINERS.map((entry, index) => {
        const
            annualGoal    = GOALS[Math.floor(rand() * GOALS.length)],
            ratio         = 0.42 + rand() * 0.52,
            pledged       = Math.round((annualGoal * ratio) / 250) * 250,
            recentCommits = 18 + Math.floor(rand() * 145),
            tierIcon      = TIER_ICONS[index % TIER_ICONS.length];

        return {
            id           : `maintainer-${index + 1}`,
            login        : entry.login,
            name         : entry.name,
            avatarUrl    : entry.avatarUrl,
            countryCode  : entry.cc,
            location     : entry.location,
            ecosystem    : entry.ecosystem,
            annualGoal,
            pledged,
            lastDelta    : 250,
            recentCommits,
            trend        : [...entry.trend],
            tierIcon,
            topRepoUrl   : `https://github.com/${entry.repo[0]}`,
            topRepoStars : `${COMPACT.format(entry.repo[1])} ★`,
            linkedin     : entry.linkedin,
            organizations: entry.orgs.map(([login, avatarUrl]) => ({login, name: login, avatarUrl})),
            actionLabel  : '+$250'
        }
    })
}

/**
 * @summary Store of 32 open-source maintainers with seeded sponsorship figures and a deterministic reset path.
 * @class Neo.examples.grid.cellTypes.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.cellTypes.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.cellTypes.MainStore',
        /**
         * @member {Neo.data.Model} model=MainModel
         */
        model: MainModel
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct({
            data: buildDirectoryRows(),
            ...config
        })
    }

    /**
     * @summary Clears active sorters and restores the initial seeded 32-row sponsorship snapshot.
     */
    resetDirectory() {
        this.sorters = [];
        this.clear();
        this.add(buildDirectoryRows())
    }
}

export default Neo.setupClass(MainStore);
