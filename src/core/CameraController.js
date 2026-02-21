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
    this._orbiting = false;
    this._orbitAngle = 0;
    // Current (lerped) orbit params
    this._orbitRadius = 0;
    this._orbitCenter = new THREE.Vector3();
    this._orbitY = 0;
    // Target orbit params (what we lerp toward)
    this._orbitRadiusTarget = 0;
    this._orbitCenterTarget = new THREE.Vector3();
    this._orbitYTarget = 0;

    // Zoom slider
    this._zoomSlider = document.getElementById('zoom-slider');
    this._zoomTarget = null;
    if (this._zoomSlider) {
      this._zoomSlider.addEventListener('input', () => {
        const t = parseInt(this._zoomSlider.value) / 1000; // 0..1 (top = close, bottom = far)
        const minD = this.controls.minDistance;
        const maxD = this.controls.maxDistance;
        // Exponential interpolation for smooth feel
        this._zoomTarget = minD * Math.pow(maxD / minD, 1 - t);
      });
    }

    // Stop orbit on any user interaction
    const stopOrbit = () => {
      if (this._orbiting) this.stopOrbit();
    };
    this.domElement.addEventListener('pointerdown', stopOrbit);
    this.domElement.addEventListener('wheel', stopOrbit);

    sceneManager.onFrame((delta) => {
      this.controls.update();
      if (this._flyAnim) this._updateFly();
      if (this._orbiting) this._updateOrbit(delta);
      this._updateZoom();
      this._syncSlider();
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
   * Smoothly lerp camera distance toward zoom target.
   */
  _updateZoom() {
    if (this._zoomTarget === null) return;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const currentDist = dir.length();
    const newDist = currentDist + (this._zoomTarget - currentDist) * 0.08;
    if (Math.abs(newDist - this._zoomTarget) < 0.5) {
      this._zoomTarget = null;
    }
    dir.normalize().multiplyScalar(newDist);
    this.camera.position.copy(this.controls.target).add(dir);
  }

  /**
   * Sync slider thumb to current camera distance (from scroll wheel, fly-to, etc.)
   */
  _syncSlider() {
    if (!this._zoomSlider || this._zoomTarget !== null) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const minD = this.controls.minDistance;
    const maxD = this.controls.maxDistance;
    const t = 1 - Math.log(dist / minD) / Math.log(maxD / minD);
    this._zoomSlider.value = Math.round(Math.max(0, Math.min(1, t)) * 1000);
  }

  /**
   * Start orbit mode — fits graph in view then slowly rotates.
   * If already orbiting, smoothly transitions to new orbit params.
   */
  startOrbit(positions, radiusMultiplier = 1.0) {
    if (!positions || positions.length === 0) return;

    // Compute bounding box center + radius
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

    const newRadius = distance * 0.8 * radiusMultiplier;
    const newY = center.y + newRadius * 0.35;

    // Set targets
    this._orbitCenterTarget.copy(center);
    this._orbitRadiusTarget = newRadius;
    this._orbitYTarget = newY;

    if (!this._orbiting) {
      // First start — snap current values so there's no lerp from zero
      this._orbitCenter.copy(center);
      this._orbitRadius = newRadius;
      this._orbitY = newY;

      // Start from current camera angle
      const dx = this.camera.position.x - center.x;
      const dz = this.camera.position.z - center.z;
      this._orbitAngle = Math.atan2(dz, dx);
    }
    // If already orbiting, current values will lerp toward targets in _updateOrbit

    this._orbiting = true;
    this._flyAnim = null;

    const btn = document.getElementById('btn-orbit');
    if (btn) btn.classList.add('active');
  }

  stopOrbit() {
    this._orbiting = false;
    const btn = document.getElementById('btn-orbit');
    if (btn) btn.classList.remove('active');
  }

  _updateOrbit(delta) {
    // Smoothly lerp orbit params toward targets
    const lerpSpeed = 0.02;
    this._orbitRadius += (this._orbitRadiusTarget - this._orbitRadius) * lerpSpeed;
    this._orbitY += (this._orbitYTarget - this._orbitY) * lerpSpeed;
    this._orbitCenter.lerp(this._orbitCenterTarget, lerpSpeed);

    this._orbitAngle += delta * 0.15; // slow rotation speed
    const x = this._orbitCenter.x + Math.cos(this._orbitAngle) * this._orbitRadius;
    const z = this._orbitCenter.z + Math.sin(this._orbitAngle) * this._orbitRadius;

    // Gentle vertical bob
    const y = this._orbitY + Math.sin(this._orbitAngle * 0.3) * this._orbitRadius * 0.08;

    this.camera.position.set(x, y, z);
    this.controls.target.copy(this._orbitCenter);
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
