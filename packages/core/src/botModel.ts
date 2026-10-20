import data from './botModel.json';

/** A one-hidden-layer network: tanh units, a single output that is the log-odds that the player to move wins. */
export type Model = { mean: number[]; scale: number[]; w1: number[][]; b1: number[]; w2: number[]; b2: number };
export const model = (data as Model | null);
export function logit(net: Model, input: number[]): number {
  const hidden = net.w1.map((row, unit) => {
    let sum = net.b1[unit];
    for (let i = 0; i < row.length; i++) sum += row[i] * ((input[i] - net.mean[i]) / net.scale[i]);
    return Math.tanh(sum);
  });
  let total = net.b2;
  for (let unit = 0; unit < hidden.length; unit++) total += net.w2[unit] * hidden[unit];
  return total;
}
