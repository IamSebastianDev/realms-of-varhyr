/** Shared foil surface for DOM cards and the R3F battlefield. UV y=0 is the footer. */
export const holographicFragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uPointer;
uniform float uStrength;

void main() {
  vec2 tilt = uPointer - 0.5;
  float sweep = vUv.x * 0.72 + vUv.y * 0.48 + dot(vUv - 0.5, tilt) * 0.8;
  float phase = sweep * 8.0 - uTime * 0.32 + tilt.x * 2.0;
  vec3 spectrum = 0.58 + 0.42 * cos(phase + vec3(0.0, 2.094, 4.188));
  float sheen = pow(0.5 + 0.5 * sin(sweep * 12.0 - uTime * 0.42), 7.0);
  // Fine diffraction lines give the finish a foil texture rather than a flat tint.
  float etching = pow(0.5 + 0.5 * sin((vUv.x - vUv.y) * 520.0), 12.0);
  float edge = pow(abs(vUv.x - 0.5) * 2.0, 3.0);
  float footerMask = smoothstep(0.18, 0.42, vUv.y);
  float alpha = (0.045 + sheen * 0.22 + etching * 0.045 + edge * 0.055)
    * footerMask * uStrength;
  gl_FragColor = vec4(mix(spectrum, vec3(1.0), sheen * 0.32), alpha);
}
`;

export const holographicVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
