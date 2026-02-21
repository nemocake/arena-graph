/**
 * 2D canvas overlay: top-down XZ projection of all nodes.
 */
export class MinimapRenderer {
  constructor(nodeRenderer, camera, graphData) {
    this.nodeRenderer = nodeRenderer;
    this.camera = camera;
    this.graphData = graphData;

    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this._dirty = true;
    this._cachedBitmap = null;
  }

  /**
   * Mark as needing redraw (call after layout changes).
   */
  invalidate() {
    this._dirty = true;
  }

  /**
   * Render minimap. Called each frame or on demand.
   */
  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Redraw node dots if dirty
    if (this._dirty) {
      this._renderNodes();
      this._dirty = false;
    }

    // Draw cached bitmap
    if (this._cachedBitmap) {
      ctx.putImageData(this._cachedBitmap, 0, 0);
    }

    // Overlay camera viewport rectangle
    this._drawViewport();
  }

  _renderNodes() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Find bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const nr = this.nodeRenderer;
    for (let i = 0; i < nr.blockCount; i++) {
      const pos = nr.getBlockPosition(i);
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
    }

    // Add padding
    const pad = 100;
    minX -= pad; maxX += pad;
    minZ -= pad; maxZ += pad;

    this._bounds = { minX, maxX, minZ, maxZ };
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    // Draw blocks
    for (let i = 0; i < nr.blockCount; i++) {
      const pos = nr.getBlockPosition(i);
      const x = ((pos.x - minX) / rangeX) * w;
      const y = ((pos.z - minZ) / rangeZ) * h;

      const r = Math.floor(nr.colorAttr[i * 3] * 255);
      const g = Math.floor(nr.colorAttr[i * 3 + 1] * 255);
      const b = Math.floor(nr.colorAttr[i * 3 + 2] * 255);

      ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
      ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }

    // Draw channels
    for (const cm of nr.channelMeshes) {
      const x = ((cm.position.x - minX) / rangeX) * w;
      const y = ((cm.position.z - minZ) / rangeZ) * h;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(Math.floor(x) - 1, Math.floor(y) - 1, 3, 3);
    }

    this._cachedBitmap = ctx.getImageData(0, 0, w, h);
  }

  _drawViewport() {
    if (!this._bounds) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const { minX, maxX, minZ, maxZ } = this._bounds;
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    // Project camera frustum corners to XZ plane
    const cam = this.camera;
    const pos = cam.position;
    const target = new (cam.position.constructor)();
    // Approximate viewport as a rectangle around camera target
    const dist = pos.distanceTo(cam.position) || 500;
    const fov = cam.fov * Math.PI / 180;
    const halfH = Math.tan(fov / 2) * dist;
    const halfW = halfH * cam.aspect;

    // Simple approximation: rectangle centered on camera XZ
    const cx = ((pos.x - minX) / rangeX) * w;
    const cy = ((pos.z - minZ) / rangeZ) * h;
    const vw = (halfW * 2 / rangeX) * w;
    const vh = (halfH * 2 / rangeZ) * h;

    ctx.strokeStyle = 'rgba(204,255,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - vw / 2, cy - vh / 2, vw, vh);
  }
}
