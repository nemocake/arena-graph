attribute float instancePickID;
attribute float instanceScale;

varying vec4 vPickColor;

void main() {
  // Encode pick ID as RGB color (up to 16M unique IDs)
  float id = instancePickID;
  float r = mod(id, 256.0) / 255.0;
  float g = mod(floor(id / 256.0), 256.0) / 255.0;
  float b = mod(floor(id / 65536.0), 256.0) / 255.0;
  vPickColor = vec4(r, g, b, 1.0);

  vec3 transformed = position * instanceScale;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
