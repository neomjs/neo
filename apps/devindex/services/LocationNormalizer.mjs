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

        // USA (Common Tech Hubs)
        ['san francisco', 'US'], ['sf', 'US'], ['bay area', 'US'], ['new york', 'US'],
        ['nyc', 'US'], ['seattle', 'US'], ['austin', 'US'], ['boston', 'US'],
        ['los angeles', 'US'], ['chicago', 'US'], ['denver', 'US'], ['palo alto', 'US'],
        ['mountain view', 'US'], ['cupertino', 'US'], ['redmond', 'US'],
        ['washington', 'US'], ['washington dc', 'US'], ['washington d.c.', 'US'], ['dc', 'US'],

        // UK
        ['london', 'GB'], ['manchester', 'GB'], ['edinburgh', 'GB'], ['cambridge', 'GB'],
        ['oxford', 'GB'], ['bristol', 'GB'],

        // France
        ['paris', 'FR'], ['lyon', 'FR'], ['toulouse', 'FR'], ['nantes', 'FR'],

        // Others
        ['toronto', 'CA'], ['vancouver', 'CA'], ['montreal', 'CA'],
        ['sydney', 'AU'], ['melbourne', 'AU'],
        ['tokyo', 'JP'], ['beijing', 'CN'], ['shanghai', 'CN'], ['shenzhen', 'CN'],
        ['bangalore', 'IN'], ['bengaluru', 'IN'], ['mumbai', 'IN'], ['delhi', 'IN']
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
        if (/\b(canada)\b/.test(text)) return 'CA';
        if (/\b(china|prc)\b/.test(text)) return 'CN';
        if (/\b(india)\b/.test(text)) return 'IN';
        if (/\b(japan)\b/.test(text)) return 'JP';
        if (/\b(brazil|brasil)\b/.test(text)) return 'BR';
        if (/\b(russia)\b/.test(text)) return 'RU';
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
        if (/\b(vietnam)\b/.test(text)) return 'VN';
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
        if (/\b(mexico)\b/.test(text)) return 'MX';
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
