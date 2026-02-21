import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Head layout — nodes arranged inside a brain sitting in a head wireframe.
 *
 * Head: Lee Perry-Smith scan (wireframe outline)
 * Brain: procedural mesh (two hemispheres with central fissure, gyri bumps)
 *        positioned in the upper cranium
 * Nodes fill the brain volume.
 */

const HEAD_SCALE = 1400;

export class HeadLayout {
  constructor() {
    this._wireframe = null;
    this._edgeLines = null;
    this._brainWireframe = null;
    this._brainEdgeLines = null;
    this._headMesh = null;
    this._loaded = false;
    this._loadPromise = null;
    this._scene = null;

    // Tunable params (fraction of HEAD_SCALE)
    this._yOffsetFrac = 0.69;
    this._scaleFrac = 0.37;

    // Separate tuning for brain wireframe mesh
    this._meshYOffsetFrac = 0.63;
    this._meshScaleFrac = 0.31;
  }

  get brainScale() { return HEAD_SCALE * this._scaleFrac; }
  get brainYOffset() { return HEAD_SCALE * this._yOffsetFrac; }
  get meshBrainScale() { return HEAD_SCALE * this._meshScaleFrac; }
  get meshBrainYOffset() { return HEAD_SCALE * this._meshYOffsetFrac; }

  /**
   * Live-update brain mesh tuning (sliders now control wireframe only).
   */
  setTuning(yOffsetFrac, scaleFrac) {
    this._meshYOffsetFrac = yOffsetFrac;
    this._meshScaleFrac = scaleFrac;

    // Rebuild brain wireframe with new params
    if (this._scene) {
      if (this._brainWireframe) {
        this._scene.remove(this._brainWireframe);
        this._brainWireframe.geometry.dispose();
        this._brainWireframe.material.dispose();
      }
      if (this._brainEdgeLines) {
        this._scene.remove(this._brainEdgeLines);
        this._brainEdgeLines.geometry.dispose();
        this._brainEdgeLines.material.dispose();
      }
      this._buildBrainMesh(this._scene);
      this._brainWireframe.visible = true;
      this._brainEdgeLines.visible = true;
    }
  }

  /**
   * Procedural brain surface point.
   * Two hemispheres with longitudinal fissure, frontal/occipital lobes,
   * temporal bulge, and gyri-like surface bumps.
   */
  _brainSurface(theta, phi, useMeshParams = false) {
    // Base ellipsoid: wider than tall, longer front-to-back
    const sx = 1.0;   // left-right width
    const sy = 0.75;  // height (top-bottom)
    const sz = 1.2;   // front-back depth

    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.cos(phi);
    let z = Math.sin(phi) * Math.sin(theta);

    // --- Longitudinal fissure: indent along the top center (x≈0) ---
    const topness = Math.max(0, y);  // 1 at top, 0 at equator
    const centerX = 1.0 - Math.abs(x) * 3; // 1 at center, 0 at sides
    const fissureDepth = Math.max(0, centerX) * topness * 0.3;

    // --- Hemisphere bulge: push each half outward ---
    const hemiBulge = Math.abs(x) * 0.15 * topness;

    // --- Temporal lobes: bulge at the sides, lower half ---
    const belowEquator = Math.max(0, -y);
    const sideAmount = Math.max(0, Math.abs(x) - 0.3);
    const temporalBulge = sideAmount * belowEquator * 0.25;

    // --- Frontal lobe: slightly larger forward ---
    const isFront = Math.max(0, z);
    const frontalBulge = isFront * topness * 0.1;

    // --- Occipital lobe: slight bulge at the back-bottom ---
    const isBack = Math.max(0, -z);
    const occipitalBulge = isBack * (0.3 + belowEquator * 0.5) * 0.08;

    // --- Gyri bumps: high-frequency surface detail ---
    const gyriFreq1 = Math.sin(theta * 8 + phi * 6) * 0.03;
    const gyriFreq2 = Math.sin(theta * 13 + phi * 11) * 0.02;
    const gyriFreq3 = Math.sin(theta * 5 - phi * 9) * 0.025;
    const gyri = (gyriFreq1 + gyriFreq2 + gyriFreq3) * (0.5 + topness * 0.5);

    // Combine
    const r = 1.0 + hemiBulge + temporalBulge + frontalBulge + occipitalBulge + gyri - fissureDepth;

    const scale = useMeshParams ? this.meshBrainScale : this.brainScale;
    const yOff = useMeshParams ? this.meshBrainYOffset : this.brainYOffset;

    return {
      x: x * sx * r * scale,
      y: y * sy * r * scale + yOff,
      z: z * sz * r * scale,
    };
  }

