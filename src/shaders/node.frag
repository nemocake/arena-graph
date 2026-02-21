uniform float uTime;

varying vec3 vColor;
varying float vOpacity;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // Basic rim lighting for glow effect
  vec3 viewDir = normalize(vViewPosition);
  float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
  rim = pow(rim, 2.0);

  // Emissive glow
  vec3 emissive = vColor * 0.3 * rim;
  vec3 finalColor = vColor * 0.7 + emissive;

  gl_FragColor = vec4(finalColor, vOpacity);
}
