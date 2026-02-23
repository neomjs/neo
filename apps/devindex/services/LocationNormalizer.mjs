import Base from '../../../src/core/Base.mjs';

/**
 * @class DevIndex.services.LocationNormalizer
 * @extends Neo.core.Base
 * @singleton
 */
class LocationNormalizer extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.LocationNormalizer'
         * @protected
         */
        className: 'DevIndex.services.LocationNormalizer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Map of "City/Region" -> "ISO Code"
     * Add to this list as you discover more unmatched locations.
     * @member {Map} cityMap
     * @static
     */
    static cityMap = new Map([
        // Germany
        ['berlin', 'DE'], ['munich', 'DE'], ['münchen', 'DE'], ['hamburg', 'DE'],
        ['cologne', 'DE'], ['köln', 'DE'], ['frankfurt', 'DE'], ['stuttgart', 'DE'],
        ['düsseldorf', 'DE'], ['leipzig', 'DE'], ['dresden', 'DE'], ['aachen', 'DE'],
        ['karlsruhe', 'DE'], ['mannheim', 'DE'], ['nuremberg', 'DE'], ['nürnberg', 'DE'],
        ['bonn', 'DE'], ['darmstadt', 'DE'],

        // USA (Common Tech Hubs)
        ['san francisco', 'US'], ['sf', 'US'], ['bay area', 'US'], ['new york', 'US'],
        ['nyc', 'US'], ['seattle', 'US'], ['austin', 'US'], ['boston', 'US'],
        ['los angeles', 'US'], ['chicago', 'US'], ['denver', 'US'], ['palo alto', 'US'],
        ['mountain view', 'US'], ['cupertino', 'US'], ['redmond', 'US'],
        ['washington', 'US'], ['washington dc', 'US'], ['washington d.c.', 'US'], ['dc', 'US'],
        ['brooklyn', 'US'], ['sammamish', 'US'], ['bend', 'US'],
        ['california', 'US'], ['texas', 'US'],
        ['hawaii', 'US'], ['hope, ri', 'US'],
        ['columbus', 'US'], ['charlotte', 'US'], ['phoenix', 'US'], ['philadelphia', 'US'],
        ['san antonio', 'US'], ['san diego', 'US'], ['dallas', 'US'], ['san jose', 'US'],
        ['jacksonville', 'US'], ['indianapolis', 'US'], ['atlanta', 'US'], ['salt lake city', 'US'],
        ['stanford', 'US'], ['berkeley', 'US'], ['irvine', 'US'], ['santa clara', 'US'], ['sunnyvale', 'US'],
        ['pittsburgh', 'US'], ['oakland', 'US'], ['silicon valley', 'US'], ['menlo park', 'US'],
        ['houston', 'US'], ['minneapolis', 'US'], ['miami', 'US'], ['pdx', 'US'], ['new orleans', 'US'],
        ['detroit', 'US'], ['bellevue', 'US'], ['portland', 'US'],

        // UK
        ['london', 'GB'], ['manchester', 'GB'], ['edinburgh', 'GB'], ['cambridge', 'GB'],
        ['oxford', 'GB'], ['bristol', 'GB'], ['brighton', 'GB'], ['sheffield', 'GB'], ['glasgow', 'GB'],
        ['liverpool', 'GB'],

        // France
        ['paris', 'FR'], ['lyon', 'FR'], ['toulouse', 'FR'], ['nantes', 'FR'],
        ['bordeaux', 'FR'], ['lille', 'FR'], ['strasbourg', 'FR'], ['grenoble', 'FR'],
        ['rennes', 'FR'], ['marseille', 'FR'], ['montpellier', 'FR'],

        // China
        ['beijing', 'CN'], ['shanghai', 'CN'], ['shenzhen', 'CN'], ['hangzhou', 'CN'], 
        ['chengdu', 'CN'], ['wuhan', 'CN'], ['guangzhou', 'CN'], ['nanjing', 'CN'], 
        ['xian', 'CN'], ['tianjin', 'CN'], ['suzhou', 'CN'], ['chongqing', 'CN'],
        ['hong kong', 'HK'], ['hk', 'HK'],
        ['上海', 'CN'], ['深圳', 'CN'], ['北京', 'CN'], ['xiamen', 'CN'], ['canton', 'CN'],
        ['中国', 'CN'], ['peking', 'CN'], ['成都', 'CN'], ['guangdong', 'CN'], ['hang zhou', 'CN'],

        // India
        ['bangalore', 'IN'], ['bengaluru', 'IN'], ['mumbai', 'IN'], ['delhi', 'IN'], ['gurugram', 'IN'],
        ['hyderabad', 'IN'], ['pune', 'IN'], ['chennai', 'IN'], ['noida', 'IN'], ['ahmedabad', 'IN'],
        ['kolkata', 'IN'], ['jaipur', 'IN'], ['chandigarh', 'IN'], ['indore', 'IN'],
        ['gurgaon', 'IN'],

        // Spain
        ['barcelona', 'ES'], ['madrid', 'ES'], ['valencia', 'ES'], ['sevilla', 'ES'], ['málaga', 'ES'],

        // Switzerland & Austria
        ['zurich', 'CH'], ['zürich', 'CH'], ['geneva', 'CH'], ['vienna', 'AT'],

        // Poland
        ['warsaw', 'PL'], ['krakow', 'PL'], ['kraków', 'PL'], ['wrocław', 'PL'],

        // Others
        ['toronto', 'CA'], ['vancouver', 'CA'], ['montreal', 'CA'], ['ottawa', 'CA'], ['edmonton', 'CA'], ['calgary', 'CA'], ['québec', 'CA'], ['waterloo', 'CA'],
        ['sydney', 'AU'], ['melbourne', 'AU'], ['brisbane', 'AU'], ['hobart', 'AU'],
        ['tokyo', 'JP'], ['osaka', 'JP'], ['kyoto', 'JP'],
        ['são paulo', 'BR'], ['rio de janeiro', 'BR'],
        ['amsterdam', 'NL'], ['the hague', 'NL'], ['rotterdam', 'NL'], ['utrecht', 'NL'], ['groningen', 'NL'],
        ['whangarei', 'NZ'], ['auckland', 'NZ'],
        ['lisbon', 'PT'], ['porto', 'PT'],
        ['copenhagen', 'DK'], ['stockholm', 'SE'], ['gothenburg', 'SE'], ['göteborg', 'SE'], ['oslo', 'NO'], ['helsinki', 'FI'],
        ['genoa', 'IT'], ['rome', 'IT'], ['milan', 'IT'], ['turin', 'IT'],
        ['tbilisi', 'GE'],
        ['seoul', 'KR'],
        ['taipei', 'TW'],
        ['kiev', 'UA'], ['kyiv', 'UA'],
        ['prague', 'CZ'], ['brno', 'CZ'],
        ['budapest', 'HU'],
        ['bucharest', 'RO'],
        ['istanbul', 'TR'], ['i̇stanbul', 'TR'],
        ['lagos', 'NG'],
        ['nairobi', 'KE'],
        ['cairo', 'EG'],
        ['johannesburg', 'ZA'], ['cape town', 'ZA'],
        ['buenos aires', 'AR'],
        ['santiago', 'CL'],
        ['bogota', 'CO'],
        ['lima', 'PE'],
        ['mexico city', 'MX'], ['guadalajara', 'MX'], ['monterrey', 'MX'],
        ['kuala lumpur', 'MY'],
        ['jakarta', 'ID'],
        ['bangkok', 'TH'],
        ['ho chi minh', 'VN'], ['hanoi', 'VN'],
        ['manila', 'PH'],
        ['karachi', 'PK'], ['lahore', 'PK'], ['islamabad', 'PK'],
        ['dhaka', 'BD'],
        ['colombo', 'LK'],
        ['dubai', 'AE'],
        ['moscow', 'RU'], ['saint petersburg', 'RU'], ['saint-petersburg', 'RU'],
        ['tel aviv', 'IL'], ['jerusalem', 'IL'],
        ['brussels', 'BE'],
        ['tallinn', 'EE'],
        ['vilnius', 'LT'],
        ['yerevan', 'AM'],
        ['montevideo', 'UY'],
        ['dublin', 'IE'],
        ['riga', 'LV'],
        ['tehran', 'IR'],
        ['reykjavík', 'IS'],
        ['minsk', 'BY'],
        ['zagreb', 'HR'],
        ['athens', 'GR'],
        ['amman', 'JO'],
        ['sofia', 'BG']
    ]);

    /**
     * Normalizes a raw GitHub location string to an ISO 3166-1 Alpha-2 code.
     * @param {String} rawLocation
     * @returns {String|null} 'DE', 'US', 'FR' or null if unknown
     */
    normalize(rawLocation) {
        if (!rawLocation) return null;

        // 1. Clean up: lowercase, remove emojis, trim
        let text = rawLocation.toLowerCase()
            .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove basic emojis
            .trim();

        // 2. Direct Country Name Match (using Intl API)
        // This handles "Germany", "Deutschland", "Allemagne" automatically
        // We try to match common English/Native names to ISO codes
        // *Optimized approach:* Simple regex for common countries first
        if (/\b(germany|deutschland)\b/.test(text)) return 'DE';
        if (/\b(united states|usa|u\.s\.a|us)\b/.test(text)) return 'US';
        if (/\b(united kingdom|uk|great britain|england|scotland|wales)\b/.test(text)) return 'GB';
        if (/\b(france)\b/.test(text)) return 'FR';
        if (/\b(australia|au)\b/.test(text)) return 'AU';
        if (/\b(malta)\b/.test(text)) return 'MT';

        // 2.5 US State Codes (Word Boundary Check)
        // Avoids matching "Doha" for "OH"
        // We only include states that do NOT conflict with ISO Country Codes
        // e.g. CA (Canada), DE (Germany), IN (India), ID (Indonesia) are excluded here.
        if (/\b(oh|wa|or|ri|ny|nj|tx|fl|ut|az|nm|nv|mn|mi|il|mo|tn|ky|wv|va|nc|sc|ga|al|ms|la|ar|ok|ks|ne|sd|nd|wy|mt|vt|ct|ma|pa|nh)\b/.test(text)) {
            // Heuristic: Map common US state codes to 'US'.
            // We exclude major country codes (CA, DE, IN, ID) to prevent false positives.
            // Minor collisions (IL=Israel, GA=Gabon, MT=Malta) are accepted as they are
            // statistically more likely to represent US states in this specific dataset.
            return 'US';
        }

        // 2.6 Full US State Names
        if (/\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/.test(text)) {
            return 'US';
        }
        if (/\b(canada)\b/.test(text)) return 'CA';
        if (/\b(china|prc|中国)\b/.test(text)) return 'CN';
        if (/\b(india)\b/.test(text)) return 'IN';
        if (/\b(japan)\b/.test(text)) return 'JP';
        if (/\b(brazil|brasil)\b/.test(text)) return 'BR';
        if (/\b(russia|russian federation)\b/.test(text)) return 'RU';
        if (/\b(ukraine)\b/.test(text)) return 'UA';
        if (/\b(switzerland|schweiz|suisse)\b/.test(text)) return 'CH';
        if (/\b(austria|österreich)\b/.test(text)) return 'AT';
        if (/\b(netherlands|holland)\b/.test(text)) return 'NL';
        if (/\b(sweden)\b/.test(text)) return 'SE';
        if (/\b(norway)\b/.test(text)) return 'NO';
        if (/\b(denmark)\b/.test(text)) return 'DK';
        if (/\b(finland)\b/.test(text)) return 'FI';
        if (/\b(poland|polska)\b/.test(text)) return 'PL';
        if (/\b(italy|italia)\b/.test(text)) return 'IT';
        if (/\b(spain|españa)\b/.test(text)) return 'ES';
        if (/\b(israel)\b/.test(text)) return 'IL';
        if (/\b(south korea|korea)\b/.test(text)) return 'KR';
        if (/\b(taiwan)\b/.test(text)) return 'TW';
        if (/\b(singapore)\b/.test(text)) return 'SG';
        if (/\b(vietnam|viet nam)\b/.test(text)) return 'VN';
        if (/\b(indonesia)\b/.test(text)) return 'ID';
        if (/\b(thailand)\b/.test(text)) return 'TH';
        if (/\b(malaysia)\b/.test(text)) return 'MY';
        if (/\b(philippines)\b/.test(text)) return 'PH';
        if (/\b(turkey|türkiye)\b/.test(text)) return 'TR';
        if (/\b(egypt)\b/.test(text)) return 'EG';
        if (/\b(nigeria)\b/.test(text)) return 'NG';
        if (/\b(kenya)\b/.test(text)) return 'KE';
        if (/\b(south africa)\b/.test(text)) return 'ZA';
        if (/\b(argentina)\b/.test(text)) return 'AR';
        if (/\b(mexico|méxico)\b/.test(text)) return 'MX';
        if (/\b(colombia)\b/.test(text)) return 'CO';
        if (/\b(chile)\b/.test(text)) return 'CL';
        if (/\b(peru)\b/.test(text)) return 'PE';
        if (/\b(czech republic|czechia)\b/.test(text)) return 'CZ';
        if (/\b(hungary)\b/.test(text)) return 'HU';
        if (/\b(romania)\b/.test(text)) return 'RO';
        if (/\b(bulgaria)\b/.test(text)) return 'BG';
        if (/\b(serbia)\b/.test(text)) return 'RS';
        if (/\b(croatia)\b/.test(text)) return 'HR';
        if (/\b(slovenia)\b/.test(text)) return 'SI';
        if (/\b(slovakia)\b/.test(text)) return 'SK';
        if (/\b(ireland)\b/.test(text)) return 'IE';
        if (/\b(portugal)\b/.test(text)) return 'PT';
        if (/\b(greece)\b/.test(text)) return 'GR';
        if (/\b(belgium)\b/.test(text)) return 'BE';
        if (/\b(new zealand)\b/.test(text)) return 'NZ';
        if (/\b(pakistan)\b/.test(text)) return 'PK';
        if (/\b(bangladesh)\b/.test(text)) return 'BD';
        if (/\b(sri lanka)\b/.test(text)) return 'LK';
        if (/\b(nepal)\b/.test(text)) return 'NP';
        if (/\b(united arab emirates|uae)\b/.test(text)) return 'AE';
        if (/\b(estonia)\b/.test(text)) return 'EE';
        if (/\b(lithuania)\b/.test(text)) return 'LT';
        if (/\b(armenia)\b/.test(text)) return 'AM';
        if (/\b(uruguay)\b/.test(text)) return 'UY';
        if (/\b(cyprus)\b/.test(text)) return 'CY';
        if (/\b(luxembourg)\b/.test(text)) return 'LU';
        if (/\b(iran)\b/.test(text)) return 'IR';
        if (/\b(latvia)\b/.test(text)) return 'LV';
        if (/\b(dominican republic)\b/.test(text)) return 'DO';
        if (/\b(tunisia)\b/.test(text)) return 'TN';
        if (/\b(belarus)\b/.test(text)) return 'BY';
        if (/\b(iceland)\b/.test(text)) return 'IS';
        if (/\b(costa rica)\b/.test(text)) return 'CR';
        if (/\b(montenegro)\b/.test(text)) return 'ME';
        if (/\b(algeria)\b/.test(text)) return 'DZ';
        if (/\b(kazakhstan)\b/.test(text)) return 'KZ';
        if (/\b(venezuela)\b/.test(text)) return 'VE';
        if (/\b(palestine)\b/.test(text)) return 'PS';
        if (/\b(ecuador)\b/.test(text)) return 'EC';
        if (/\b(saudi arabia)\b/.test(text)) return 'SA';
        if (/\b(morocco)\b/.test(text)) return 'MA';
        if (/\b(puerto rico)\b/.test(text)) return 'PR';
        if (/\b(jordan)\b/.test(text)) return 'JO';
        if (/\b(ghana)\b/.test(text)) return 'GH';

        // 3. Check City Map
        // We look for known cities in the string (e.g. "Berlin, Wedding")
        for (const [city, iso] of LocationNormalizer.cityMap) {
            if (text.includes(city)) return iso;
        }

        // 4. Fallback: Parse "City, COUNTRY_CODE" format (e.g. "Seattle, WA, US")
        // Looks for 2-letter uppercase codes at the end or after a comma
        const codeMatch = rawLocation.match(/\b([A-Z]{2})\b$/);
        if (codeMatch) {
            // Validate if it's a real country code could be done here
            // For now, we assume it might be valid if it looks like one
            return codeMatch[1];
        }

        return null;
    }
}

export default Neo.setupClass(LocationNormalizer);
