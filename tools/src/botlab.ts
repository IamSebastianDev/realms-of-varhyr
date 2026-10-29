// Deterministic seeds shared by the bot comparison and balance tools.
export function seedFor(sample: number): number {
  let s = (sample + 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
  return (s ^ (s >>> 16)) >>> 0;
}
