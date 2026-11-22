/**
 * The markets: each with its share of the orders, in thousandths, and the number of customers that order there.
 * @member {Object[]} markets
 */
export const markets = [
    {country: 'DE', customers: 5200, share: 190},
    {country: 'DK', customers:  900, share:  50},
    {country: 'FI', customers:  700, share:  50},
    {country: 'FR', customers: 4100, share: 130},
    {country: 'GB', customers: 4800, share: 160},
    {country: 'NL', customers: 1600, share:  90},
    {country: 'SE', customers: 1300, share:  70},
    {country: 'US', customers: 6100, share: 260}
];

/**
 * @summary The example's payload: `count` fictional orders as one JSON document, the same ones on every load.
 *
 * The document is built in slices with a pause after each, so the worker that builds it keeps answering. It never
 * exists as one string here: the `Blob` joins the slices, and a pipeline's connection fetches it by its URL.
 * @param {Number}   count
 * @param {Function} pause Returns a promise; awaited after each slice
 * @param {Number}   [sliceSize=25000]
 * @returns {Promise<Blob>}
 */
export async function createOrdersBlob(count, pause, sliceSize=25000) {
    let seed = 21880;
    const
        parts = ['['],
        pad   = value => String(value).padStart(2, '0'),
        /** @summary Advances the fixed seed and samples using its full unsigned range. */
        draw  = length => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return Math.floor(seed / 4294967296 * length)
        };

    for (let start = 0; start < count; start += sliceSize) {
        const
            end   = Math.min(count, start + sliceSize),
            slice = [];

        for (let index = start; index < end; index++) {
            // The market whose share of the thousand the draw falls into; a customer's number is its market's own
            let pick = draw(1000), market = 0, first = 1;

            while (pick >= markets[market].share) {
                pick  -= markets[market].share;
                first += markets[market].customers;
                market++
            }

            slice.push(JSON.stringify({
                id      : index + 1,
                customer: `Customer ${first + draw(markets[market].customers)}`,
                country : markets[market].country,
                amount  : 100 + draw(9900),
                placed  : `2026-${pad(1 + draw(12))}-${pad(1 + draw(28))}T${pad(draw(24))}:00:00Z`
            }))
        }

        parts.push((start ? ',' : '') + slice.join(','));

        await pause()
    }

    parts.push(']');

    return new Blob(parts, {type: 'application/json'})
}
