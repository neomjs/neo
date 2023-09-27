/**
 * The class contains utility methods for working with DOMRect Objects
 * @class Neo.util.Rectangle
 * @extends DOMRect
 */

const
    emptyArray = Object.freeze([]),
    // Convert edge array values into the [T,R,B,L] form.
    parseEdgeValue = (e = 0) => {
        if (!Array.isArray(e)) {
            e = [e];
        }
        switch (e.length) {
            case 1:
                e.length = 4;
                return e.fill(e[0], 1, 4);
            case 2:// top&bottom, left&right
                return [e[0], e[1], e[0], e[1]];
            case 3:// top, left&right, bottom
                return [e[0], e[1], e[2], e[1]];
        }
        return e;
    },
    parseEdgeAlign = edgeAlign => {
        const
            edgeParts     = edgeAlignRE.exec(edgeAlign),
            ourEdgeZone   = edgeZone[edgeParts[1]],
            theirEdgeZone = edgeZone[edgeParts[4]];

        return {
            ourEdge         : edgeParts[1],
            ourEdgeOffset   : parseInt(edgeParts[2] || 50),
            ourEdgeUnit     : edgeParts[3] || '%',
            ourEdgeZone,
            theirEdge       : edgeParts[4],
            theirEdgeOffset : parseInt(edgeParts[5] || 50),
            theirEdgeUnit   : edgeParts[6] || '%',
            theirEdgeZone,

            // Aligned to an edge, *outside* of the target.
            // A normal align as a combo dropdown might request
            edgeAligned     : (ourEdgeZone & 1) === (theirEdgeZone & 1) && ourEdgeZone !== theirEdgeZone
        }
    },
    // The opposite of parseEdgeAlign, and it has to flip the edges
    createReversedEdgeAlign = edges => {
        const
            ourEdge   = oppositeEdge[edges.ourEdge],
            theirEdge = oppositeEdge[edges.theirEdge];

        // reconstitute a rule string with the edges flipped to the opposite sides
        return `${ourEdge}${edges.ourEdgeOffset}${edges.ourEdgeUnit}-${theirEdge}${edges.theirEdgeOffset}${edges.theirEdgeUnit}`

    },
    getElRect = el => {
        const r = el instanceof DOMRect ? el : (el?.nodeType === 1 ? el : typeof el === 'string' ? document.getElementById(el) : null)?.getBoundingClientRect();

        // Convert DOMRect into Rectangle
        return r && new Rectangle(r.x, r.y, r.width, r.height);
    },
    oppositeEdge = {
        t : 'b',
        r : 'l',
        b : 't',
        l : 'r'
    },
    edgeZone = {
        t : 0,
        r : 1,
        b : 2,
        l : 3
    },
    zoneNames = ['top', 'right', 'bottom', 'left'],
    zoneEdges = ['t', 'r', 'b', 'l'],
    zoneDimension = ['width', 'height'],
    zoneCoord = [0, 1, 0, 1],
    zeroMargins = [0, 0, 0, 0],
    edgeAlignRE = /^([trblc])(\d*)(%|px)?-([trblc])(\d*)(%|px)?$/;

export default class Rectangle extends DOMRect {
    static config = {
        /**
         * @member {String} className='Neo.util.Rectangle'
         * @protected
         */
        className: 'Neo.util.Rectangle'
    }

    /**
     * @member {Number|null} minHeight=null
     */
    minHeight = null
    /**
     * @member {Number|null} minWidth=null
     */
    minWidth = null

    /**
     * Checks if rect1 does not have an intersection with rect2
     * !includes() is true for intersections as well
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Boolean}
     */
    static excludes(rect1, rect2) {
        return rect1.bottom < rect2.top     // rect2 is below rect1
            || rect1.left   > rect2.right   // rect2 is left of rect1
            || rect1.right  < rect2.left    // rect2 is right of rect1
            || rect1.top    > rect2.bottom; // rect2 is above rect1
    }

    /**
     * Returns the overlapping area of rect1 & rect2
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Number} The area (x * y)
     */
    static getIntersection(rect1, rect2) {
        return Rectangle.getIntersectionDetails(rect1, rect2).area;
    }

