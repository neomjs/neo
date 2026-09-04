import {inflateSync} from 'node:zlib';

/**
 * @summary Reads what a screenshot shows, for canvases whose pixels no page script can see.
 *
 * A canvas whose control was transferred to a worker (`transferControlToOffscreen`) displays the
 * worker's frames, but reads as blank from the page: `drawImage(placeholder)` copies nothing and
 * `getContext` is refused. The compositor still paints it, so an element screenshot is the one
 * truthful read of "drawn or blank" — and Playwright hands that back as PNG bytes. This decodes
 * the 8-bit, non-interlaced RGB/RGBA PNGs Playwright produces and counts how many pixels differ
 * from the dominant colour, which on a cell canvas is its background.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * @summary Decodes an 8-bit non-interlaced RGB or RGBA PNG into raw pixel bytes.
 * @param {Buffer} buffer PNG bytes.
 * @returns {{width: Number, height: Number, channels: Number, pixels: Buffer}}
 */
export function decodePng(buffer) {
    SIGNATURE.forEach((byte, index) => {
        if (buffer[index] !== byte) {
            throw new Error('not a PNG')
        }
    });

    let offset = 8,
        bitDepth, colorType, height, interlace, width;

    const idat = [];

    while (offset < buffer.length) {
        const
            length = buffer.readUInt32BE(offset),
            type   = buffer.toString('ascii', offset + 4, offset + 8),
            data   = buffer.subarray(offset + 8, offset + 8 + length);

        if (type === 'IHDR') {
            width     = data.readUInt32BE(0);
            height    = data.readUInt32BE(4);
            bitDepth  = data[8];
            colorType = data[9];
            interlace = data[12]
        } else if (type === 'IDAT') {
            idat.push(data)
        } else if (type === 'IEND') {
            break
        }

        offset += 12 + length
    }

    if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG: bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`)
    }

    const
        channels = colorType === 6 ? 4 : 3,
        stride   = width * channels,
        raw      = inflateSync(Buffer.concat(idat)),
        pixels   = Buffer.alloc(stride * height);

    let inPos = 0;

    for (let y = 0; y < height; y++) {
        const
            filter    = raw[inPos++],
            rowStart  = y * stride,
            prevStart = (y - 1) * stride;

        for (let x = 0; x < stride; x++) {
            const
                rawByte = raw[inPos++],
                a       = x >= channels ? pixels[rowStart + x - channels] : 0,
                b       = y > 0 ? pixels[prevStart + x] : 0,
                c       = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;

            let value;

            switch (filter) {
                case 0: value = rawByte; break;
                case 1: value = rawByte + a; break;
                case 2: value = rawByte + b; break;
                case 3: value = rawByte + ((a + b) >> 1); break;
                case 4: {
                    const
                        p  = a + b - c,
                        pa = Math.abs(p - a),
                        pb = Math.abs(p - b),
                        pc = Math.abs(p - c);

                    value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
                    break
                }
                default: throw new Error(`unknown PNG filter ${filter}`)
            }

            pixels[rowStart + x] = value & 255
        }
    }

    return {width, height, channels, pixels}
}

/**
 * @summary Counts the pixels that differ from the screenshot's dominant colour.
 *
 * On a cell canvas the dominant colour is the background; anything drawn on it — a sparkline's
 * polyline, its anti-aliased edges — counts as unlike. A blank canvas counts zero.
 * @param {Buffer} buffer PNG bytes from `locator.screenshot()`.
 * @param {Number} [tolerance=8] Per-channel distance below which a pixel still counts as the background.
 * @returns {{width: Number, height: Number, total: Number, unlike: Number}}
 */
export function countPixelsUnlikeDominant(buffer, tolerance=8) {
    const
        {width, height, channels, pixels} = decodePng(buffer),
        counts                            = new Map();

    for (let i = 0; i < pixels.length; i += channels) {
        const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];

        counts.set(key, (counts.get(key) || 0) + 1)
    }

    let best = -1, dominant = 0;

    counts.forEach((count, key) => {
        if (count > best) {
            best     = count;
            dominant = key
        }
    });

    const
        dr = (dominant >> 16) & 255,
        dg = (dominant >> 8)  & 255,
        db = dominant & 255;

    let unlike = 0;

    for (let i = 0; i < pixels.length; i += channels) {
        if (Math.abs(pixels[i] - dr) > tolerance || Math.abs(pixels[i + 1] - dg) > tolerance || Math.abs(pixels[i + 2] - db) > tolerance) {
            unlike++
        }
    }

    return {width, height, total: width * height, unlike}
}
