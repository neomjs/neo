import Base from '../core/Base.mjs';

/**
 * @class Neo.util.CountryFlags
 * @extends Neo.core.Base
 */
class CountryFlags extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.CountryFlags'
         * @protected
         */
        className: 'Neo.util.CountryFlags'
    }

    /**
     * Map of common country names/aliases to ISO 2-letter codes (lowercase)
     * @member {Object} aliasMap
     * @protected
     * @static
     */
    static aliasMap = {
        'bolivia'                                : 'bo',
        'bosnia'                                 : 'ba',
        'cape verde'                             : 'cv',
        'czechia'                                : 'cz',
        'democratic republic of congo'           : 'cd',
        'drc'                                    : 'cd',
        'england'                                : 'gb-eng', // subdivision
        'eswatini'                               : 'sz',
        'great britain'                          : 'gb',
        'hong kong'                              : 'hk',
        'iran'                                   : 'ir',
        'ivory coast'                            : 'ci',
        'laos'                                   : 'la',
        'macau'                                  : 'mo',
        'macedonia'                              : 'mk',
        'moldova'                                : 'md',
        'north korea'                            : 'kp',
        'palestinian territory'                  : 'ps',
        'republic of the congo'                  : 'cg',
        'russia'                                 : 'ru',
        'scotland'                               : 'gb-sct', // subdivision
        'south korea'                            : 'kr',
        'syria'                                  : 'sy',
        'swaziland'                              : 'sz',
        'taiwan'                                 : 'tw',
        'tanzania'                               : 'tz',
        'timor-leste'                            : 'tl',
        'uae'                                    : 'ae',
        'uk'                                     : 'gb',
        'united kingdom'                         : 'gb',
        'united states'                          : 'us',
        'usa'                                    : 'us',
        'venezuela'                              : 've',
        'vietnam'                                : 'vn',
        'wales'                                  : 'gb-wls'  // subdivision
    }

    /**
     * ISO 3166-1 alpha-2 codes and names
     * @member {Object[]} countries
     * @protected
     * @static
     */
    static countries = [
        {"code":"af", "name":"afghanistan"},
        {"code":"ax", "name":"åland islands"},
        {"code":"al", "name":"albania"},
        {"code":"dz", "name":"algeria"},
        {"code":"as", "name":"american samoa"},
        {"code":"ad", "name":"andorra"},
        {"code":"ao", "name":"angola"},
        {"code":"ai", "name":"anguilla"},
        {"code":"aq", "name":"antarctica"},
        {"code":"ag", "name":"antigua and barbuda"},
        {"code":"ar", "name":"argentina"},
        {"code":"am", "name":"armenia"},
        {"code":"aw", "name":"aruba"},
        {"code":"au", "name":"australia"},
        {"code":"at", "name":"austria"},
        {"code":"az", "name":"azerbaijan"},
        {"code":"bs", "name":"bahamas"},
        {"code":"bh", "name":"bahrain"},
        {"code":"bd", "name":"bangladesh"},
        {"code":"bb", "name":"barbados"},
        {"code":"by", "name":"belarus"},
        {"code":"be", "name":"belgium"},
        {"code":"bz", "name":"belize"},
        {"code":"bj", "name":"benin"},
        {"code":"bm", "name":"bermuda"},
        {"code":"bt", "name":"bhutan"},
        {"code":"bo", "name":"bolivia"},
        {"code":"ba", "name":"bosnia and herzegovina"},
        {"code":"bw", "name":"botswana"},
        {"code":"bv", "name":"bouvet island"},
        {"code":"br", "name":"brazil"},
        {"code":"io", "name":"british indian ocean territory"},
        {"code":"bn", "name":"brunei darussalam"},
        {"code":"bg", "name":"bulgaria"},
        {"code":"bf", "name":"burkina faso"},
        {"code":"bi", "name":"burundi"},
        {"code":"kh", "name":"cambodia"},
        {"code":"cm", "name":"cameroon"},
        {"code":"ca", "name":"canada"},
        {"code":"cv", "name":"cape verde"},
        {"code":"ky", "name":"cayman islands"},
        {"code":"cf", "name":"central african republic"},
        {"code":"td", "name":"chad"},
        {"code":"cl", "name":"chile"},
        {"code":"cn", "name":"china"},
        {"code":"cx", "name":"christmas island"},
        {"code":"cc", "name":"cocos (keeling) islands"},
        {"code":"co", "name":"colombia"},
        {"code":"km", "name":"comoros"},
        {"code":"cg", "name":"congo"},
        {"code":"cd", "name":"congo, the democratic republic of the"},
        {"code":"ck", "name":"cook islands"},
        {"code":"cr", "name":"costa rica"},
        {"code":"ci", "name":"cote d'ivoire"},
        {"code":"hr", "name":"croatia"},
        {"code":"cu", "name":"cuba"},
        {"code":"cy", "name":"cyprus"},
        {"code":"cz", "name":"czech republic"},
        {"code":"dk", "name":"denmark"},
        {"code":"dj", "name":"djibouti"},
        {"code":"dm", "name":"dominica"},
        {"code":"do", "name":"dominican republic"},
        {"code":"ec", "name":"ecuador"},
        {"code":"eg", "name":"egypt"},
        {"code":"sv", "name":"el salvador"},
        {"code":"gq", "name":"equatorial guinea"},
        {"code":"er", "name":"eritrea"},
        {"code":"ee", "name":"estonia"},
        {"code":"et", "name":"ethiopia"},
        {"code":"fk", "name":"falkland islands (malvinas)"},
        {"code":"fo", "name":"faroe islands"},
        {"code":"fj", "name":"fiji"},
        {"code":"fi", "name":"finland"},
        {"code":"fr", "name":"france"},
        {"code":"gf", "name":"french guiana"},
        {"code":"pf", "name":"french polynesia"},
        {"code":"tf", "name":"french southern territories"},
        {"code":"ga", "name":"gabon"},
        {"code":"gm", "name":"gambia"},
        {"code":"ge", "name":"georgia"},
        {"code":"de", "name":"germany"},
        {"code":"gh", "name":"ghana"},
        {"code":"gi", "name":"gibraltar"},
        {"code":"gr", "name":"greece"},
        {"code":"gl", "name":"greenland"},
        {"code":"gd", "name":"grenada"},
        {"code":"gp", "name":"guadeloupe"},
        {"code":"gu", "name":"guam"},
        {"code":"gt", "name":"guatemala"},
        {"code":"gg", "name":"guernsey"},
        {"code":"gn", "name":"guinea"},
        {"code":"gw", "name":"guinea-bissau"},
        {"code":"gy", "name":"guyana"},
        {"code":"ht", "name":"haiti"},
        {"code":"hm", "name":"heard island and mcdonald islands"},
        {"code":"va", "name":"holy see (vatican city state)"},
        {"code":"hn", "name":"honduras"},
        {"code":"hk", "name":"hong kong"},
        {"code":"hu", "name":"hungary"},
        {"code":"is", "name":"iceland"},
        {"code":"in", "name":"india"},
        {"code":"id", "name":"indonesia"},
        {"code":"ir", "name":"iran, islamic republic of"},
        {"code":"iq", "name":"iraq"},
        {"code":"ie", "name":"ireland"},
        {"code":"im", "name":"isle of man"},
        {"code":"il", "name":"israel"},
        {"code":"it", "name":"italy"},
        {"code":"jm", "name":"jamaica"},
        {"code":"jp", "name":"japan"},
        {"code":"je", "name":"jersey"},
        {"code":"jo", "name":"jordan"},
        {"code":"kz", "name":"kazakhstan"},
        {"code":"ke", "name":"kenya"},
        {"code":"ki", "name":"kiribati"},
        {"code":"kp", "name":"korea, democratic people's republic of"},
        {"code":"kr", "name":"korea, republic of"},
        {"code":"kw", "name":"kuwait"},
        {"code":"kg", "name":"kyrgyzstan"},
        {"code":"la", "name":"lao people's democratic republic"},
        {"code":"lv", "name":"latvia"},
        {"code":"lb", "name":"lebanon"},
        {"code":"ls", "name":"lesotho"},
        {"code":"lr", "name":"liberia"},
        {"code":"ly", "name":"libyan arab jamahiriya"},
        {"code":"li", "name":"liechtenstein"},
        {"code":"lt", "name":"lithuania"},
        {"code":"lu", "name":"luxembourg"},
        {"code":"mo", "name":"macao"},
        {"code":"mk", "name":"macedonia, the former yugoslav republic of"},
        {"code":"mg", "name":"madagascar"},
        {"code":"mw", "name":"malawi"},
        {"code":"my", "name":"malaysia"},
        {"code":"mv", "name":"maldives"},
        {"code":"ml", "name":"mali"},
        {"code":"mt", "name":"malta"},
        {"code":"mh", "name":"marshall islands"},
        {"code":"mq", "name":"martinique"},
        {"code":"mr", "name":"mauritania"},
        {"code":"mu", "name":"mauritius"},
        {"code":"yt", "name":"mayotte"},
        {"code":"mx", "name":"mexico"},
        {"code":"fm", "name":"micronesia, federated states of"},
        {"code":"md", "name":"moldova, republic of"},
        {"code":"mc", "name":"monaco"},
        {"code":"mn", "name":"mongolia"},
        {"code":"ms", "name":"montserrat"},
        {"code":"ma", "name":"morocco"},
        {"code":"mz", "name":"mozambique"},
        {"code":"mm", "name":"myanmar"},
        {"code":"na", "name":"namibia"},
        {"code":"nr", "name":"nauru"},
        {"code":"np", "name":"nepal"},
        {"code":"nl", "name":"netherlands"},
        {"code":"an", "name":"netherlands antilles"},
        {"code":"nc", "name":"new caledonia"},
        {"code":"nz", "name":"new zealand"},
        {"code":"ni", "name":"nicaragua"},
        {"code":"ne", "name":"niger"},
        {"code":"ng", "name":"nigeria"},
        {"code":"nu", "name":"niue"},
        {"code":"nf", "name":"norfolk island"},
        {"code":"mp", "name":"northern mariana islands"},
        {"code":"no", "name":"norway"},
        {"code":"om", "name":"oman"},
        {"code":"pk", "name":"pakistan"},
        {"code":"pw", "name":"palau"},
        {"code":"ps", "name":"palestinian territory, occupied"},
        {"code":"pa", "name":"panama"},
        {"code":"pg", "name":"papua new guinea"},
        {"code":"py", "name":"paraguay"},
        {"code":"pe", "name":"peru"},
        {"code":"ph", "name":"philippines"},
        {"code":"pn", "name":"pitcairn"},
        {"code":"pl", "name":"poland"},
        {"code":"pt", "name":"portugal"},
        {"code":"pr", "name":"puerto rico"},
        {"code":"qa", "name":"qatar"},
        {"code":"re", "name":"reunion"},
        {"code":"ro", "name":"romania"},
        {"code":"ru", "name":"russian federation"},
        {"code":"rw", "name":"rwanda"},
        {"code":"sh", "name":"saint helena"},
        {"code":"kn", "name":"saint kitts and nevis"},
        {"code":"lc", "name":"saint lucia"},
        {"code":"pm", "name":"saint pierre and miquelon"},
        {"code":"vc", "name":"saint vincent and the grenadines"},
        {"code":"ws", "name":"samoa"},
        {"code":"sm", "name":"san marino"},
        {"code":"st", "name":"sao tome and principe"},
        {"code":"sa", "name":"saudi arabia"},
        {"code":"sn", "name":"senegal"},
        {"code":"cs", "name":"serbia and montenegro"},
        {"code":"sc", "name":"seychelles"},
        {"code":"sl", "name":"sierra leone"},
        {"code":"sg", "name":"singapore"},
        {"code":"sk", "name":"slovakia"},
        {"code":"si", "name":"slovenia"},
        {"code":"sb", "name":"solomon islands"},
        {"code":"so", "name":"somalia"},
        {"code":"za", "name":"south africa"},
        {"code":"gs", "name":"south georgia and the south sandwich islands"},
        {"code":"es", "name":"spain"},
        {"code":"lk", "name":"sri lanka"},
        {"code":"sd", "name":"sudan"},
        {"code":"sr", "name":"suriname"},
        {"code":"sj", "name":"svalbard and jan mayen"},
        {"code":"sz", "name":"swaziland"},
        {"code":"se", "name":"sweden"},
        {"code":"ch", "name":"switzerland"},
        {"code":"sy", "name":"syrian arab republic"},
        {"code":"tw", "name":"taiwan"},
        {"code":"tj", "name":"tajikistan"},
        {"code":"tz", "name":"tanzania, united republic of"},
        {"code":"th", "name":"thailand"},
        {"code":"tl", "name":"timor-leste"},
        {"code":"tg", "name":"togo"},
        {"code":"tk", "name":"tokelau"},
        {"code":"to", "name":"tonga"},
        {"code":"tt", "name":"trinidad and tobago"},
        {"code":"tn", "name":"tunisia"},
        {"code":"tr", "name":"turkey"},
        {"code":"tm", "name":"turkmenistan"},
        {"code":"tc", "name":"turks and caicos islands"},
        {"code":"tv", "name":"tuvalu"},
        {"code":"ug", "name":"uganda"},
        {"code":"ua", "name":"ukraine"},
        {"code":"ae", "name":"united arab emirates"},
        {"code":"gb", "name":"united kingdom"},
        {"code":"us", "name":"united states"},
        {"code":"um", "name":"united states minor outlying islands"},
        {"code":"uy", "name":"uruguay"},
        {"code":"uz", "name":"uzbekistan"},
        {"code":"vu", "name":"vanuatu"},
        {"code":"ve", "name":"venezuela"},
        {"code":"vn", "name":"vietnam"},
        {"code":"vg", "name":"virgin islands, british"},
        {"code":"vi", "name":"virgin islands, u.s."}, 
        {"code":"wf", "name":"wallis and futuna"},
        {"code":"eh", "name":"western sahara"},
        {"code":"ye", "name":"yemen"},
        {"code":"zm", "name":"zambia"},
        {"code":"zw", "name":"zimbabwe"}
    ]

    /**
     * Tries to find a country code for a given string (name or code).
     * @param {String} input
     * @returns {String|null} ISO 2-letter code (lowercase) or null
     */
    static getCountryCode(input) {
        if (!input || typeof input !== 'string') return null;

        const
            normalized = input.trim().toLowerCase(),
            {aliasMap, countries} = CountryFlags;

        // 1. Check alias map
        if (aliasMap[normalized]) {
            return aliasMap[normalized]
        }

        // 2. Check exact code match
        if (normalized.length === 2) {
            return normalized
        }

        // 3. Check exact name match
        const exactMatch = countries.find(c => c.name === normalized);
        if (exactMatch) {
            return exactMatch.code
        }

        // 4. Check if input contains a country name
        // Sort countries by name length descending to match "United States" before "United" (if that existed)
        // or "Dominican Republic" before "Dominica"
        const sortedCountries = [...countries].sort((a, b) => b.name.length - a.name.length);

        for (const country of sortedCountries) {
            // Check for whole word match to avoid "Mali" matching "Somalia"
            const regex = new RegExp(`\\b${country.name}\\b`, 'i');
            if (regex.test(normalized)) {
                return country.code
            }
        }

        // 5. Check alias map for substring match
        for (const [alias, code] of Object.entries(aliasMap)) {
             const regex = new RegExp(`\\b${alias}\\b`, 'i');
             if (regex.test(normalized)) {
                 return code
             }
        }

        return null
    }

    /**
     * @param {String} nameOrCode
     * @returns {String} url
     */
    static getFlagUrl(nameOrCode) {
        const code = CountryFlags.getCountryCode(nameOrCode);

        // Ensure we only use valid 2-letter codes
        if (!code || !/^[a-z]{2}$/.test(code)) {
            return null
        }

        // Using HatScripts/circle-flags CDN
        return `https://hatscripts.github.io/circle-flags/flags/${code}.svg`
    }
}

Neo.setupClass(CountryFlags);

export default CountryFlags;
