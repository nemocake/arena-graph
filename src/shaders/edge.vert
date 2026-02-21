attribute vec3 instanceColorAttr;
attribute float instanceOpacityAttr;

varying vec3 vColor;
varying float vOpacity;

void main() {
  vColor = instanceColorAttr;
  vOpacity = instanceOpacityAttr;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
