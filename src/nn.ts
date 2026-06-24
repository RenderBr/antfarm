/* nn.ts — tiny evolvable feed-forward neural network.
 * Each ant carries one of these as its "brain". No backprop:
 * brains improve over generations through selection + mutation (a genetic algorithm).
 * Hidden-layer size is a random integer in [MIN_NEURONS, MAX_NEURONS], so the
 * population covers everything from minimal to highly expressive networks while
 * sharing the same 32 inputs and 9 outputs.
 */

export const N_IN = 32;   // sensory inputs (terrain, threats, super-food)
export const N_OUT = 9;   // action outputs

export const MIN_NEURONS = 18;
export const MAX_NEURONS = 300;

function randn(): number {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type Genome = Float32Array;

function genomeSize(nHid: number): number {
  return (N_IN + 1) * nHid + (nHid + 1) * N_OUT;
}

export function randomGenome(nHid?: number): Genome {
  if (nHid === undefined) {
    nHid = MIN_NEURONS + Math.floor(Math.random() * (MAX_NEURONS - MIN_NEURONS + 1));
  }
  const g = new Float32Array(genomeSize(nHid));
  for (let i = 0; i < g.length; i++) g[i] = randn() * 0.7;
  return g;
}

export function crossover(a: Genome, b: Genome): Genome {
  if (a.length !== b.length) {
    return new Float32Array(a);
  }
  const g = new Float32Array(a.length);
  const cut = (Math.random() * a.length) | 0;
  for (let i = 0; i < a.length; i++) {
    g[i] = (i < cut ? a[i] : b[i]);
    if (Math.random() < 0.15) g[i] = (g[i] + (Math.random() < 0.5 ? a[i] : b[i])) * 0.5;
  }
  return g;
}

export function mutate(g: Genome, rate: number, scale: number): Genome {
  for (let i = 0; i < g.length; i++) {
    if (Math.random() < rate) {
      g[i] += randn() * scale;
      if (g[i] > 6) g[i] = 6;
      else if (g[i] < -6) g[i] = -6;
    }
  }
  return g;
}

function tanh(x: number): number {
  if (x > 8) return 1;
  if (x < -8) return -1;
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
}

export function nHidFromGenome(len: number): number {
  return Math.round((len - N_OUT) / (N_IN + 1 + N_OUT));
}

export class Brain {
  g: Genome;
  nHid: number;
  hidden: Float32Array;
  out: Float32Array;

  constructor(genome?: Genome) {
    this.g = genome || randomGenome();
    this.nHid = nHidFromGenome(this.g.length);
    this.hidden = new Float32Array(this.nHid);
    this.out = new Float32Array(N_OUT);
  }

  forward(inp: Float32Array): Float32Array {
    const g = this.g, h = this.hidden, o = this.out;
    const nHid = this.nHid;
    let w = 0;
    for (let j = 0; j < nHid; j++) {
      let sum = g[w++];
      for (let i = 0; i < N_IN; i++) sum += g[w++] * inp[i];
      h[j] = tanh(sum);
    }
    for (let k = 0; k < N_OUT; k++) {
      let sum = g[w++];
      for (let j = 0; j < nHid; j++) sum += g[w++] * h[j];
      o[k] = tanh(sum);
    }
    return o;
  }
}