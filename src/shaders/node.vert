attribute vec3 instanceColor;
attribute float instanceOpacity;
attribute float instanceScale;

varying vec3 vColor;
varying float vOpacity;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vColor = instanceColor;
  vOpacity = instanceOpacity;
  vNormal = normalize(normalMatrix * normal);

  vec3 transformed = position * instanceScale;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
