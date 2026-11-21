---
seoTitle: "OffscreenCanvas Web Worker Rendering & Zero-Allocation 60fps Canvas | Neo.mjs"
seoDescription: "Render 60fps interactive graphics off the main thread by combining SharedWorkers, OffscreenCanvas transfer, and zero-allocation physics loops in Neo.mjs."
---
# Zero-Allocation Effects with Shared Workers

This guide explores the "Luminous Flux" visual engine (the Sonic Waves effect in the Portal App header) as a masterclass in advanced Neo.mjs architecture. It demonstrates how to combine **True Multithreading**, **Shared Workers**, and the **OffscreenCanvas API** to achieve high-performance, non-blocking visual effects.

## When to Use This Architecture

**Use Shared Worker + OffscreenCanvas when:**
- ✅ You need guaranteed 60fps animation regardless of main thread load.
- ✅ Your effect has complex physics/particle systems (many calculations per frame).
- ✅ The visual state can be self-contained (doesn't need constant DOM reads).
- ✅ You're targeting modern browsers (OffscreenCanvas support required).

**Stick with simpler patterns when:**
- ❌ Your animation is simple (basic CSS transitions/keyframes work fine).
- ❌ You need tight DOM integration (reading layout every frame).
- ❌ You need to support older browsers.

## The Challenge

We wanted to create a visually rich, interactive background for the Portal header:
-   **Complex Visuals:** 3D ribbons, neon tubes, particle systems ("Neo Ether"), and shockwaves.
-   **Interactivity:** Physics that react to mouse movement and clicks.
-   **Performance:** A strict requirement for **60fps** on high-refresh displays.
-   **Constraints:** It must **never** block the Main Thread (UI responsiveness) or the App Worker (Business Logic).

## The Architecture: Split Topology

To solve this, we used a split architecture that leverages the unique strengths of different threads.

```mermaid
flowchart TD
    User(User Interaction) --> Main
    Main(Main Thread: DOM/Input)
    App(App Worker: Orchestrator)
    Canvas(Shared Canvas Worker: Physics Engine)

    Main -->|Mouse Events| App
    Main -->|Canvas Transfer| App
    App -->|updateMouseState| Canvas
    App -->|updateNavRects| Canvas
    Canvas -->|60fps Render Loop| OffscreenCanvas
```

### 1. The App Worker: The Orchestrator
**File:** `apps/portal/view/HeaderCanvas.mjs`

The App Worker component is the "handle" for the effect. It doesn't draw anything. Instead, it manages the lifecycle and state.

*   **Lifecycle Management:** When the component mounts, it instantiates the rendering graph in the Shared Worker. When it unmounts, it cleans it up.
*   **DOM Synchronization:** It uses `ResizeObserver` and `getDomRect` to track the exact position of the canvas and its sibling navigation buttons.
*   **Input Bridging:** It captures user events (`mousemove`, `click`), normalizes the coordinates relative to the canvas, and forwards them to the Shared Worker.

### 2. The Shared Worker: The Physics Engine
**File:** `apps/portal/canvas/HeaderCanvas.mjs`

This is where the magic happens. By running in a Shared Worker, the rendering loop is completely isolated. Even if the App Worker is busy processing heavy data or the Main Thread is busy with DOM layout, the animation continues smoothly.

## Setting Up the Architecture

### Step 1: Create the App Worker Component
```javascript
// apps/portal/view/HeaderCanvas.mjs
class HeaderCanvas extends Canvas {
    async afterSetOffscreenRegistered(value, oldValue) {
        if (value) {
            // Import canvas logic into Canvas Worker
            await Portal.canvas.Helper.importHeaderCanvas();

            // Initialize the renderer
            await Portal.canvas.HeaderCanvas.initGraph({
                canvasId: me.getCanvasId(),
                windowId: me.windowId
            });

            // ... setup ResizeObserver, event handlers
        }
    }
}
```

### Step 2: Create the Canvas Worker Logic
```javascript
// apps/portal/canvas/HeaderCanvas.mjs
class HeaderCanvas extends Base {
    static config = {
        singleton: true,
        remote: {
            app: ['initGraph', 'updateMouseState', ...]
        }
    }

    render() {
        // Your render loop
        setTimeout(me.renderLoop, 1000 / 60)
    }
}
```

### Step 3: Bridge User Input
```javascript
// In your App Worker component
onMouseMove(data) {
    Portal.canvas.HeaderCanvas.updateMouseState({
        x: data.clientX - this.rect.x,
        y: data.clientY - this.rect.y
    });
}
```

### Shipping a renderer in a package

A renderer does not have to live in the application that draws it. A chart or a timeline package can ship
its Canvas worker logic beside its components, and every application that installs the package draws with
it. The package declares the directories its renderers live in, in its own `package.json`:

```json readonly
{
    "name": "@example/charts",
    "neo": {
        "canvasModules": ["src/canvas"]
    }
}
```

Its App worker component then names the renderer by its path from `node_modules`:

```javascript readonly
class SparklineCanvas extends SharedCanvas {
    static config = {
        className         : 'Example.view.SparklineCanvas',
        rendererClassName : 'Example.canvas.Sparkline',
        rendererImportPath: 'node_modules/@example/charts/src/canvas/Sparkline.mjs'
    }
}
```

The same path loads in raw development, in development and production builds, and in the `dist/esm`
build. That build copies the declared directories into its emitted `node_modules` and rewrites their Engine
imports to its one emitted Engine, so the renderer and the worker share one class system; a helper outside
the declared directories whose imports reach Engine fails the build, as it does for Main-thread addons. A
build reads the declaration from the workspace's direct dependencies, devDependencies and
optionalDependencies, and admits exactly the declared directories into the Canvas worker. Every other installed package stays out of it, so
a package that declares nothing costs the worker nothing. As with Main-thread addons, a declared entry is a
package-relative directory: absolute paths, upward traversal and directories that resolve outside the
package are rejected. The key reaches the Canvas worker alone; Main-thread addons have their own,
`neo.mainAddons`.

## Zero-Allocation Rendering

Achieving 60fps requires more than just a separate thread; it requires careful memory management to avoid Garbage Collection (GC) stutters. We implemented a **Zero-Allocation** strategy for the render loop.

### 1. TypedArray Buffers
We do not create new objects or arrays during `render()`. Instead, we use pre-allocated `Float32Array` buffers to store wave geometry.

```javascript
// Pre-allocated in updateResources()
me.waveBuffers.fgA = new Float32Array(fgCount);
me.waveBuffers.fgB = new Float32Array(fgCount);

// In the render loop, we write directly to indices
bufA[i] = centerY + sine - offsetY + noiseA + shockY;
```

### 2. Gradient Caching
Creating `CanvasGradient` objects is expensive. We create them only once when the canvas resizes and cache them.

```javascript
// updateResources()
const grad1 = ctx.createLinearGradient(0, 0, width, 0);
// ... add stops ...
me.gradients.grad1 = grad1;

// render()
drawStrand(bufA, me.gradients.grad1, ...);
```

## The "Luminous Flux" Theme

The visual effect is a procedural generation composed of four layers. Here is how each is implemented:

### 1. Neo Ether (Background)
A particle system with "nebula" orbs and "dust" specs that react to mouse repulsion.

**Implementation:**
Each particle tracks its `x`, `y`, `vx`, `vy`, and `alpha`.
*   **Physics:** We calculate the distance to the mouse. If it's within a threshold (`maxDist`), we apply a repulsion force vector.
*   **Nebulae vs. Dust:** "Nebulae" are larger, slower, and have higher mass (less repulsion). "Dust" is smaller, faster, and reacts sharply.

```javascript
// Interaction: Mouse Repulsion
let dx = p.x - me.mouse.x,
    dy = p.y - me.mouse.y,
    dist = Math.sqrt(dx*dx + dy*dy),
    maxDist = p.isNebula ? 150 : 100;

if (dist < maxDist && dist > 0) {
    let force = (maxDist - dist) / maxDist;
    // Push away (Nebulae are heavier)
    let mass = p.isNebula ? 5 : 1;
    p.x += (dx / dist) * force * (2 / mass);
    p.y += (dy / dist) * force * (2 / mass);
    // Brighten slightly on interaction
    p.alpha = Math.min(p.baseAlpha + force * (p.isNebula ? 0.05 : 0.5), 0.8);
}
```

### 2. Ambient Helix
A subtle, background sine wave with a volumetric ribbon fill. It uses a very low opacity gradient to create "depth of field" behind the sharp foreground.

```javascript
// Calculate Points (Direct to Buffer)
for (let i = 0; i < count; i++) {
    let x = i * step;
    // Two sine waves, 180 degrees out of phase
    bufA[i] = centerY + Math.sin((x * 0.01) + t) * amp;
    bufB[i] = centerY + Math.sin((x * 0.01) + t + Math.PI) * amp;
}
```

### 3. Split Stream (Foreground)
Two intertwined neon strands ("DNA") that flow across the screen. This is the most complex layer.

*   **Adaptive Geometry:** The strands flow loosely around text buttons (cosine envelope) but tighten into a "high-gravity orbit" around square social icons (cubed envelope).
*   **Frequency Modulation:** The wave frequency changes based on proximity to UI elements, creating a "time dilation" effect.

```javascript
// Collision Detection & Adaptive Geometry
if (distX < span) {
    let envelope;
    if (isIcon) {
        // TIGHT ORBIT: Cubed for sharper falloff
        let normDist = distX / span;
        envelope = Math.pow((1 + Math.cos(Math.PI * normDist)) / 2, 3);
    } else {
        // WIDE FLOW: Standard smooth cosine
        envelope = (1 + Math.cos(Math.PI * distX / span)) / 2;
    }
    // ... apply envelope to offsetY ...
}
```

## Semantic State Visualization

The two navigation states have different jobs. `Neo.app.header.Toolbar` sets `aria-current="page"` on the link for the current route and forwards the same button ID to the canvas. A separate `hoverId` identifies the button under the pointer. Hovering News while reading Learn leaves Learn visibly selected.

### Current route

The main streams continue around every button. Beneath the current link, the lower stream opens into two intertwined filaments with short cross-links. The filaments share the existing stream at either end of the button. Placing their crossings below the label keeps text, badges and keyboard focus readable, even in the compact header.

`Neo.canvas.Header#calculateStrandGeometry` writes the opposite phases into reusable foreground buffers. `drawActiveOverlay` paints just the selected span, using the current theme's colors. With reduced motion, a still frame shows the same connected shape; a route, size or theme change repaints it.

### Hover

The controller sends the hovered button ID to the renderer. A lighter stroke follows the waves immediately around that button. The selected helix is painted last, so a neighboring hover keeps its own visual treatment without covering the current route.

## Shockwaves
Interactive pulses triggered by clicks. They displace the waves and repel particles.

**Implementation:**
We track a list of active `shockwaves`. Each frame, we increment their `age` and calculate their `radius`.
*   **Wave Displacement:** In `calculateStrandGeometry`, we check if a point is near the shockwave radius. If so, we add a sine-based pulse to its `y` position.
*   **Particle Repulsion:** In `drawParticles`, we push particles outward if they are caught in the blast radius.

```javascript
// Pulse shape: Sine wave based on distance from center relative to radius
if (Math.abs(dist) < radius && Math.abs(dist) > radius - 60) {
    let pulse = Math.sin((dist / radius) * Math.PI * 10) * (1 - (wave.age / wave.life)) * 20;
    shockY += pulse;
}
```

## Common Pitfalls

### ❌ Don't: Assume `requestAnimationFrame` exists
When using Shared Workers (`useSharedWorkers: true`, required for multi-window apps), `requestAnimationFrame` is not available. However, in the default Dedicated Worker mode, it is.

**✅ Do:** Use Feature Detection
To support both modes, check if `requestAnimationFrame` is available.

```javascript
// Top of your file
const hasRaf = typeof requestAnimationFrame === 'function';

// In your render loop
if (hasRaf) {
    requestAnimationFrame(this.renderLoop);
} else {
    setTimeout(this.renderLoop, 1000 / 60);
}
```

### ❌ Don't: Create objects in the render loop
```javascript
// BAD: Creates garbage every frame
for (let i = 0; i < count; i++) {
    let point = {x: ..., y: ...};  // 🔥 GC pressure
}
```

**✅ Do:** Write to pre-allocated buffers
```javascript
// GOOD: Zero allocations
bufA[i] = centerY + sine - offsetY;
```

### ❌ Don't: Forget to clean up
```javascript
// Component unmount MUST call:
await Portal.canvas.HeaderCanvas.clearGraph()
// Otherwise: Zombie render loops eating CPU forever
```

## Conclusion

This implementation proves that Neo.mjs is not just for business apps; it's a capable engine for creative coding. By respecting the "Zero-Allocation" contract and effectively splitting responsibilities between workers, you can build immersive, desktop-class experiences on the web.

## Learn More

- [OffscreenCanvas MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [Web Workers vs Shared Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
