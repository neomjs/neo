/**
 * @summary Deterministic local order generator shared by `examples/grid/orderReviewDesk` and the
 * enterprise Grid tutorial. Produces `100,000` reproducible B2B hardware orders (`ORD-000001`..`ORD-100000`)
 * with zero network I/O and six seeded quantity exceptions spanning initial viewport, mid-sheet, and deep rows.
 */

export const DEFAULT_ORDER_COUNT = 100000;
export const MAX_ORDER_QTY       = 50;

/**
 * Six deterministic invalid-quantity rows (`quantity < 1` or `quantity > MAX_ORDER_QTY`) spanning top, middle, and
 * tail indices so visitors see an exception immediately on launch, can jump to a deep row (`ORD-099985`), and can
 * filter down to a completable six-item repair queue.
 * @type {ReadonlyArray<{index: Number, orderId: String, quantity: Number}>}
 */
export const SEEDED_EXCEPTIONS = Object.freeze([
    Object.freeze({index: 3,     orderId: 'ORD-000004', quantity: 74}),
    Object.freeze({index: 18,    orderId: 'ORD-000019', quantity: 0}),
    Object.freeze({index: 2449,  orderId: 'ORD-002450', quantity: 68}),
    Object.freeze({index: 24999, orderId: 'ORD-025000', quantity: -3}),
    Object.freeze({index: 63999, orderId: 'ORD-064000', quantity: 85}),
    Object.freeze({index: 99984, orderId: 'ORD-099985', quantity: 62})
]);

const EXCEPTION_BY_INDEX = new Map(SEEDED_EXCEPTIONS.map(entry => [entry.index, entry.quantity]));

const CUSTOMERS = Object.freeze([
    'Nordhavn Marine Lab',
    'Helvetia Precision AG',
    'Kansai Photonics KK',
    'Cascadia Robotics Inc.',
    'Rheinmetall Sensorik',
    'Solent Harbor Systems',
    'Aarhus Wind Telemetry',
    'Atacama Array Observatory',
    'Vltava Optical Works',
    'Singapura Fab Logistics',
    'Skagerrak Subsea AS',
    'Montréal Cryo Instruments'
]);

const REGIONS = Object.freeze(['EMEA', 'EMEA', 'APAC', 'AMER', 'EMEA', 'EMEA', 'EMEA', 'AMER', 'EMEA', 'APAC', 'EMEA', 'AMER']);

const CATALOG_ITEMS = Object.freeze([
    Object.freeze({sku: 'MOD-410', item: 'EtherCAT Servo Coupler',   unitPrice: 185}),
    Object.freeze({sku: 'OPT-208', item: 'Bragg Grating Strain Kit', unitPrice: 340}),
    Object.freeze({sku: 'PWR-512', item: 'DIN-Rail 48V Supply',      unitPrice: 125}),
    Object.freeze({sku: 'SEN-119', item: 'Tri-Axis MEMS Accelerometer', unitPrice: 95}),
    Object.freeze({sku: 'CAB-304', item: 'Halogen-Free Trunk 10m',    unitPrice: 64}),
    Object.freeze({sku: 'DAQ-880', item: '24-Bit Bridge Input Card', unitPrice: 490}),
    Object.freeze({sku: 'ENC-605', item: 'Absolute Rotary Encoder',  unitPrice: 275}),
    Object.freeze({sku: 'THM-142', item: 'Pt100 RTD Probe Pair',     unitPrice: 78})
]);

/**
 * @summary Formats a 1-based order number as a 6-digit `ORD-XXXXXX` identifier.
 * @param {Number} sequenceNumber 1-based sequence number.
 * @returns {String}
 */
export function formatOrderId(sequenceNumber) {
    return `ORD-${String(sequenceNumber).padStart(6, '0')}`
}

/**
 * @summary Generates `count` deterministic local order rows suitable for `OrderStore` (`autoInitRecords: false`).
 * @param {Number} [count=DEFAULT_ORDER_COUNT]
 * @returns {Object[]}
 */
export function generateOrders(count = DEFAULT_ORDER_COUNT) {
    const rows       = new Array(count),
          shipDates  = Array.from({length: 28}, (_, dayOffset) => new Date(2026, 11, 1 + dayOffset)),
          custLen    = CUSTOMERS.length,
          catalogLen = CATALOG_ITEMS.length;

    for (let i = 0; i < count; i++) {
        const custIndex     = (i * 5 + 1) % custLen,
              catalogEntry  = CATALOG_ITEMS[(i * 3 + 2) % catalogLen],
              seededQty     = EXCEPTION_BY_INDEX.get(i),
              validQuantity = ((i * 7 + 3) % 42) + 1;

        rows[i] = {
            orderId    : formatOrderId(i + 1),
            customer   : CUSTOMERS[custIndex],
            region     : REGIONS[custIndex],
            sku        : catalogEntry.sku,
            item       : catalogEntry.item.trim(),
            quantity   : seededQty !== undefined ? seededQty : validQuantity,
            maxOrderQty: MAX_ORDER_QTY,
            unitPrice  : catalogEntry.unitPrice,
            shipDate   : shipDates[i % 28]
        }
    }

    return rows
}
