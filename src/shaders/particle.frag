varying vec3 vPColor;
varying float vLife;

void main() {
  // Soft circle
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  // Glow falloff
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  glow = pow(glow, 1.5);

  // Fade with life
  float alpha = glow * vLife * 0.9;

  gl_FragColor = vec4(vPColor * (1.0 + glow * 0.5), alpha);
}
