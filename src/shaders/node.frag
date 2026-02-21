uniform float uTime;
uniform float uLiving;

varying vec3 vColor;
varying float vOpacity;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // Basic rim lighting for glow effect
  vec3 viewDir = normalize(vViewPosition);
  float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
  rim = pow(rim, 2.0);

  // In living mode: amplified pulsing rim
  float rimStrength = mix(0.3, 0.6 + sin(uTime * 1.5) * 0.2, uLiving);

  // Emissive glow
  vec3 emissive = vColor * rimStrength * rim;
  vec3 finalColor = vColor * 0.7 + emissive;

  // Living mode: subtle inner glow pulse
  float innerGlow = mix(0.0, sin(uTime * 0.8 + rim * 3.0) * 0.1 + 0.05, uLiving);
  finalColor += vColor * innerGlow;

  gl_FragColor = vec4(finalColor, vOpacity);
}