    /**
     * Returns the overlapping area of rect1 & rect2
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Object} x, y & area
     */
    static getIntersectionDetails(rect1, rect2) {
        let width  = Math.max(0, Math.min(rect1.right,  rect2.right)  - Math.max(rect1.left, rect2.left)),
            height = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top,  rect2.top));

        return {
            area: height * width,
            height,
            width
        };
    }

    /**
     * Checks if rect2 is fully contained inside rect1
     * @param {Object} rect1
     * @param {Object} rect2
     * @returns {Boolean}
     */
    static includes(rect1, rect2) {
        return rect1.bottom >= rect2.bottom
            && rect1.left   <= rect2.left
            && rect1.right  >= rect2.right
            && rect1.top    <= rect2.top;
    }

    /**
     * Checks if rect2 is not contained inside rect1.
     * This could be an intersection or being fully excluded.
     * @param {Object} rect1
     * @param {Object} rect2
     * @param {String} side bottom, left, right or top
     * @returns {Boolean}
     */
    static leavesSide(rect1, rect2, side) {
        if (Rectangle.includes(rect1, rect2)) {
            return false;
        }

        if (side === 'bottom') {
            return rect1.bottom < rect2.bottom;
        }

        if (side === 'left') {
            return rect1.left > rect2.left;
        }

        if (side === 'right') {
            return rect1.right < rect2.right;
        }

        if (side === 'top') {
            return rect1.top > rect2.top;
        }
    }

    /**
     * Adjusts a DOMRect object to a new position
     * @param {Object} rect
     * @param {Number|null} [x=null]
     * @param {Number|null} [y=null]
     * @returns {Object} movedRect
     */
    static moveBy(rect, x=null, y=null) {
        let movedRect = {...rect};

        if (Neo.isNumber(x)) {
            movedRect.left  += x;
            movedRect.right += x;
            movedRect.x     += x;
        }

        if (Neo.isNumber(y)) {
            movedRect.bottom += y;
            movedRect.top    += y;
            movedRect.y      += y;
        }

        return movedRect;
    }

    /**
     * Adjusts a DOMRect object to a new position
     * @param {Object} rect
     * @param {Number|null} [x=null]
     * @param {Number|null} [y=null]
     * @returns {Object} movedRect
     */
    static moveTo(rect, x=null, y=null) {
        let movedRect = {...rect};

        if (Neo.isNumber(x)) {
            movedRect.left  = x;
            movedRect.right = x + movedRect.width;
            movedRect.x     = x;
        }

        if (Neo.isNumber(y)) {
            movedRect.bottom = y + movedRect.height;
            movedRect.top    = y;
            movedRect.y      = y;
        }

        return movedRect;
    }

    set bottom(b) {
        this.height += b - this.bottom;
    }
    get bottom() {
        return super.bottom;
    }

    set right(r) {
        this.width += r - this.right;
    }
    get right() {
        return super.right;
    }

    // Change the x without moving the Rectangle. The left side moves and the right side doesn't
    changeX(x) {
        const widthDelta = this.x - x;

        this.x = x;
        this.width += widthDelta;
    }

    // Change the y without moving the Rectangle. The top side moves and the bottom side doesn't
    changeY(y) {
        const heightDelta = this.y - y;

        this.y = y;
        this.height += heightDelta;
    }

    clone() {
        return Rectangle.clone(this);
    }

    static clone(r) {
        const result = new Rectangle(r.x, r.y, r.width, r.height);

        result.minWidth = r.minWidth;
        result.minHeight = r.minHeight;

        return result;
    }

    intersects(other) {
        const me = this;

        if (other.height && other.width) {
            const
                left   = Math.max(me.x, other.x),
                top    = Math.max(me.y, other.y),
                right  = Math.min(me.x + me.width, other.x + other.width),
                bottom = Math.min(me.y + me.height, other.y + other.height);

            if (left >= right || top >= bottom) {
                return false;
            }

            return new Rectangle(left, top, right - left, bottom - top);
        }
        // We're dealing with a point here - zero dimensions
        else {
            return (other.x >= me.x && other.y >= me.y && other.right <= me.right && other.bottom <= me.bottom);
        }
    }

    /**
     * Checks if the other Rectangle is fully contained inside this Rectangle
     * @param {Object} other
     * @returns {Boolean}
     */
    contains(other) {
        return this.bottom >= other.bottom
            && this.left   <= other.left
            && this.right  >= other.right
            && this.top    <= other.top;
    }

    /**
     * Returns a clone of this Rectangle expanded according to the edges array.
     * @param {Number}Number[]} edges
     * @returns {Rectangle}
     */
    expand(edges) {
        edges = parseEdgeValue(edges);

        return new this.constructor(this.x - edges[3], this.y - edges[0], this.width + edges[1] + edges[3], this.height + edges[0] + edges[2]);
    }

    moveBy(x = 0, y = 0) {
        const result = this.clone();

        if (Array.isArray(x)) {
            y = x[1];
            x = x[0];
        }
        result.x += x;
        result.y += y;
        return result;
    }

    /**
     * Returns `true` if this Rectangle completely contains the other Rectangle
     * @param {Rectangle} other
     */
    contains(other) {
        return this.constructor.includes(this, other);
    }

    /**
     * Returns a copy of this Rectangle constrained to fit within the passed Rectangle
     * @param {Rectangle} constrainTo
     * @returns {Rectangle|Boolean} A new Rectangle constrained to te passed Rectangle, or false if it could not be constrained.
     */
    constrainTo(constrainTo) {
        const
            me        = this,
            minWidth  = me.minWidth  || me.width,
            minHeight = me.minHeight || me.height;

        // Not possible, even when shrunk to minima
        if (minHeight > constrainTo.height || minWidth > constrainTo.width) {
            return false;
        }

        // We do not mutate this Rectangle, but return a constrained version
        const result = me.clone();

        // Translate result so that the top and left are visible
        result.x = Math.max(me.x + Math.min(constrainTo.right  - result.right,  0), constrainTo.x);
        result.y = Math.max(me.y + Math.min(constrainTo.bottom - result.bottom, 0), constrainTo.y);

        // Pull in any resulting overflow
        result.bottom = Math.min(result.bottom, constrainTo.bottom);
        result.right = Math.min(result.right, constrainTo.right);

        return result;
    }

    alignTo(align) {
        const
            me             = this,
            {
                constrainTo,    // Element or Rectangle result must fit into
                target,         // Element or Rectangle to align to
                edgeAlign,      // t50-b50 type string
                axisLock,       // true for flip, 'flexible' for flip, then try the other edges
                offset,         // Final [x, y] vector to move the result by.
                matchSize
            }              = align,
            targetMargin   = align.targetMargin ? parseEdgeValue(align.targetMargin) : zeroMargins,
            targetRect     = getElRect(target),
            constrainRect  = getElRect(constrainTo),
            edges          = parseEdgeAlign(edgeAlign),
            matchDimension = zoneDimension[edges.theirEdgeZone & 1];

        let result = me.clone();

        if (matchSize) {
            result[matchDimension] = targetRect[matchDimension];
        }

        // Must do the calculations after the aligned side has been matched in size if requested.
        const
            myPoint     = result.getAnchorPoint(edges.ourEdgeZone, edges.ourEdgeOffset, edges.ourEdgeUnit),
            targetPoint = targetRect.getAnchorPoint(edges.theirEdgeZone, edges.theirEdgeOffset, edges.theirEdgeUnit, targetMargin),
            vector      = [targetPoint[0] - myPoint[0], targetPoint[1] - myPoint[1]];

        result = result.moveBy(vector);

        // A useful property in the resulting rectangle which specifies which zone of the target
        // It is being places in, T,R,B or L - 0, 1, 2, 3
        // Some code may want to treat DOM elements differently depending on the zone
        result.zone = edges.theirEdgeZone;
        result.position = zoneNames[result.zone];

        // Now we create the four Rectangles around the target, into which we may be constrained
        // Zones T,R,B,L 0 9, 1, 2, 3:
        // +-----------------------------------------------------------------------------------+
        // | +-------------------------+------------------------+----------------------------+ |
        // | |          ^              |                        |             ^              | |
        // | |          |              |                        |             |              | |
        // | |  <-------+--------------+---------Zone 0---------+-------------+---------->   | |
        // | |          |              |                        |             |              | |
        // | |          |              |                        |             |              | |
        // | +----------+--------------+------------------------+-------------+--------------+ |
        // | |          |              | +--------------------+ |             |              | |
        // | |          |              | |                    | |             |              | |
        // | |          |              | |                    | |             |              | |
        // | |       Zone 3            | |                    | |          Zone 1            | |
        // | |          |              | |                    | |             |              | |
        // | |          |              | |                    | |             |              | |
        // | |          |              | +--------------------+ |             |              | |
        // | ++---------+--------------+------------------------+-------------+--------------+ |
        // | |          |              |                        |             |              | |
        // | |          |              |                        |             |              | |
        // | |          |              |                        |             |              | |
        // | |  <-------+--------------+--------Zone 2----------+-------------+------------> | |
        // | |          |              |                        |             |              | |
        // | |          v              |                        |             v              | |
        // | ++------------------------+------------------------+----------------------------+ |
        // +-----------------------------------------------------------------------------------+
        if (constrainRect && !constrainRect.contains(result)) {
            // They asked to overlap the target, for example t0-t0
            // In these cases, we just return the result
            if (targetRect.intersects(result)) {
                return result;
            }

            // This is the zone we try to fit into first, the one that was asked for
            let zone = edges.theirEdgeZone;

            // We create an array of four rectangles into which we try to fit with appropriate align specs.
            // We must start with the requested zone, whatever that is.
            const zonesToTry = [{
                zone,
                edgeAlign
            }];

            if (axisLock) {
                // Flip to the opposite side for the second try.
                // The alignment string has to be reversed
                // so r20-l30 has to become l20-r30.
                // The other two zones revert to centered so are easier
                zonesToTry[1] = {
                    zone      : zone = (zone + 2) % 4,
                    edgeAlign : createReversedEdgeAlign(edges)
                }

                // Fall back to the other two zones.
                zonesToTry.push({
                    zone      : zone = (edges.theirEdgeZone + 1) % 4,
                    edgeAlign : `${oppositeEdge[zoneEdges[zone]]}-${zoneEdges[zone]}`
                });
                zonesToTry.push({
                    zone      : zone = (edges.theirEdgeZone + 3) % 4,
                    edgeAlign : `${oppositeEdge[zoneEdges[zone]]}-${zoneEdges[zone]}`
                });
            }
            else {
                // go through the other zones in order
                for (let i = 1; i < 4; i++) {
                    zonesToTry.push({
                        zone      : zone = (zone + 1) % 4,
                        edgeAlign : `${oppositeEdge[zoneEdges[zone]]}-${zoneEdges[zone]}`
                    });
                }
            }

            // Calculate the constraint Rectangle for each zone
            for (let i = 0; i < zonesToTry.length; i++) {
                // We clone the outer constraining rectangle
                // and move it into position
                const c = constrainRect.clone();

                switch (zonesToTry[i].zone) {
                    case 0:
                        // The zone i2 above the target - zone 0/T
                        c.bottom = targetRect.y - targetMargin[0];
                        break;
                    case 1:
                        // The zone is to the right of the target - zone 1/R
                        c.changeX(targetRect.right + targetMargin[1]);
                        break;
                    case 2:
                        // The zone is below the target - zone 2/B
                        c.changeY(targetRect.bottom + targetMargin[2]);
                        break;
                    case 3:
                        // The zone is to the left of the target - zone 3/L
                        c.right = targetRect.x - targetMargin[3];
                        break;
                }
                zonesToTry[i].constrainRect = c;
            }

            // Now try to constrain our result into each zone's constraintZone
            for (let i = 0; i < zonesToTry.length; i++) {
                const
                    {
                        zone,
                        edgeAlign,
                        constrainRect
                    }    = zonesToTry[i],
                    edge = zoneEdges[zone];

                if (matchSize) {
                    // If we are aligning to the requested edge, or it's opposite edge then
                    // match that edge size, else revert it to our own size
                    result[matchDimension] = edge === edges.theirEdge || edge == oppositeEdge[edges.theirEdge] ? targetRect[matchDimension] : me[matchDimension];
                }

                // Do a simple align to the current edge
                result = result.alignTo({
                    target : targetRect,
                    edgeAlign,
                    targetMargin
                });

                let solution = result.constrainTo(constrainRect);

                // As soon as we find a zone into which the result is willing to be constrained. return it
                if (solution) {
                    solution.zone = zone;
                    solution.position = zoneNames[zone];
                    return solution;
                }
            }
        }

        // Add the configurable finishing touch.
        if (offset) {
            result.moveBy(offset);
        }

        return result;
    }

    getAnchorPoint(edgeZone, edgeOffset, edgeUnit, margin = emptyArray) {
        const me = this;

        let result;

        // Edge zones go top, right, bottom, left
        // Each one calculates the start point of that edge then moves along it by
        // the edgeOffset, then moves *away* from it by the margin for that edge if there's a margin.
        switch (edgeZone) {
            case 0:
                result = [me.x, me.y - (margin[0] || 0), me.width, 0];
                break;
            case 1:
                result = [me.x + me.width + (margin[1] || 0), me.y, me.height, 1];
                break;
            case 2:
                result = [me.x, me.y + me.height + (margin[2] || 0), me.width, 0];
                break;
            case 3:
                result = [me.x - (margin[3] || 0), me.y, me.height, 1];
        }
        result[result[3]] += edgeUnit === '%' ? result[2] / 100 * edgeOffset : edgeOffset;
        result.length = 2;
        return result;
    }

    equals(other) {
        return other instanceof DOMRect &&
            other.x === this.x &&
            other.y === this.y &&
            other.height === this.height &&
            other.width === this.width;
    }

    // For debugging purposes only
    show(color = 'red') {
        const div = document.createElement('div');

        div.style = `
            position:absolute;
            transform:translate3d(${this.x}px, ${this.y}px, 0);
            height:${this.height}px;
            width:${this.width}px;
            background-color:${color}
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 30000);
        return div;
    }

    /**
     * When using JSON.stringify(this), we want to add minHeight & minWidth to the output.
     * @returns {Object}
     */
    toJSON() {
        const {bottom, height, left, minHeight, minWidth, right, top, width, x, y} = this;
        return {bottom, height, left, minHeight, minWidth, right, top, width, x, y}
    }
}
