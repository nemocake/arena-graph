attribute float aLife;
attribute vec3 aColor;

varying vec3 vPColor;
varying float vLife;

void main() {
  vPColor = aColor;
  vLife = aLife;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Size attenuates with distance, particles shrink as they die
  float size = mix(1.0, 6.0, vLife);
  gl_PointSize = size * (400.0 / -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;
}
