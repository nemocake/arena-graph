import * as THREE from 'three';

/**
 * GPU color-ID picking: render 1x1 pixel offscreen with unique color per instance.
 * O(1) per frame — way faster than raycasting 2300 objects.
 */
export class Raycaster {
  constructor(sceneManager, nodeRenderer) {
    this.sceneManager = sceneManager;
    this.nodeRenderer = nodeRenderer;
    this.camera = sceneManager.camera;

    // Offscreen render target (1x1 pixel)
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    this.pixelBuffer = new Uint8Array(4);
    this._pickScene = new THREE.Scene();

    // Mouse position in NDC
    this._mouse = new THREE.Vector2();
    this._lastPickId = -1;
  }

  /**
   * Update mouse position from a MouseEvent.
   */
  setMouse(event, container) {
    const rect = container.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Pick the block index at current mouse position.
   * Returns block index (0-based) or -1 if no hit.
   */
  pick() {
    const renderer = this.sceneManager.renderer;
    const camera = this.camera;

    // Set up pick scene with only the pick mesh
    this._pickScene.children = [];
    this._pickScene.add(this.nodeRenderer.pickMesh);

    // Set camera to render just 1 pixel at mouse position
    const cam = camera.clone();
    const { width, height } = renderer.getSize(new THREE.Vector2());

    // Convert NDC to pixel coordinates
    const pixelX = ((this._mouse.x + 1) / 2) * width;
    const pixelY = ((1 - this._mouse.y) / 2) * height;

    // Set up camera to render single pixel
    cam.setViewOffset(width, height, pixelX, pixelY, 1, 1);

    // Render to pick target
    const oldTarget = renderer.getRenderTarget();
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(this.pickTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this._pickScene, cam);

    // Read pixel
    renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pixelBuffer);

    // Restore
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldClearColor, oldClearAlpha);

    // Decode pick ID from RGB
    const r = this.pixelBuffer[0];
    const g = this.pixelBuffer[1];
    const b = this.pixelBuffer[2];
    const id = r + g * 256 + b * 65536;

    // id 0 = no hit, id 1+ = block index (0-based = id - 1)
    return id > 0 ? id - 1 : -1;
  }

  dispose() {
    this.pickTarget.dispose();
  }
}
