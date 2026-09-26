import Base from './Base.mjs';

const hasRaf = typeof requestAnimationFrame === 'function';

/**
 * The one program. A vertex carries its position, colour and size. The size is the point's diameter in
 * drawing-buffer pixels at the camera's target, scaled by the surface and shrinking with depth relative to
 * the camera distance, so a far node reads far at any scene scale. Every fragment fades a little with that
 * relative depth. The output is premultiplied, which an `alpha: true` canvas composites onto its ground.
 * @type {Object}
 */
const SHADERS = {
    vertex: `#version 300 es
layout(location = 0) in vec3  aPos;
layout(location = 1) in vec3  aCol;
layout(location = 2) in float aSize;
uniform mat4  uMvp;
uniform float uDist;
uniform float uScale;
out vec3  vCol;
out float vDepth;
void main() {
    gl_Position  = uMvp * vec4(aPos, 1.0);
    vDepth       = gl_Position.w / uDist;
    gl_PointSize = aSize * uScale / max(vDepth, 0.1);
    vCol         = aCol;
}`,
    fragment: `#version 300 es
precision mediump float;
in vec3  vCol;
in float vDepth;
uniform float uAlpha;
uniform float uRound;
out vec4 outColor;
void main() {
    float edge = 1.0;
    if (uRound > 0.5) {
        vec2  d  = gl_PointCoord - 0.5;
        float d2 = dot(d, d);
        if (d2 > 0.25) discard;
        edge = smoothstep(0.25, 0.16, d2);
    }
    float alpha = uAlpha * edge * clamp(1.6 - vDepth * 0.7, 0.4, 1.0);
    outColor = vec4(vCol * alpha, alpha);
}`
};

/**
 * @summary A WebGL2 graph scene on the canvas worker: nodes as round points, edges as lines, and paths as
 * line strips beaded into ribbons (WebGL draws a line one pixel wide). The App Worker sends typed arrays
 * with the colours and sizes already chosen, so the renderer holds no colours of its own; a subclass that
 * derives its scene from product state converts it and calls `setScene`.
 *
 * A frame is owed only to a change — a scene, the surface, the theme, the camera — never to a clock: idle,
 * the worker draws nothing. The orbit camera frames the scene's bounding sphere until the pointer takes it:
 * a primary-button drag orbits, the wheel zooms, and `pick` answers which node lies under a position. The
 * drawing buffer follows the size message's `devicePixelRatio`. A lost context keeps the scene and draws it
 * again once the context is restored.
 *
 * Extend it with `singleton: true` and a `className` of your own. The camera math is static, so a test
 * reaches it without a GL context and a subclass can replace it; `normalizeScene` is the seam for a
 * subclass that accepts a scene of its own shape.
 *
 * @class Neo.canvas.GraphScene
 * @extends Neo.canvas.Base
 */
class GraphScene extends Base {
    static config = {
        /**
         * @member {String} className='Neo.canvas.GraphScene'
         * @protected
         */
        className: 'Neo.canvas.GraphScene',
        /**
         * A transparent, premultiplied surface: the host's ground shows through the cleared canvas.
         * @member {Object} contextAttributes={alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: true}
         */
        contextAttributes: {alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: true},
        /**
         * @member {String} contextType='webgl2'
         */
        contextType: 'webgl2',
        /**
         * The camera's framing: the share of the surface's tighter axis the scene's bounding sphere fills.
         * @member {Number} fill=0.86
         */
        fill: 0.86,
        /**
         * The vertical field of view in radians.
         * @member {Number} fov=0.9
         */
        fov: 0.9,
        /**
         * Radians the camera turns per CSS pixel of a primary-button drag.
         * @member {Number} orbitSpeed=0.006
         */
        orbitSpeed: 0.006,
        /**
         * How far from a node's projected centre `pick` still answers, in CSS pixels.
         * @member {Number} pickRadius=14
         */
        pickRadius: 14,
        /**
         * Remote method access: the base's lifecycle set plus the scene entry, `pick` and the stats.
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'getStats',
                'initGraph',
                'pause',
                'pick',
                'resume',
                'setScene',
                'setTheme',
                'updateMouseState',
                'updateSize'
            ]
        },
        /**
         * The look, drawn in this order: edges, path lines, path beads, nodes. The alphas are opacities;
         * `beadSize` is in the unit of the scene's node sizes, and each path leg carries `beadsPerLeg` beads
         * coloured between its two nodes.
         * @member {Object} sceneStyle={beadAlpha: 0.55, beadSize: 24, beadsPerLeg: 18, edgeAlpha: 0.4, nodeAlpha: 0.95, pathAlpha: 0.9}
         */
        sceneStyle: {beadAlpha: 0.55, beadSize: 24, beadsPerLeg: 18, edgeAlpha: 0.4, nodeAlpha: 0.95, pathAlpha: 0.9},
        /**
         * The wheel's range as multiples of the fitted distance, and the zoom per wheel delta unit.
         * @member {Object} zoom={max: 3.75, min: 0.5, speed: 0.0015}
         */
        zoom: {max: 3.75, min: 0.5, speed: 0.0015}
    }

