import * as THREE from 'three';
import { EDGE_OPACITY, FADED_OPACITY } from '../constants.js';

/**
 * Renders all edges as a single LineSegments draw call.
 */
export class EdgeRenderer {
  constructor(scene, graphData, nodeRenderer) {
    this.scene = scene;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeCount = graphData.edges.length;

    // Each edge = 2 vertices = 6 floats for positions
    this.positionArray = new Float32Array(this.edgeCount * 6);
    this.colorArray = new Float32Array(this.edgeCount * 6);  // color per vertex
    this.opacityArray = new Float32Array(this.edgeCount * 2); // opacity per edge (stored per vertex pair)

    // Initialize colors from edge source channel
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = graphData.edges[i];
      const color = graphData.getChannelColor(edge.source);
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;

      // Both vertices same color
      this.colorArray[i * 6] = r;
      this.colorArray[i * 6 + 1] = g;
      this.colorArray[i * 6 + 2] = b;
      this.colorArray[i * 6 + 3] = r;
      this.colorArray[i * 6 + 4] = g;
      this.colorArray[i * 6 + 5] = b;

      this.opacityArray[i * 2] = EDGE_OPACITY;
      this.opacityArray[i * 2 + 1] = EDGE_OPACITY;
    }

    this.originalOpacities = new Float32Array(this.opacityArray);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: EDGE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lineSegments = new THREE.LineSegments(geometry, this.material);
    this.lineSegments.frustumCulled = false;
    scene.add(this.lineSegments);

    // Edge lookup: edgeIndex by "source-target" key
    this.edgeIndexMap = {};
    graphData.edges.forEach((e, i) => {
      this.edgeIndexMap[`${e.source}-${e.target}`] = i;
      this.edgeIndexMap[`${e.target}-${e.source}`] = i;
    });

    // Constellation edges (dynamic, separate mesh)
    this.constellationGroup = new THREE.Group();
    scene.add(this.constellationGroup);
  }

  /**
   * Update edge positions from current node positions.
   * Call after layout changes.
   */
  updatePositions() {
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = this.graphData.edges[i];

      // Source is always a channel
      const chIdx = this.graphData.channelIndexMap[edge.source];
      let sx, sy, sz;
      if (chIdx !== undefined) {
        const p = this.nodeRenderer.getChannelPosition(chIdx);
        sx = p.x; sy = p.y; sz = p.z;
      } else {
        sx = sy = sz = 0;
      }

      // Target is always a block
      const blIdx = this.graphData.blockIndexMap[edge.target];
      let tx, ty, tz;
      if (blIdx !== undefined) {
        const p = this.nodeRenderer.getBlockPosition(blIdx);
        tx = p.x; ty = p.y; tz = p.z;
      } else {
        tx = ty = tz = 0;
      }

      this.positionArray[i * 6] = sx;
      this.positionArray[i * 6 + 1] = sy;
      this.positionArray[i * 6 + 2] = sz;
      this.positionArray[i * 6 + 3] = tx;
      this.positionArray[i * 6 + 4] = ty;
      this.positionArray[i * 6 + 5] = tz;
    }

    this.lineSegments.geometry.getAttribute('position').needsUpdate = true;
  }

  /**
   * Set edge opacity by edge index.
   */
  setEdgeOpacity(edgeIndex, opacity) {
    // We control this via material for simplicity
    // Individual edge opacity would need a custom shader
    // For now, we'll use the overall material opacity approach
  }

  /**
   * Fade edges not connected to visible blocks.
   */
  fadeEdgesExcept(visibleBlockIndices) {
    // Since we use material-level opacity, we adjust color alpha via vertex colors
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = this.graphData.edges[i];
      const blIdx = this.graphData.blockIndexMap[edge.target];
      const visible = blIdx !== undefined && visibleBlockIndices.has(blIdx);
      const alpha = visible ? 1.0 : 0.1;

      // Dim color to simulate fade
      const baseIdx = i * 6;
      if (!visible) {
        this.colorArray[baseIdx] *= 0.1;
        this.colorArray[baseIdx + 1] *= 0.1;
        this.colorArray[baseIdx + 2] *= 0.1;
        this.colorArray[baseIdx + 3] *= 0.1;
        this.colorArray[baseIdx + 4] *= 0.1;
        this.colorArray[baseIdx + 5] *= 0.1;
      }
    }
    this.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  /**
   * Reset edge colors to original.
   */
  resetColors() {
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = this.graphData.edges[i];
      const color = this.graphData.getChannelColor(edge.source);
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      this.colorArray[i * 6] = r;
      this.colorArray[i * 6 + 1] = g;
      this.colorArray[i * 6 + 2] = b;
      this.colorArray[i * 6 + 3] = r;
      this.colorArray[i * 6 + 4] = g;
      this.colorArray[i * 6 + 5] = b;
    }
    this.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  /**
   * Highlight specific edges (e.g. for path).
   */
  highlightEdges(edgeIndices, color) {
    for (const idx of edgeIndices) {
      const baseIdx = idx * 6;
      this.colorArray[baseIdx] = color[0];
      this.colorArray[baseIdx + 1] = color[1];
      this.colorArray[baseIdx + 2] = color[2];
      this.colorArray[baseIdx + 3] = color[0];
      this.colorArray[baseIdx + 4] = color[1];
      this.colorArray[baseIdx + 5] = color[2];
    }
    this.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  /**
   * Add constellation edges (dashed lines between tag-sharing blocks).
   */
  setConstellationEdges(pairs) {
    // Clear old
    while (this.constellationGroup.children.length > 0) {
      const child = this.constellationGroup.children[0];
      child.geometry.dispose();
      child.material.dispose();
      this.constellationGroup.remove(child);
    }

    if (pairs.length === 0) return;

    const positions = new Float32Array(pairs.length * 6);
    for (let i = 0; i < pairs.length; i++) {
      const [aIdx, bIdx] = pairs[i];
      const a = this.nodeRenderer.getBlockPosition(aIdx);
      const b = this.nodeRenderer.getBlockPosition(bIdx);
      positions[i * 6] = a.x;
      positions[i * 6 + 1] = a.y;
      positions[i * 6 + 2] = a.z;
      positions[i * 6 + 3] = b.x;
      positions[i * 6 + 4] = b.y;
      positions[i * 6 + 5] = b.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineDashedMaterial({
      color: 0xccff00,
      dashSize: 8,
      gapSize: 4,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.computeLineDistances();
    lines.frustumCulled = false;
    this.constellationGroup.add(lines);
  }

  clearConstellation() {
    this.setConstellationEdges([]);
  }
}
