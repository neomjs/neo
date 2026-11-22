import Base from '../../../../src/canvas/Base.mjs';

const
    hasRaf = typeof requestAnimationFrame === 'function',
    TAU    = Math.PI * 2;

/**
 * @summary Draws a galaxy of a million points in the canvas worker, every frame, and says in the canvas itself when
 * the page's main thread is blocked.
 *
 * A frame turns every point around the centre and counts the points per pixel into one `ImageData`. The work is
 * arithmetic in this worker, not a shader: a million points have to be moved somewhere, and here it is not the main
 * thread. The picture is drawn at the canvas's CSS size and scaled up to the device's pixels; the text on top is
 * drawn at device resolution. While a block is announced, a line counts its seconds: during it nothing in the DOM
 * can change, so the canvas is the only place on the page that can still speak.
 *
 * @class Neo.examples.worker.canvas.Renderer
 * @extends Neo.canvas.Base
 * @singleton
 */
class Renderer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.canvas.Renderer'
         * @protected
         */
        className: 'Neo.examples.worker.canvas.Renderer',
        /**
         * The number of points, moved and drawn every frame.
         * @member {Number} pointCount=1000000
         */
        pointCount: 1000000,
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'announceBlock',
                'clearGraph',
                'getStats',
                'initGraph',
                'pause',
                'resume',
                'setTheme',
                'updateMouseState',
                'updateSize',
                'whenDrawn'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The colours per theme: the ground, and three stops a pixel passes through as more points fall on it.
     * @member {Object} colors
     * @static
     */
    static colors = {
        dark : {ground: [9, 12, 22],     stops: [[52, 84, 178],   [112, 196, 255], [255, 250, 236]], text: '#e8ecf6', plate: 'rgba(9, 12, 22, .72)'},
        light: {ground: [244, 246, 251], stops: [[150, 166, 208], [66, 88, 172],   [18, 24, 58]],    text: '#141a33', plate: 'rgba(244, 246, 251, .78)'}
    }

    /**
     * @summary The 256 colours of a pixel by the number of points on it, as the `ImageData` buffer stores them.
     * @param {String} theme 'dark' or 'light'
     * @param {Number} [exposure=1] The mean number of points on a pixel of the galaxy. A small canvas holds the
     * same million points on fewer pixels, and without it every arm would be one flat white.
     * @returns {Uint32Array} Index 0 is the ground; the buffer is little-endian RGBA, so a value is 0xAABBGGRR
     */
    static createPalette(theme, exposure=1) {
        const
            {ground, stops} = Renderer.colors[theme] || Renderer.colors.light,
            palette         = new Uint32Array(256),
            pack            = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0,
            mix             = (from, to, share) => from.map((value, index) => Math.round(value + (to[index] - value) * share));

        palette[0] = pack(ground);

        for (let hits = 1; hits < 256; hits++) {
            // The ramp flattens towards the last stop, and a pixel with few points on it stays faint
            const
                weight = hits / exposure,
                share  = (1 - Math.exp(-weight / 3)) * (stops.length - 1),
                index  = Math.min(stops.length - 2, Math.floor(share));

            palette[hits] = pack(mix(ground, mix(stops[index], stops[index + 1], share - index), Math.min(1, .4 + weight * .2)))
        }

        return palette
    }

    /**
     * @summary The points of a galaxy on the unit disc, in three layers that turn at their own speed: four spiral
     * arms, a thin disc they slide through, and a core.
     * @param {Number}   count
     * @param {Function} [random=Math.random]
     * @returns {{layers: Object[], x: Float32Array, y: Float32Array}} `layers` holds `{start, end, speed}`, the
     * speed in radians per second. Every point lies within the unit circle.
     */
    static createPoints(count, random=Math.random) {
        const
            x      = new Float32Array(count),
            y      = new Float32Array(count),
            layers = [],
            // The sum of three draws is close enough to a bell curve
            bell   = () => random() + random() + random() - 1.5,
            layer  = (share, speed, place) => {
                const
                    start = layers.at(-1)?.end ?? 0,
                    end   = Math.min(count, start + Math.round(count * share));

                for (let index = start; index < end; index++) {
                    const [radius, angle] = place();

                    x[index] = radius * Math.cos(angle);
                    y[index] = radius * Math.sin(angle)
                }

                layers.push({end, speed, start})
            };

        // The smaller of two draws thins out towards 1, so the arms fade before the rim instead of ending on it
        layer(.62, .11, () => {
            const radius = .06 + .94 * Math.min(random(), random()) ** .55;
            return [radius, Math.floor(random() * 4) * TAU / 4 + Math.log(radius) * 2.6 + bell() * .3 * (.3 + radius)]
        });

        // The mean of two draws: an even disc up to half the radius, fading from there to nothing at the rim
        layer(.26, .05, () => [(random() + random()) / 2, random() * TAU]);
        layer(1,   .4,  () => [.16 * Math.abs(bell()) ** 1.4, random() * TAU]);

        return {layers, x, y}
    }

    /**
     * The block the page announced: `{end, start}` in this worker's clock, or `null`.
     * @member {Object|null} block=null
     */
    block = null
    /**
     * The picture at CSS size, scaled into the canvas every frame.
     * @member {OffscreenCanvas|null} field=null
     */
    field = null
    /**
     * @member {OffscreenCanvasRenderingContext2D|null} fieldContext=null
     */
    fieldContext = null
    /**
     * A running mean of the frame rate.
     * @member {Number} fps=0
     */
    fps = 0
    /**
     * Frames painted since the canvas arrived.
     * @member {Number} frames=0
     */
    frames = 0
    /**
     * Where the galaxy stands in the picture: `{centerX, centerY, height, scaleX, scaleY, width}` in CSS pixels.
     * @member {Object|null} geometry=null
     */
    geometry = null
    /**
     * Points per pixel of the frame in work, capped at 255.
     * @member {Uint8Array|null} hits=null
     */
    hits = null
    /**
     * @member {ImageData|null} image=null
     */
    image = null
    /**
     * The timestamp of the previous frame.
     * @member {Number} lastFrame=0
     */
    lastFrame = 0
    /**
     * @member {Uint32Array|null} palette=null
     */
    palette = null
    /**
     * `image`'s buffer as one value per pixel.
     * @member {Uint32Array|null} pixels=null
     */
    pixels = null
    /**
     * @member {Object|null} points=null
     */
    points = null

    /**
     * @summary The page is about to block its main thread: the canvas says so until `duration` has passed.
     * @param {Object} data
     * @param {Number} data.duration In milliseconds
     */
    announceBlock({duration}) {
        const start = performance.now();

        this.block = {end: start + duration, start}
    }

    /**
     * @summary Stops the loop and lets the buffers go.
     */
    clearGraph() {
        const me = this;

        me.animationId && (hasRaf ? cancelAnimationFrame(me.animationId) : clearTimeout(me.animationId));

        super.clearGraph();

        Object.assign(me, {block: null, field: null, fieldContext: null, fps: 0, frames: 0, geometry: null, hits: null, image: null, lastFrame: 0, pixels: null})
    }

    /**
     * @summary Turns every point and counts it into its pixel, then colours the pixels by their count.
     * @param {Number} seconds The time the layers have turned for
     * @protected
     */
    drawField(seconds) {
        const
            me                                        = this,
            {hits, palette, pixels}                   = me,
            {layers, x, y}                            = me.points,
            {centerX, centerY, scaleX, scaleY, width} = me.geometry;

        for (const {end, speed, start} of layers) {
            // The turn and the projection as one matrix per layer
            const
                cos = Math.cos(speed * seconds),
                sin = Math.sin(speed * seconds),
                ax  = cos * scaleX, bx = -sin * scaleX,
                ay  = sin * scaleY, by = cos * scaleY;

            for (let index = start; index < end; index++) {
                const
                    px    = x[index],
                    py    = y[index],
                    pixel = ((centerY + px * ay + py * by) | 0) * width + ((centerX + px * ax + py * bx) | 0),
                    count = hits[pixel];

                if (count !== 255) {
                    hits[pixel] = count + 1
                }
            }
        }

        for (let pixel = 0, {length} = hits; pixel < length; pixel++) {
            pixels[pixel] = palette[hits[pixel]]
        }

        hits.fill(0);
        me.fieldContext.putImageData(me.image, 0, 0)
    }

    /**
     * @summary Writes the two lines only the canvas can still change: the count and the frame rate at the bottom,
     * and, while a block runs, how long the main thread has been away.
     * @param {Number} now
     * @protected
     */
    drawText(now) {
        const
            me               = this,
            {block, context} = me,
            {height, width}  = me.geometry,
            {plate, text}    = Renderer.colors[me.theme] || Renderer.colors.light,
            ratio            = context.canvas.width / width,
            line             = (value, x, y, font, align) => {
                context.font      = font;
                context.textAlign = align;

                const {width: textWidth} = context.measureText(value), left = align === 'center' ? x - textWidth / 2 : x;

                context.fillStyle = plate;
                context.beginPath();
                context.roundRect(left - 10, y - 17, textWidth + 20, 26, 6);
                context.fill();

                context.fillStyle = text;
                context.fillText(value, x, y)
            };

        context.setTransform(ratio, 0, 0, ratio, 0, 0);

        line(`${me.pointCount.toLocaleString('en-US')} points · ${Math.round(me.fps)} fps · drawn in the canvas worker`,
            16, height - 14, '500 12px system-ui, sans-serif', 'left');

        if (block) {
            line(`Main thread blocked · ${((Math.min(now, block.end) - block.start) / 1000).toFixed(1)} s`,
                width / 2, 34, '600 16px system-ui, sans-serif', 'center');
            line('This canvas is drawn in a worker, so it keeps moving.',
                width / 2, 64, '500 12px system-ui, sans-serif', 'center')
        }

        context.setTransform(1, 0, 0, 1, 0, 0)
    }

    /**
     * @returns {{blocked: Boolean, fps: Number, frames: Number, points: Number}}
     */
    getStats() {
        const me = this;

        return {blocked: Boolean(me.block), fps: Math.round(me.fps), frames: me.frames, points: me.pointCount}
    }

    /**
     * @summary One frame, and the request for the next. A paused renderer and one without a canvas end the loop;
     * `resume()` and the next canvas start it again.
     */
    render() {
        const me = this;

        if (!me.canRender || !me.image) {
            me.animationId = null;
            return
        }

        const
            now             = performance.now(),
            {canvas}        = me.context,
            {height, width} = canvas;

        if (me.block && now >= me.block.end + 400) {
            me.block = null
        }
        me.drawField(now / 1000);

        me.context.imageSmoothingEnabled = true;
        me.context.drawImage(me.field, 0, 0, width, height);

        if (me.lastFrame) {
            me.fps = me.fps ? me.fps * .9 + 100 / (now - me.lastFrame) : 1000 / (now - me.lastFrame)
        }

        me.drawText(now);

        me.lastFrame = now;
        me.frames++;

        me.animationId = hasRaf ? requestAnimationFrame(me.renderLoop) : setTimeout(me.renderLoop, 1000 / 60)
    }

    /**
     * @summary Rebuilds what depends on the canvas's CSS size and on the theme: the picture's buffers, the palette
     * and the galaxy's place. The points themselves are made once.
     * @param {Number} width
     * @param {Number} height
     * @protected
     */
    updateResources(width, height) {
        const me = this;

        width  = Math.max(4, Math.floor(width));
        height = Math.max(4, Math.floor(height));

        // The disc is tilted towards the canvas's longer side, so it fills a wide window and a phone alike
        const
            tilt   = Math.min(1.4, Math.max(.5, height / width)),
            scaleX = Math.min(width / 2 - 2, (height / 2 - 2) / tilt),
            scaleY = scaleX * tilt;

        me.points     ??= Renderer.createPoints(me.pointCount);
        me.field        = new OffscreenCanvas(width, height);
        me.fieldContext = me.field.getContext('2d');
        me.image        = me.fieldContext.createImageData(width, height);
        me.pixels       = new Uint32Array(me.image.data.buffer);
        me.hits         = new Uint8Array(width * height);
        me.palette      = Renderer.createPalette(me.theme, Math.max(1, me.pointCount / (Math.PI * scaleX * scaleY)));
        me.geometry     = {centerX: width / 2, centerY: height / 2, height, scaleX, scaleY, width}
    }

    /**
     * @summary Sizes the canvas in device pixels, so its text is sharp, and the picture in CSS pixels.
     * @param {Object} size
     * @param {Number} size.height
     * @param {Number} size.width
     * @param {Number} [size.devicePixelRatio=1]
     */
    updateSize(size) {
        const
            me    = this,
            ratio = size.devicePixelRatio || 1;

        me.canvasSize = size;

        if (me.context) {
            me.context.canvas.width  = Math.max(4, Math.round(size.width  * ratio));
            me.context.canvas.height = Math.max(4, Math.round(size.height * ratio));

            me.updateResources(size.width, size.height)
        }
    }

    /**
     * @summary Resolves once a frame is painted.
     * @returns {Promise<Boolean>}
     */
    async whenDrawn() {
        return this.waitFor(() => this.frames > 0, {attempts: 600})
    }
}

export default Neo.setupClass(Renderer);
