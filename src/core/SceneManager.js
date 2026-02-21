import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, CAMERA_INITIAL_Z,
  FOG_COLOR, FOG_DENSITY,
} from '../constants.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.callbacks = [];

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.set(0, 400, CAMERA_INITIAL_Z);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1); // force 1 for performance
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // CSS2D label renderer (overlays DOM elements on 3D scene)
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    // Resize handler
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Render state
    this._running = false;
    this._renderFn = null; // set by PostProcessing or default
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    if (this._onResizeCallback) this._onResizeCallback(w, h);
  }

  onResize(fn) {
    this._onResizeCallback = fn;
  }

  /**
   * Register a callback to be called each frame with (delta, elapsed).
   */
  onFrame(fn) {
    this.callbacks.push(fn);
  }

  /**
   * Set custom render function (e.g. EffectComposer.render).
   */
  setRenderFn(fn) {
    this._renderFn = fn;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(() => this._loop());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    for (const cb of this.callbacks) {
      cb(delta, elapsed);
    }

    if (this._renderFn) {
      this._renderFn(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.labelRenderer.render(this.scene, this.camera);
  }

  dispose() {
    this._running = false;
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