  /**
   * Build the brain wireframe mesh.
   */
  _buildBrainMesh(scene) {
    const segT = 64;
    const segP = 40;
    const vertices = [];
    const indices = [];

    for (let pi = 0; pi <= segP; pi++) {
      const phi = (pi / segP) * Math.PI;
      for (let ti = 0; ti <= segT; ti++) {
        const theta = (ti / segT) * Math.PI * 2;
        const p = this._brainSurface(theta, phi, true);
        vertices.push(p.x, p.y, p.z);
      }
    }

    for (let pi = 0; pi < segP; pi++) {
      for (let ti = 0; ti < segT; ti++) {
        const a = pi * (segT + 1) + ti;
        const b = a + 1;
        const c = a + (segT + 1);
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Wireframe — subtle pink/coral brain color
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xff6688,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    this._brainWireframe = new THREE.Mesh(geo, wireMat);
    this._brainWireframe.visible = false;
    scene.add(this._brainWireframe);

    // Edge lines for definition
    const edgeGeo = new THREE.EdgesGeometry(geo, 12);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xff6688,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    this._brainEdgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this._brainEdgeLines.visible = false;
    scene.add(this._brainEdgeLines);
  }

  /**
   * Load head model + build brain mesh.
   */
  load(scene) {
    if (this._loadPromise) return this._loadPromise;
    this._scene = scene;

    // Build brain mesh immediately (procedural, no loading)
    this._buildBrainMesh(scene);

    this._loadPromise = new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('./models/LeePerrySmith.glb', (gltf) => {
        let headGeo = null;

        gltf.scene.traverse((child) => {
          if (child.isMesh && !headGeo) {
            headGeo = child.geometry.clone();
          }
        });

        if (!headGeo) {
          console.warn('HeadLayout: no mesh found in model');
          this._loaded = true;
          resolve();
          return;
        }

        // Center and scale
        headGeo.computeBoundingBox();
        const box = headGeo.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        headGeo.translate(-center.x, -center.y, -center.z);

        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = (HEAD_SCALE * 2) / maxDim;
        headGeo.scale(scale, scale, scale);

        headGeo.computeBoundingBox();
        headGeo.computeVertexNormals();

        // Raycasting mesh (invisible)
        const tempMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        this._headMesh = new THREE.Mesh(headGeo, tempMat);
        this._headMesh.visible = false;

        // Head wireframe — green
        const wireMat = new THREE.MeshBasicMaterial({
          color: 0x00ff88,
          wireframe: true,
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
        });
        this._wireframe = new THREE.Mesh(headGeo, wireMat);
        this._wireframe.visible = false;
        scene.add(this._wireframe);

        // Head edge lines
        const edgeGeo = new THREE.EdgesGeometry(headGeo, 20);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x00ff88,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        });
        this._edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        this._edgeLines.visible = false;
        scene.add(this._edgeLines);

        this._loaded = true;
        resolve();
      }, undefined, (err) => {
        console.warn('HeadLayout: failed to load head model', err);
        this._loaded = true;
        resolve();
      });
    });

    return this._loadPromise;
  }

  showWireframe() {
    this.setHeadVisible(this._headVisible !== false);
    this.setBrainVisible(this._brainVisible !== false);
  }

  hideWireframe() {
    if (this._wireframe) this._wireframe.visible = false;
    if (this._edgeLines) this._edgeLines.visible = false;
    if (this._brainWireframe) this._brainWireframe.visible = false;
    if (this._brainEdgeLines) this._brainEdgeLines.visible = false;
  }

  setHeadVisible(visible) {
    this._headVisible = visible;
    if (this._wireframe) this._wireframe.visible = visible;
    if (this._edgeLines) this._edgeLines.visible = visible;
  }

  setBrainVisible(visible) {
    this._brainVisible = visible;
    if (this._brainWireframe) this._brainWireframe.visible = visible;
    if (this._brainEdgeLines) this._brainEdgeLines.visible = visible;
  }

  compute(graphData) {
    const { channels, blocks, blockToChannelsMap } = graphData;

    const channelPositions = {};
    const blockPositions = {};

    // --- Place channels on brain surface at key regions ---
    const brainLandmarks = [
      { phi: 0.15, theta: Math.PI / 2 },           // top center (prefrontal)
      { phi: 0.35, theta: Math.PI * 0.75 },        // left frontal
      { phi: 0.35, theta: Math.PI * 0.25 },        // right frontal
      { phi: 0.25, theta: Math.PI / 2 },            // frontal midline
      { phi: 0.50, theta: Math.PI * 0.8 },          // left temporal
      { phi: 0.50, theta: Math.PI * 0.2 },          // right temporal
      { phi: 0.20, theta: Math.PI },                 // left parietal
      { phi: 0.20, theta: 0 },                       // right parietal
      { phi: 0.30, theta: Math.PI * 1.5 },           // occipital
      { phi: 0.40, theta: Math.PI * 1.3 },           // left occipital
      { phi: 0.40, theta: Math.PI * 0.7 + Math.PI }, // right occipital
      { phi: 0.10, theta: Math.PI * 0.5 },           // vertex
    ];

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const lm = brainLandmarks[i % brainLandmarks.length];
      const pos = this._brainSurface(lm.theta, lm.phi * Math.PI);
      // Place channels just outside the brain surface
      const cx = pos.x * 1.02;
      const cy = pos.y + (pos.y - this.brainYOffset) * 0.02;
      const cz = pos.z * 1.02;
      channelPositions[ch.id] = { x: cx, y: cy, z: cz, angle: lm.theta };
    }

    // --- Distribute blocks inside the brain volume ---
    const armBlocks = {};
    const unassigned = [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const chs = blockToChannelsMap[b.id] || [];
      if (chs.length > 0) {
        const primaryCh = chs[0];
        if (!armBlocks[primaryCh]) armBlocks[primaryCh] = [];
        armBlocks[primaryCh].push(i);
      } else {
        unassigned.push(i);
      }
    }

    const totalBlocks = blocks.length;
    let globalIdx = 0;

    const allBlockIndices = [];

    for (let chIdx = 0; chIdx < channels.length; chIdx++) {
      const ch = channels[chIdx];
      const chBlocks = armBlocks[ch.id] || [];
      const lm = brainLandmarks[chIdx % brainLandmarks.length];

      for (let j = 0; j < chBlocks.length; j++) {
        allBlockIndices.push({ blockIdx: chBlocks[j], lm, hasChannel: true });
      }
    }

    for (const blockIdx of unassigned) {
      allBlockIndices.push({ blockIdx, lm: null, hasChannel: false });
    }

    for (const item of allBlockIndices) {
      const fi = globalIdx++;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const fibPhi = Math.acos(1 - 2 * (fi + 0.5) / totalBlocks);
      const fibTheta = goldenAngle * fi;

      let finalPhi = fibPhi;
      let finalTheta = fibTheta;

      // Blend toward channel's brain region if assigned
      if (item.hasChannel && item.lm) {
        const blend = 0.2;
        finalPhi = fibPhi * (1 - blend) + item.lm.phi * Math.PI * blend;
        finalTheta = fibTheta + item.lm.theta * blend;
      }

      // Get the brain surface point at this angle
      const surfPt = this._brainSurface(finalTheta, finalPhi);

      // Scale inward from the brain center to fill the volume
      // Cube-root for even volume density
      const t = (fi + 0.5) / totalBlocks;
      const depthFactor = 0.15 + Math.cbrt(t) * 0.75;

      // Interpolate between brain center and surface point
      blockPositions[item.blockIdx] = {
        x: surfPt.x * depthFactor,
        y: this.brainYOffset + (surfPt.y - this.brainYOffset) * depthFactor,
        z: surfPt.z * depthFactor,
      };
    }

    return { channelPositions, blockPositions };
  }
}