    /**
     * @summary The sphere around the positions' bounding box: its centre and the largest distance from it.
     * An empty scene gets a unit radius, so a camera still has a distance to fit.
     * @param {Float32Array} positions `x, y, z` per node
     * @returns {{center: Number[], radius: Number}}
     */
    static boundingSphere(positions) {
        const count = positions.length / 3;

        if (count === 0) {
            return {center: [0, 0, 0], radius: 1}
        }

        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];

        for (let i = 0; i < count; i++) {
            for (let axis = 0; axis < 3; axis++) {
                const value = positions[i * 3 + axis];

                min[axis] = Math.min(min[axis], value);
                max[axis] = Math.max(max[axis], value)
            }
        }

        const center = [0, 1, 2].map(axis => (min[axis] + max[axis]) / 2);
        let radius = 0;

        for (let i = 0; i < count; i++) {
            radius = Math.max(radius, Math.hypot(positions[i * 3] - center[0], positions[i * 3 + 1] - center[1], positions[i * 3 + 2] - center[2]))
        }

        return {center, radius: radius || 1}
    }

    /**
     * @summary The camera distance at which a sphere fills its share of the surface's tighter axis.
     * @param {Object} options
     * @param {Number} options.aspect The surface's width over its height
     * @param {Number} options.fill The share of the tighter axis, `0..1`
     * @param {Number} options.fov The vertical field of view in radians
     * @param {Number} options.radius The sphere's radius
     * @returns {Number}
     */
    static fitDistance({aspect, fill, fov, radius}) {
        const tan = Math.tan(fov / 2);

        // the horizontal half-angle's tangent is the vertical one's times the aspect
        return radius / (Math.min(tan, tan * aspect) * fill)
    }

    /**
     * @summary The column-major model-view-projection of an orbit camera: yaw and pitch around a target at
     * a distance, over a perspective with the given vertical field of view.
     * @param {Object}   camera
     * @param {Number}   camera.dist  The distance from the target
     * @param {Number}   camera.pitch Radians, positive looks down on the target
     * @param {Number[]} camera.target `[x, y, z]`, the point the camera orbits
     * @param {Number}   camera.yaw   Radians around the vertical axis
     * @param {Number}   aspect The surface's width over its height
     * @param {Number}   fov The vertical field of view in radians
     * @returns {Float32Array}
     */
    static orbitMatrix({dist, pitch, target, yaw}, aspect, fov) {
        const
            f    = 1 / Math.tan(fov / 2),
            near = dist / 100,
            far  = dist * 100,
            r    = 1 / (near - far),
            P    = [f / aspect, 0, 0, 0,  0, f, 0, 0,  0, 0, (near + far) * r, -1,  0, 0, 2 * near * far * r, 0],
            cy   = Math.cos(yaw),
            sy   = Math.sin(yaw),
            cp   = Math.cos(pitch),
            sp   = Math.sin(pitch),
            [tx, ty, tz] = target,
            // column-major, one column per line: the rotation, then a translation that moves the target to
            // the view's centre and the camera back by its distance
            V    = [
                cy,      sy * sp,  -sy * cp, 0,
                0,       cp,       sp,       0,
                sy,      -cy * sp, cy * cp,  0,
                -(cy * tx + sy * tz), -(sy * sp * tx + cp * ty - cy * sp * tz), -(-sy * cp * tx + sp * ty + cy * cp * tz) - dist, 1
            ],
            M    = new Float32Array(16);

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                M[j * 4 + i] = P[i] * V[j * 4] + P[4 + i] * V[j * 4 + 1] + P[8 + i] * V[j * 4 + 2] + P[12 + i] * V[j * 4 + 3]
            }
        }

        return M
    }

    /**
     * @summary The node nearest a surface position whose projected centre lies within the radius.
     * @param {Object} options
     * @param {Float32Array} options.M The model-view-projection
     * @param {Number} options.height The surface height, in the unit of `x`, `y` and `radius`
     * @param {Float32Array} options.positions `x, y, z` per node
     * @param {Number} options.radius
     * @param {Number} options.width
     * @param {Number} options.x
     * @param {Number} options.y
     * @returns {Number} The node's index, or `-1`
     */
    static pickNearest({M, height, positions, radius, width, x, y}) {
        let best = -1, bestDistance = radius;

        for (let i = 0; i < positions.length / 3; i++) {
            const point = this.project(M, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], width, height);

            if (point) {
                const distance = Math.hypot(point[0] - x, point[1] - y);

                if (distance <= bestDistance) {
                    bestDistance = distance;
                    best         = i
                }
            }
        }

        return best
    }

    /**
     * @summary A point's position on the surface, or `null` behind the camera.
     * @param {Float32Array} M The model-view-projection
     * @param {Number} x
     * @param {Number} y
     * @param {Number} z
     * @param {Number} width The surface width, in the unit the result should carry
     * @param {Number} height
     * @returns {Number[]|null} `[x, y]` from the surface's top left
     */
    static project(M, x, y, z, width, height) {
        const
            cx = M[0] * x + M[4] * y + M[8]  * z + M[12],
            cy = M[1] * x + M[5] * y + M[9]  * z + M[13],
            cw = M[3] * x + M[7] * y + M[11] * z + M[15];

        return cw <= 0 ? null : [(cx / cw * 0.5 + 0.5) * width, (0.5 - cy / cw * 0.5) * height]
    }

    /**
     * The orbit camera. An untouched camera re-fits to every new scene and surface; a drag or a wheel
     * takes it, and a taken camera keeps its framing.
     * @member {Object} camera={dist: 3, pitch: 0.32, target: [0, 0, 0], touched: false, yaw: 0.7}
     */
    camera = {dist: 3, pitch: 0.32, target: [0, 0, 0], touched: false, yaw: 0.7}
    /**
     * True between a `webglcontextlost` and its `webglcontextrestored`.
     * @member {Boolean} contextLost=false
     */
    contextLost = false
    /**
     * The distance the camera fitted at, the wheel's reference.
     * @member {Number} fittedDistance=3
     */
    fittedDistance = 3
    /**
     * Frames drawn since the canvas arrived: the witness that idle draws none.
     * @member {Number} frames=0
     */
    frames = 0
    /**
     * The renderer string the context reports, for the stats.
     * @member {String|null} gpu=null
     */
    gpu = null
    /**
     * The compiled program with its uniform locations, or `null` without a live context.
     * @member {Object|null} program=null
     */
    program = null
    /**
     * Context restores since the canvas arrived.
     * @member {Number} restores=0
     */
    restores = 0
    /**
     * The current scene as `normalizeScene` settled it, or `null` for the empty surface.
     * @member {Object|null} scene=null
     */
    scene = null
    /**
     * The bounding sphere of the current scene.
     * @member {Object} sphere={center: [0, 0, 0], radius: 1}
     */
    sphere = {center: [0, 0, 0], radius: 1}
    /**
     * The uploaded scene: vertex arrays over the nodes and the beads, the edge buffer and one buffer per
     * path, or `null` when there is nothing to draw.
     * @member {Object|null} surfaces=null
     */
    surfaces = null

    /**
     * The `webglcontextlost` listener, one reference so `clearGraph` can remove it.
     * @member {Function} onContextLostHandler
     * @protected
     */
    onContextLostHandler = event => this.onContextLost(event)
    /**
     * The `webglcontextrestored` listener, one reference so `clearGraph` can remove it.
     * @member {Function} onContextRestoredHandler
     * @protected
     */
    onContextRestoredHandler = event => this.onContextRestored(event)

    /**
     * The WebGL2 context the base class acquired for `contextType`.
     * @member {WebGL2RenderingContext|null} gl
     */
    get gl() {
        return this.context
    }

    /**
     * @summary A context that exists and is not lost; the base's pause still applies.
     * @returns {Boolean}
     */
    get canRender() {
        return super.canRender && !this.contextLost
    }

    /**
     * @summary Forgets the scene, every GL object and the context listeners with the canvas.
     */
    clearGraph() {
        const me = this, canvas = me.gl?.canvas;

        canvas?.removeEventListener('webglcontextlost',     me.onContextLostHandler);
        canvas?.removeEventListener('webglcontextrestored', me.onContextRestoredHandler);

        me.dispose();
        super.clearGraph();

        me.contextLost = false;
        me.frames      = 0;
        me.program     = null;
        me.restores    = 0;
        me.scene       = null
    }

    /**
     * @summary Remote entry for tests and diagnostics: the camera, the drawing buffer, the scene's counts,
     * what is uploaded to the GPU (`null` while nothing is), the frames and the context state.
     * @returns {Object}
     */
    getStats() {
        const me = this, {camera, gl, scene, surfaces} = me;

        return {
            camera     : {...camera, target: [...camera.target]},
            canvas     : gl ? [gl.canvas.width, gl.canvas.height] : [0, 0],
            contextLost: me.contextLost,
            counts     : scene ? {nodes: scene.count, edges: scene.edges.length / 2, paths: scene.paths.length} : null,
            frames     : me.frames,
            gpu        : me.gpu,
            restores   : me.restores,
            uploaded   : surfaces ? {beads: surfaces.beads.count, edges: surfaces.edges.count / 2, nodes: surfaces.nodes.count, paths: surfaces.paths.length} : null
        }
    }

    /**
     * @summary Compiles the program and sets the blend for premultiplied output on the current context.
     * @protected
     */
    initGl() {
        const me = this, {gl} = me, debug = gl.getExtension('WEBGL_debug_renderer_info');

        me.program = me.compile();
        me.gpu     = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST)
    }

    /**
     * @summary Checks a scene the App Worker sends and settles its arrays into the typed forms the renderer
     * uploads. Colours and sizes are optional: white and 16 pixels. The seam for a subclass that accepts a
     * scene of its own shape: convert it here and hand the arrays on.
     * @param {Object|null} scene
     * @param {Float32Array|Number[]} scene.positions `x, y, z` per node
     * @param {Float32Array|Number[]} [scene.colors] `r, g, b` per node, `0..1`
     * @param {Float32Array|Number[]} [scene.sizes] One per node
     * @param {Uint32Array|Number[]}  [scene.edges] Node index pairs
     * @param {Array<Uint32Array|Number[]>} [scene.paths] Node index sequences, drawn as line strips
     * @returns {Object|null} `{colors, count, edges, paths, positions, sizes}`
     * @throws {Error} when an array's length or an index does not fit the nodes
     */
    normalizeScene(scene) {
        if (!scene) {
            return null
        }

        const
            positions = Float32Array.from(scene.positions ?? []),
            count     = positions.length / 3,
            colors    = scene.colors ? Float32Array.from(scene.colors) : new Float32Array(count * 3).fill(1),
            sizes     = scene.sizes  ? Float32Array.from(scene.sizes)  : new Float32Array(count).fill(16),
            edges     = Uint32Array.from(scene.edges ?? []),
            paths     = (scene.paths ?? []).map(path => Uint32Array.from(path)),
            fits      = indices => indices.every(index => index < count);

        if (!Number.isInteger(count)) {
            throw new Error(`${this.className}: positions hold ${positions.length} values, not three per node`)
        }

        if (colors.length !== count * 3 || sizes.length !== count) {
            throw new Error(`${this.className}: ${count} nodes need ${count * 3} colour and ${count} size values, got ${colors.length} and ${sizes.length}`)
        }

        if (edges.length % 2 !== 0 || !fits(edges) || !paths.every(fits)) {
            throw new Error(`${this.className}: edges are index pairs, and every edge and path index names a node`)
        }

        return {colors, count, edges, paths, positions, sizes}
    }

    /**
     * @summary The context is gone: its GL objects died with it, so they are dropped, not deleted. The
     * default prevented keeps the context restorable; the scene stays for the restore.
     * @param {Event} event
     * @protected
     */
    onContextLost(event) {
        const me = this;

        event.preventDefault();

        me.contextLost = true;
        me.program     = null;
        me.surfaces    = null
    }

    /**
     * @summary The context is back: compile again, size the new buffer, upload the kept scene, draw.
     * @protected
     */
    onContextRestored() {
        const me = this;

        me.contextLost = false;
        me.restores++;

        me.initGl();
        me.canvasSize && me.updateSize(me.canvasSize);
        me.upload();
        me.requestFrame()
    }

    /**
     * @summary The base has acquired the context and sized the buffer: listen for context loss, compile,
     * upload whatever scene arrived first, and owe a frame.
     */
    onGraphMounted() {
        const me = this, {canvas} = me.gl;

        canvas.addEventListener('webglcontextlost',     me.onContextLostHandler);
        canvas.addEventListener('webglcontextrestored', me.onContextRestoredHandler);

        me.initGl();
        me.upload();
        me.requestFrame()
    }

    /**
     * @summary The wheel zooms: the distance scales with the vertical delta, within the zoom range around
     * the fitted distance.
     * @param {Object} data
     */
    onWheel(data) {
        const me = this, {camera, fittedDistance, zoom} = me, delta = data.wheel?.deltaY || 0;

        camera.dist    = Math.min(fittedDistance * zoom.max, Math.max(fittedDistance * zoom.min, camera.dist * Math.exp(delta * zoom.speed)));
        camera.touched = true;
        me.requestFrame()
    }

    /**
     * @summary The node under a canvas position: the nearest whose projected centre lies within
     * `pickRadius`, against the current camera, so a hover answers right after an orbit.
     * @param {Object} data
     * @param {Number} data.x Canvas-relative, CSS pixels
     * @param {Number} data.y
     * @returns {Number} The node's index, or `-1`
     */
    pick({x, y}) {
        const me = this, {canvasSize, scene} = me;

        if (!scene || !canvasSize) {
            return -1
        }

        return me.constructor.pickNearest({
            M        : me.matrix(),
            height   : canvasSize.height,
            positions: scene.positions,
            radius   : me.pickRadius,
            width    : canvasSize.width,
            x,
            y
        })
    }

    /**
     * @summary One frame: clear to the transparent ground, then edges, path lines, their beads and the
     * nodes. No frame is scheduled from here; the next one is owed by the next change.
     */
    render() {
        const me = this, {camera, gl, program, sceneStyle, surfaces} = me;

        me.animationId = null;

        if (!me.canRender) {
            return
        }

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (program && surfaces) {
            gl.useProgram(program.id);
            gl.uniformMatrix4fv(program.uMvp, false, me.matrix());
            gl.uniform1f(program.uDist, camera.dist);
            gl.uniform1f(program.uScale, Math.min(gl.canvas.width, gl.canvas.height) / 400);

            gl.bindVertexArray(surfaces.nodes.vao);
            gl.uniform1f(program.uRound, 0);
            gl.uniform1f(program.uAlpha, sceneStyle.edgeAlpha);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfaces.edges.buffer);
            gl.drawElements(gl.LINES, surfaces.edges.count, gl.UNSIGNED_INT, 0);

            gl.uniform1f(program.uAlpha, sceneStyle.pathAlpha);
            surfaces.paths.forEach(path => {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, path.buffer);
                gl.drawElements(gl.LINE_STRIP, path.count, gl.UNSIGNED_INT, 0)
            });

            gl.uniform1f(program.uRound, 1);

            if (surfaces.beads.count) {
                gl.bindVertexArray(surfaces.beads.vao);
                gl.uniform1f(program.uAlpha, sceneStyle.beadAlpha);
                gl.drawArrays(gl.POINTS, 0, surfaces.beads.count)
            }

            gl.bindVertexArray(surfaces.nodes.vao);
            gl.uniform1f(program.uAlpha, sceneStyle.nodeAlpha);
            gl.drawArrays(gl.POINTS, 0, surfaces.nodes.count);
            gl.bindVertexArray(null)
        }

        me.frames++
    }

    /**
     * @summary Owes one frame to the next animation slot; a frame already owed is not doubled.
     */
    requestFrame() {
        const me = this;

        if (me.canRender && !me.animationId) {
            me.animationId = hasRaf ? requestAnimationFrame(me.renderLoop) : setTimeout(me.renderLoop, 16)
        }
    }

    /**
     * @summary Remote entry: the App Worker hands over a scene (see `normalizeScene`), or `null` to clear
     * the surface. It uploads, frames an untouched camera and owes a frame.
     * @param {Object|null} scene
     * @param {String} [scene.windowId] Routing only
     */
    setScene(scene) {
        const me = this;

        me.scene  = me.normalizeScene(scene?.positions ? scene : null);
        me.sphere = me.constructor.boundingSphere(me.scene?.positions ?? new Float32Array(0));

        me.upload();
        me.fit();
        me.requestFrame()
    }

    /**
     * @summary Pointer reports orbit the camera while the primary button is held; the base keeps the state.
     * @param {Object} data
     */
    updateMouseState(data) {
        const me = this, {camera, mouse, orbitSpeed} = me;

        super.updateMouseState(data);

        if (!data.leave && (mouse.buttons & 1) && (mouse.dx || mouse.dy)) {
            camera.yaw    += mouse.dx * orbitSpeed;
            camera.pitch   = Math.min(1.45, Math.max(-1.45, camera.pitch + mouse.dy * orbitSpeed));
            camera.touched = true;
            me.requestFrame()
        }
    }

    /**
     * @summary The theme changed. Colours arrive with the scene, so the picture just follows; a subclass that
     * colours by theme sends the scene again.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        this.requestFrame()
    }

    /**
     * @summary Sizes the drawing buffer at the size message's `devicePixelRatio` and the viewport with it.
     * @param {Object} size
     * @param {Number} size.height CSS pixels
     * @param {Number} size.width CSS pixels
     * @param {Number} [size.devicePixelRatio=1]
     * @param {String} [size.windowId] Routing only
     */
    updateSize(size) {
        const me = this, {gl} = me;

        me.canvasSize = size;

        if (gl && !me.contextLost) {
            const
                ratio  = size.devicePixelRatio || 1,
                width  = Math.max(1, Math.floor(size.width  * ratio)),
                height = Math.max(1, Math.floor(size.height * ratio));

            gl.canvas.width  = width;
            gl.canvas.height = height;
            gl.viewport(0, 0, width, height);
            me.fit();
            me.requestFrame()
        }
    }

    /**
     * @summary Compiles and links the program.
     * @returns {Object} `{id, uAlpha, uDist, uMvp, uRound, uScale}`
     * @protected
     */
    compile() {
        const
            me     = this,
            {gl}   = me,
            shader = (type, source) => {
                const id = gl.createShader(type);

                gl.shaderSource(id, source);
                gl.compileShader(id);

                if (!gl.getShaderParameter(id, gl.COMPILE_STATUS)) {
                    throw new Error(`${me.className}: ${gl.getShaderInfoLog(id)}`)
                }

                return id
            },
            id = gl.createProgram();

        gl.attachShader(id, shader(gl.VERTEX_SHADER, SHADERS.vertex));
        gl.attachShader(id, shader(gl.FRAGMENT_SHADER, SHADERS.fragment));
        gl.linkProgram(id);

        if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
            throw new Error(`${me.className}: ${gl.getProgramInfoLog(id)}`)
        }

        return {id, ...Object.fromEntries(['uAlpha', 'uDist', 'uMvp', 'uRound', 'uScale'].map(name => [name, gl.getUniformLocation(id, name)]))}
    }

    /**
     * @summary Deletes the uploaded scene's GL objects, if any. After a context loss they are already gone.
     * @protected
     */
    dispose() {
        const {contextLost, gl, surfaces} = this;

        if (gl && surfaces && !contextLost) {
            ['beads', 'nodes'].forEach(key => {
                surfaces[key].buffers.forEach(buffer => gl.deleteBuffer(buffer));
                gl.deleteVertexArray(surfaces[key].vao)
            });

            gl.deleteBuffer(surfaces.edges.buffer);
            surfaces.paths.forEach(path => gl.deleteBuffer(path.buffer))
        }

        this.surfaces = null
    }

    /**
     * @summary Frames the scene: an untouched camera centres on the bounding sphere and moves to the distance
     * at which the sphere fills its share of the surface. A camera the pointer took keeps its framing.
     * @protected
     */
    fit() {
        const me = this, {camera, gl, sphere} = me;

        if (gl && gl.canvas.height) {
            me.fittedDistance = me.constructor.fitDistance({aspect: gl.canvas.width / gl.canvas.height, fill: me.fill, fov: me.fov, radius: sphere.radius});

            if (!camera.touched) {
                camera.dist   = me.fittedDistance;
                camera.target = [...sphere.center]
            }
        }
    }

    /**
     * @summary An index buffer.
     * @param {Uint32Array} indices
     * @returns {{buffer: WebGLBuffer, count: Number}}
     * @protected
     */
    indexBuffer(indices) {
        const {gl} = this, buffer = gl.createBuffer();

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        return {buffer, count: indices.length}
    }

    /**
     * @summary The current camera's model-view-projection over the drawing buffer's aspect.
     * @returns {Float32Array}
     * @protected
     */
    matrix() {
        const {camera, fov, gl} = this;

        return this.constructor.orbitMatrix(camera, gl ? gl.canvas.width / gl.canvas.height : 1, fov)
    }

    /**
     * @summary Uploads the current scene: the node arrays, the edge and path indices, and the beads sampled
     * along every path leg. Nothing to draw leaves `surfaces` null.
     * @protected
     */
    upload() {
        const me = this, {gl, scene, sceneStyle} = me;

        me.dispose();

        if (!gl || !me.program || me.contextLost || !scene || scene.count === 0) {
            return
        }

        const
            {beadsPerLeg, beadSize} = sceneStyle,
            {colors, paths, positions} = scene,
            legs          = paths.reduce((sum, path) => sum + Math.max(0, path.length - 1), 0),
            beadCount     = legs * beadsPerLeg,
            beadPositions = new Float32Array(beadCount * 3),
            beadColors    = new Float32Array(beadCount * 3),
            beadSizes     = new Float32Array(beadCount).fill(beadSize);
        let bead = 0;

        paths.forEach(path => {
            for (let leg = 0; leg < path.length - 1; leg++) {
                const a = path[leg] * 3, b = path[leg + 1] * 3;

                for (let k = 0; k < beadsPerLeg; k++, bead++) {
                    const t = (k + 0.5) / beadsPerLeg;

                    for (let axis = 0; axis < 3; axis++) {
                        beadPositions[bead * 3 + axis] = positions[a + axis] + (positions[b + axis] - positions[a + axis]) * t;
                        beadColors[bead * 3 + axis]    = colors[a + axis]    + (colors[b + axis]    - colors[a + axis])    * t
                    }
                }
            }
        });

        me.surfaces = {
            beads: me.vertexArray(beadPositions, beadColors, beadSizes),
            nodes: me.vertexArray(positions, colors, scene.sizes),
            edges: me.indexBuffer(scene.edges),
            paths: paths.map(path => me.indexBuffer(path))
        };

        gl.bindVertexArray(null)
    }

    /**
     * @summary A vertex array with the program's three attributes uploaded once.
     * @param {Float32Array} positions
     * @param {Float32Array} colors
     * @param {Float32Array} sizes
     * @returns {{vao: WebGLVertexArrayObject, buffers: WebGLBuffer[], count: Number}}
     * @protected
     */
    vertexArray(positions, colors, sizes) {
        const {gl} = this, vao = gl.createVertexArray(), buffers = [];

        gl.bindVertexArray(vao);

        [[0, positions, 3], [1, colors, 3], [2, sizes, 1]].forEach(([location, data, size]) => {
            const buffer = gl.createBuffer();

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            buffers.push(buffer)
        });

        return {vao, buffers, count: sizes.length}
    }
}

export default Neo.setupClass(GraphScene);
