/** Shared foil surface for DOM cards and the R3F battlefield. UV y=0 is the footer. */
export const holographicFragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uPointer;
uniform float uStrength;
uniform float uFinish;

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
  vec3 colour = mix(spectrum, vec3(1.0), sheen * 0.32);
  if (uFinish > 0.5 && uFinish < 1.5) {
    // Broad, low-saturation nacre. No modification of the illustration below the coating.
    float wave = sin(vUv.x * 5.0 + vUv.y * 3.0 + tilt.x * 3.0 - uTime * 0.18)
      + cos(vUv.y * 7.0 - vUv.x * 2.0 + tilt.y * 3.0 + uTime * 0.12);
    vec3 nacre = 0.82 + 0.18 * cos(wave * 1.7 + vec3(0.0, 1.8, 3.8));
    float lustre = pow(0.5 + 0.5 * cos(wave * 2.0 + sweep * 4.0), 3.0);
    colour = mix(nacre, vec3(1.0, 0.97, 0.90), lustre * 0.35);
    alpha = (0.025 + lustre * 0.25 + edge * 0.04) * footerMask * uStrength;
  } else if (uFinish > 1.5 && uFinish < 2.5) {
    // Two directions of hairline tooling in the foil, revealed by a travelling reflection.
    float grooves = pow(0.5 + 0.5 * sin((vUv.x * 0.7 + vUv.y) * 620.0), 18.0);
    float cross = pow(0.5 + 0.5 * sin((vUv.x - vUv.y * 0.6) * 440.0), 24.0);
    float reflection = pow(0.5 + 0.5 * sin(sweep * 9.0 - uTime * 0.35), 5.0);
    colour = mix(vec3(0.76, 0.83, 0.88), vec3(1.0, 0.89, 0.66), reflection);
    colour = mix(colour, spectrum, reflection * 0.14);
    alpha = (0.015 + grooves * (0.065 + reflection * 0.32) + cross * reflection * 0.14
      + reflection * 0.10 + edge * 0.04) * footerMask * uStrength;
  } else if (uFinish > 2.5) {
    // Staggered triangular facets; each reflects the same light at a different angle.
    vec2 grid = vec2(vUv.x * 4.5 - vUv.y * 3.2, vUv.y * 6.4);
    vec2 cell = floor(grid), local = fract(grid);
    float triangle = step(1.0, local.x + local.y);
    float seed = fract(sin(dot(cell, vec2(127.1, 311.7)) + triangle * 74.7) * 43758.5453);
    float facetPhase = seed * 6.283 + sweep * 3.5 + tilt.x * 4.0 - tilt.y * 3.0 - uTime * 0.3;
    colour = 0.55 + 0.45 * cos(facetPhase + vec3(0.0, 2.094, 4.188));
    float flash = pow(0.5 + 0.5 * cos(facetPhase + seed * 2.0), 10.0);
    colour = mix(colour, vec3(1.0), flash * 0.5);
    alpha = (0.035 + flash * 0.32 + sheen * 0.065) * footerMask * uStrength;
  }
  gl_FragColor = vec4(colour, alpha);
}
`;

export const holographicVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
