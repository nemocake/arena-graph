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
    uScanlineIntensity: { value: 0.04 },
    uVignetteStrength: { value: 0.5 },
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
    uniform float uScanlineIntensity;
    uniform float uVignetteStrength;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // CRT scanlines
      float scanline = sin(vUv.y * uResolution.y * 1.5) * uScanlineIntensity;
      color.rgb -= scanline;

      // Vignette
      vec2 uv = vUv * 2.0 - 1.0;
      float vignette = 1.0 - dot(uv * uVignetteStrength, uv * uVignetteStrength);
      vignette = clamp(vignette, 0.0, 1.0);
      color.rgb *= vignette;

      gl_FragColor = color;
    }
  `,
};

// Color grading shader — hue shift, saturation, temperature, invert
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uHueShift: { value: 0.0 },
    uSaturation: { value: 1.0 },
    uTemperature: { value: 0.0 },
    uInvert: { value: 0.0 },
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
    uniform float uHueShift;
    uniform float uSaturation;
    uniform float uTemperature;
    uniform float uInvert;
    varying vec2 vUv;

    vec3 rgb2hsl(vec3 c) {
      float mx = max(c.r, max(c.g, c.b));
      float mn = min(c.r, min(c.g, c.b));
      float l = (mx + mn) * 0.5;
      if (mx == mn) return vec3(0.0, 0.0, l);
      float d = mx - mn;
      float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
      float h;
      if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
      else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
      else h = (c.r - c.g) / d + 4.0;
      return vec3(h / 6.0, s, l);
    }

    float hue2rgb(float p, float q, float t) {
      if (t < 0.0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
      if (t < 0.5) return q;
      if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
      return p;
    }

    vec3 hsl2rgb(vec3 hsl) {
      if (hsl.y == 0.0) return vec3(hsl.z);
      float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
      float p = 2.0 * hsl.z - q;
      return vec3(
        hue2rgb(p, q, hsl.x + 1.0/3.0),
        hue2rgb(p, q, hsl.x),
        hue2rgb(p, q, hsl.x - 1.0/3.0)
      );
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Invert
      color.rgb = mix(color.rgb, 1.0 - color.rgb, uInvert);

      // Hue shift + saturation via HSL
      vec3 hsl = rgb2hsl(color.rgb);
      hsl.x = fract(hsl.x + uHueShift);
      hsl.y *= uSaturation;
      color.rgb = hsl2rgb(hsl);

      // Temperature (warm = +red -blue, cool = -red +blue)
      color.r += uTemperature * 0.1;
      color.b -= uTemperature * 0.1;

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

    // Color grading
    this.colorGradingPass = new ShaderPass(ColorGradingShader);
    this.composer.addPass(this.colorGradingPass);

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
