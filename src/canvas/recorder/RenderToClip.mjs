import Base        from '../../core/Base.mjs';
import DrawReceipt from './DrawReceipt.mjs';

/**
 * @summary The render-to-clip operation that binds every rendered frame to its draw receipt.
 * Fulfills instrument (a) of the Stage 2 gate in `.github/VISION.md`.
 *
 * This class captures frames from an active canvas renderer (2D or WebGL), calculates deterministic
 * Draw Receipts per frame, and exports a self-contained, cryptographically verifiable Clip Bundle.
 *
 * @class Neo.canvas.recorder.RenderToClip
 * @extends Neo.core.Base
 */
class RenderToClip extends Base {
    static config = {
        /**
         * @member {String} className='Neo.canvas.recorder.RenderToClip'
         * @protected
         */
        className: 'Neo.canvas.recorder.RenderToClip',
        /**
         * Identifier of the authoring peer or maintainer (e.g. 'Ada', 'Julia', 'tobiu')
         * @member {String} authorId='neo-peer'
         */
        authorId: 'neo-peer',
        /**
         * Target simulation frames per second
         * @member {Number} fps=60
         */
        fps: 60,
        /**
         * Target scene identifier
         * @member {String} sceneId='neo-scene'
         */
        sceneId: 'neo-scene'
    }

    /**
     * @member {Boolean} isRecording=false
     * @protected
     */
    isRecording = false

    /**
     * @member {Number} frameIndex=0
     * @protected
     */
    frameIndex = 0

    /**
     * @member {String} currentRollingHash
     * @protected
     */
    currentRollingHash = DrawReceipt.config.genesisHash

    /**
     * Array of DrawReceipt objects for every frame in this clip
     * @member {Array} receipts=[]
     * @protected
     */
    receipts = []

    /**
     * Optional frame buffers, data URLs, or blobs captured during recording
     * @member {Array} frames=[]
     * @protected
     */
    frames = []

    /**
     * Simulation start timestamp
     * @member {Number} startTime=0
     * @protected
     */
    startTime = 0

    /**
     * Begins a deterministic recording session.
     * @param {Object} [opts={}]
     * @param {String} [opts.sceneId]
     * @param {String} [opts.authorId]
     * @param {Number} [opts.fps=60]
     * @param {Boolean} [opts.recordFrames=false] Whether to store frame data snapshots
     */
    startRecording({sceneId, authorId, fps, recordFrames = false} = {}) {
        let me = this;

        me.sceneId            = sceneId || me.sceneId;
        me.authorId           = authorId || me.authorId;
        me.fps                = fps || me.fps;
        me.recordFrames       = recordFrames;
        me.isRecording        = true;
        me.frameIndex         = 0;
        me.currentRollingHash = DrawReceipt.config.genesisHash;
        me.receipts           = [];
        me.frames             = [];
        me.startTime          = 0;

        return {
            status     : 'recording_started',
            sceneId    : me.sceneId,
            authorId   : me.authorId,
            genesisHash: me.currentRollingHash
        };
    }

    /**
     * Ingests a frame render pass, calculates its DrawReceipt, and chains the rolling hash.
     * @param {Object} opts
     * @param {*} opts.payload Draw commands, WebGL2 vertex buffer, or structured packet
     * @param {Number} [opts.time] Optional simulation timestamp (defaults to frameIndex * (1000 / fps))
     * @param {String[]} [opts.colorTokens] Optional chromatic tokens
     * @param {*} [opts.frameData] Optional image data, base64 snapshot, or blob
     * @returns {Object} DrawReceipt record for the captured frame
     */
    recordFrame({payload, time, colorTokens = [], frameData = null}) {
        let me = this;

        if (!me.isRecording) {
            throw new Error(`${me.className}: Cannot record frame when recording is not active.`);
        }

        const timestamp = time !== undefined ? time : me.frameIndex * (1000 / me.fps);

        const receipt = DrawReceipt.createReceipt({
            frameIndex         : me.frameIndex,
            timestamp,
            payload,
            previousRollingHash: me.currentRollingHash,
            colorTokens,
            metadata           : { sceneId: me.sceneId, authorId: me.authorId }
        });

        me.currentRollingHash = receipt.rollingHash;
        me.receipts.push(receipt);

        if (me.recordFrames && frameData !== null) {
            me.frames.push({
                frameIndex: me.frameIndex,
                timestamp,
                receiptId : receipt.receiptId,
                data      : frameData
            });
        }

        me.frameIndex++;
        return receipt;
    }

    /**
     * Concludes the active recording session and packages the final Clip Bundle.
     * @returns {Object} Immutable Clip Bundle with receipts manifest
     */
    stopRecording() {
        let me = this;

        if (!me.isRecording) {
            throw new Error(`${me.className}: Recording is not currently active.`);
        }

        me.isRecording = false;

        const bundle = {
            proto           : 'neo.clip.receipt.v1',
            sceneId         : me.sceneId,
            authorId        : me.authorId,
            fps             : me.fps,
            frameCount      : me.receipts.length,
            durationMs      : me.receipts.length * (1000 / me.fps),
            genesisHash     : DrawReceipt.config.genesisHash,
            finalRollingHash: me.currentRollingHash,
            receipts        : me.receipts,
            hasFrames       : me.frames.length > 0,
            frames          : me.frames,
            finalizedAt     : new Date().toISOString()
        };

        return bundle;
    }

    /**
     * Exports the clip manifest without bulky frame images (ideal for network transmission & receipts audit).
     * @returns {Object} Lightweight manifest
     */
    exportManifest() {
        let me = this;
        return {
            proto           : 'neo.clip.receipt.v1',
            sceneId         : me.sceneId,
            authorId        : me.authorId,
            fps             : me.fps,
            frameCount      : me.receipts.length,
            durationMs      : me.receipts.length * (1000 / me.fps),
            genesisHash     : DrawReceipt.config.genesisHash,
            finalRollingHash: me.currentRollingHash,
            receipts        : me.receipts,
            finalizedAt     : new Date().toISOString()
        };
    }
}

export default Neo.setupClass(RenderToClip);
