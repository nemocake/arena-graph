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
