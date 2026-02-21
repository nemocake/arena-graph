import * as THREE from 'three';

/**
 * Arrow key navigation between connected blocks.
 * Uses camera-relative directions.
 */
export class KeyboardNav {
  constructor(state, graphData, nodeRenderer, cameraController) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.cameraController = cameraController;

    this._vec3 = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();

    document.addEventListener('keydown', (e) => this._onKeydown(e));
  }

  _onKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    e.preventDefault();
    const selected = this.state.get('kbSelectedNodeIndex');
    if (selected < 0) {
      // Start from selected or first block
      const sel = this.state.get('selectedNodeIndex');
      this.state.set('kbSelectedNodeIndex', sel >= 0 ? sel : 0);
      return;
    }

    const block = this.graphData.blocks[selected];
    if (!block) return;

    // Get neighbors
    const channels = this.graphData.blockToChannelsMap[block.id] || [];
    const neighborIds = new Set();
    for (const chId of channels) {
      const adj = this.graphData.adjacency[chId] || [];
      for (const nId of adj) {
        if (this.graphData.blockIndexMap[nId] !== undefined && nId !== block.id) {
          neighborIds.add(nId);
        }
      }
    }

    if (neighborIds.size === 0) return;

    // Camera-relative directions
    const camera = this.cameraController.camera;
    camera.getWorldDirection(this._vec3);
    this._camRight.crossVectors(this._vec3, camera.up).normalize();
    this._camUp.crossVectors(this._camRight, this._vec3).normalize();

    // Direction based on key
    let dir;
    switch (e.key) {
      case 'ArrowRight': dir = this._camRight.clone(); break;
      case 'ArrowLeft': dir = this._camRight.clone().negate(); break;
      case 'ArrowUp': dir = this._camUp.clone(); break;
      case 'ArrowDown': dir = this._camUp.clone().negate(); break;
    }

    const currentPos = this.nodeRenderer.getBlockPosition(selected);
    const origin = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);

    // Find neighbor most aligned with direction
    let bestIdx = -1;
    let bestDot = -Infinity;

    for (const nId of neighborIds) {
      const nIdx = this.graphData.blockIndexMap[nId];
      const nPos = this.nodeRenderer.getBlockPosition(nIdx);
      const toNeighbor = new THREE.Vector3(nPos.x - origin.x, nPos.y - origin.y, nPos.z - origin.z).normalize();
      const dot = toNeighbor.dot(dir);
      if (dot > bestDot) {
        bestDot = dot;
        bestIdx = nIdx;
      }
    }

    if (bestIdx >= 0 && bestDot > 0.1) {
      this.state.set('kbSelectedNodeIndex', bestIdx);
      this.state.set('selectedNodeIndex', bestIdx);
    }
  }
}
