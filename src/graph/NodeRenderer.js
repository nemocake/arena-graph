import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { hexToRgb } from '../utils/ColorUtils.js';
import {
  NODE_GEOMETRY_RADIUS, NODE_GEOMETRY_DETAIL,
  CHANNEL_SIZE_BASE, CHANNEL_SIZE_SCALE,
  FADED_OPACITY,
} from '../constants.js';

import nodeVert from '../shaders/node.vert';
import nodeFrag from '../shaders/node.frag';
import pickingVert from '../shaders/picking.vert';
import pickingFrag from '../shaders/picking.frag';

export class NodeRenderer {
  constructor(scene, graphData) {
    this.scene = scene;
    this.graphData = graphData;
    this.blockCount = graphData.blocks.length;

    // --- Block InstancedMesh ---
    const geo = new THREE.IcosahedronGeometry(NODE_GEOMETRY_RADIUS, NODE_GEOMETRY_DETAIL);

    // Per-instance attributes
    this.colorAttr = new Float32Array(this.blockCount * 3);
    this.opacityAttr = new Float32Array(this.blockCount);
    this.scaleAttr = new Float32Array(this.blockCount);
    this.pickIdAttr = new Float32Array(this.blockCount);

    // Initialize
    for (let i = 0; i < this.blockCount; i++) {
      const block = graphData.blocks[i];
      const [r, g, b] = hexToRgb(block.color);
      this.colorAttr[i * 3] = r;
      this.colorAttr[i * 3 + 1] = g;
      this.colorAttr[i * 3 + 2] = b;

      // Multi-channel blocks are brighter
      const channels = graphData.blockToChannelsMap[block.id] || [];
      this.opacityAttr[i] = channels.length > 1 ? 0.8 : 0.5;
      this.scaleAttr[i] = channels.length > 1 ? 1.6 : 1.0;
      this.pickIdAttr[i] = i + 1; // 0 = no hit
    }

    // Store original values for reset
    this.originalColors = new Float32Array(this.colorAttr);
    this.originalOpacities = new Float32Array(this.opacityAttr);
    this.originalScales = new Float32Array(this.scaleAttr);

    // Instanced geometry with attributes
    const instancedGeo = geo.clone();
    instancedGeo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(this.colorAttr, 3));
    instancedGeo.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(this.opacityAttr, 1));
    instancedGeo.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(this.scaleAttr, 1));
    instancedGeo.setAttribute('instancePickID', new THREE.InstancedBufferAttribute(this.pickIdAttr, 1));

    // Main render material
    this.material = new THREE.ShaderMaterial({
      vertexShader: nodeVert,
      fragmentShader: nodeFrag,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(instancedGeo, this.material, this.blockCount);
    this.mesh.frustumCulled = false;

    // Initialize transforms (all at origin, will be set by layout)
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.blockCount; i++) {
      dummy.position.set(0, 0, 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);

    // --- Picking material (separate mesh that shares geometry) ---
    this.pickMaterial = new THREE.ShaderMaterial({
      vertexShader: pickingVert,
      fragmentShader: pickingFrag,
      transparent: false,
      depthWrite: true,
    });
    this.pickMesh = new THREE.InstancedMesh(instancedGeo, this.pickMaterial, this.blockCount);
    this.pickMesh.frustumCulled = false;
    // Don't add to scene — used only for offscreen picking render

    // --- Channel meshes (individual, with wireframe) ---
    this.channelMeshes = [];
    this.channelGroup = new THREE.Group();

    for (let i = 0; i < graphData.channels.length; i++) {
      const ch = graphData.channels[i];
      const size = Math.max(CHANNEL_SIZE_BASE, ch.size * CHANNEL_SIZE_SCALE);
      const chGeo = new THREE.BoxGeometry(size, size * 0.6, size * 0.3);
      const color = new THREE.Color(graphData.channelColorMap[ch.id]);

      // Solid fill
      const chMat = new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0.9,
      });
      const chMesh = new THREE.Mesh(chGeo, chMat);

      // Wireframe edges
      const edgesGeo = new THREE.EdgesGeometry(chGeo);
      const edgesMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
      chMesh.add(wireframe);

      // Channel name label
      const labelDiv = document.createElement('div');
      labelDiv.style.fontFamily = '"Syne", sans-serif';
      labelDiv.style.fontSize = '10px';
      labelDiv.style.fontWeight = '700';
      labelDiv.style.textTransform = 'uppercase';
      labelDiv.style.color = color.getStyle();
      labelDiv.style.textShadow = `0 0 8px ${color.getStyle()}66, 0 1px 3px rgba(0,0,0,0.8)`;
      labelDiv.style.letterSpacing = '0.08em';
      labelDiv.style.whiteSpace = 'nowrap';
      labelDiv.textContent = ch.label;
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, size * 0.45, 0);
      chMesh.add(label);

      chMesh.userData = { channelId: ch.id, channelIndex: i, label: ch.label };
      this.channelMeshes.push(chMesh);
      this.channelGroup.add(chMesh);
    }
    scene.add(this.channelGroup);

    // Position array cache (for reading back current positions)
    this.positions = new Float32Array(this.blockCount * 3);
    this._dummy = new THREE.Object3D();
    this._mat4 = new THREE.Matrix4();
    this._vec3 = new THREE.Vector3();
  }

  /**
   * Set position of a block node by index.
   */
  setBlockPosition(index, x, y, z) {
    this.positions[index * 3] = x;
    this.positions[index * 3 + 1] = y;
    this.positions[index * 3 + 2] = z;

    this._dummy.position.set(x, y, z);
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this._dummy.matrix);
    this.pickMesh.setMatrixAt(index, this._dummy.matrix);
  }

  /**
   * Get position of a block node by index.
   */
  getBlockPosition(index) {
    return {
      x: this.positions[index * 3],
      y: this.positions[index * 3 + 1],
      z: this.positions[index * 3 + 2],
    };
  }

  /**
   * Set channel position by index.
   */
  setChannelPosition(index, x, y, z) {
    this.channelMeshes[index].position.set(x, y, z);
  }

  getChannelPosition(index) {
    const p = this.channelMeshes[index].position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /**
   * Update instance color for a block.
   */
  setBlockColor(index, r, g, b) {
    this.colorAttr[index * 3] = r;
    this.colorAttr[index * 3 + 1] = g;
    this.colorAttr[index * 3 + 2] = b;
  }

  setBlockOpacity(index, opacity) {
    this.opacityAttr[index] = opacity;
  }

  setBlockScale(index, scale) {
    this.scaleAttr[index] = scale;
  }

  /**
   * Commit attribute changes to GPU.
   */
  commitAttributes() {
    const geo = this.mesh.geometry;
    geo.getAttribute('instanceColor').needsUpdate = true;
    geo.getAttribute('instanceOpacity').needsUpdate = true;
    geo.getAttribute('instanceScale').needsUpdate = true;
  }

  commitPositions() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pickMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Reset all instance attributes to their original values.
   */
  resetAttributes() {
    this.colorAttr.set(this.originalColors);
    this.opacityAttr.set(this.originalOpacities);
    this.scaleAttr.set(this.originalScales);
    this.commitAttributes();
  }

  /**
   * Fade all blocks except the given indices.
   */
  fadeAllExcept(visibleIndices) {
    for (let i = 0; i < this.blockCount; i++) {
      if (visibleIndices.has(i)) {
        this.opacityAttr[i] = this.originalOpacities[i];
        this.scaleAttr[i] = this.originalScales[i];
      } else {
        this.opacityAttr[i] = FADED_OPACITY;
        this.scaleAttr[i] = 0.5;
      }
    }
    this.commitAttributes();
  }

  /**
   * Get all block positions as array of {x,y,z} for camera fitting.
   */
  getAllPositions() {
    const out = [];
    for (let i = 0; i < this.blockCount; i++) {
      out.push(this.getBlockPosition(i));
    }
    for (const cm of this.channelMeshes) {
      out.push({ x: cm.position.x, y: cm.position.y, z: cm.position.z });
    }
    return out;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;
  }
}
