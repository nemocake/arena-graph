import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FLY_TO_DURATION, FLY_TO_OFFSET } from '../constants.js';

export class CameraController {
  constructor(sceneManager) {
    this.camera = sceneManager.camera;
    this.domElement = sceneManager.renderer.domElement;

    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 8000;
    this.controls.maxPolarAngle = Math.PI * 0.85;

    // Animation state
    this._flyAnim = null;

    sceneManager.onFrame((delta) => {
      this.controls.update();
      if (this._flyAnim) this._updateFly();
    });
  }

  /**
   * Smoothly fly camera to look at a 3D position.
   */
  flyTo(targetPos, offset = FLY_TO_OFFSET) {
    const start = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };
    const end = {
      pos: new THREE.Vector3(
        targetPos.x + offset * 0.5,
        targetPos.y + offset * 0.8,
        targetPos.z + offset
      ),
      target: new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
    };
    this._flyAnim = {
      start,
      end,
      startTime: performance.now(),
      duration: FLY_TO_DURATION,
    };
  }

  _updateFly() {
    const a = this._flyAnim;
    let t = (performance.now() - a.startTime) / a.duration;
    if (t >= 1) {
      t = 1;
      this._flyAnim = null;
    }
    // Ease out cubic
    const ease = 1 - Math.pow(1 - t, 3);

    this.camera.position.lerpVectors(a.start.pos, a.end.pos, ease);
    this.controls.target.lerpVectors(a.start.target, a.end.target, ease);
  }

  /**
   * Reset camera to initial position.
   */
  reset() {
    this.flyTo({ x: 0, y: 0, z: 0 }, 2500);
  }

  /**
   * Fit all nodes in view by computing bounding box.
   */
  fitToNodes(positions) {
    if (!positions || positions.length === 0) return;

    const box = new THREE.Box3();
    for (const p of positions) {
      box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim / (2 * Math.tan(this.camera.fov * Math.PI / 360));

    this.flyTo(
      { x: center.x, y: center.y, z: center.z },
      distance * 0.7
    );
  }
}
