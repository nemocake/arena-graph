import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD } from '../constants.js';

// Custom scanline + vignette shader
const ScanlineVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // CRT scanlines
      float scanline = sin(vUv.y * uResolution.y * 1.5) * 0.04;
      color.rgb -= scanline;

      // Vignette
      vec2 uv = vUv * 2.0 - 1.0;
      float vignette = 1.0 - dot(uv * 0.5, uv * 0.5);
      vignette = clamp(vignette, 0.0, 1.0);
      color.rgb *= vignette;

      gl_FragColor = color;
    }
  `,
};

export class PostProcessing {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    const { renderer, scene, camera } = sceneManager;
    const size = renderer.getSize(new THREE.Vector2());

    this.composer = new EffectComposer(renderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    );
    this.composer.addPass(this.bloomPass);

    // Afterimage (motion trails for Dream mode — starts disabled)
    this.afterimagePass = new AfterimagePass(0.85);
    this.afterimagePass.enabled = false;
    this.composer.addPass(this.afterimagePass);

    // Scanline + Vignette
    this.scanlinePass = new ShaderPass(ScanlineVignetteShader);
    this.scanlinePass.uniforms.uResolution.value.set(size.x, size.y);
    this.composer.addPass(this.scanlinePass);

    // Wire into SceneManager
    sceneManager.setRenderFn((delta) => {
      this.scanlinePass.uniforms.uTime.value += delta;
      this.composer.render(delta);
    });

    sceneManager.onResize((w, h) => {
      this.composer.setSize(w, h);
      this.bloomPass.resolution.set(w, h);
      this.scanlinePass.uniforms.uResolution.value.set(w, h);
    });
  }
}
