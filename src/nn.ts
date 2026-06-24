/* nn.ts — tiny evolvable feed-forward neural network.
 * Each ant carries one of these as its "brain". No backprop:
 * brains improve over generations through selection + mutation (a genetic algorithm).
 */

export const N_IN = 32;   // sensory inputs (terrain, threats, super-food)
export const N_HID = 18;  // hidden neurons
export const N_OUT = 9;   // action outputs

const W1 = (N_IN + 1) * N_HID;          // input->hidden (with bias)
const W2 = (N_HID + 1) * N_OUT;         // hidden->output (with bias)
export const GENOME_SIZE = W1 + W2;

function randn(): number {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type Genome = Float32Array;

export function randomGenome(): Genome {
  const g = new Float32Array(GENOME_SIZE);
  for (let i = 0; i < g.length; i++) g[i] = randn() * 0.7;
  return g;
}

export function crossover(a: Genome, b: Genome): Genome {
  const g = new Float32Array(GENOME_SIZE);
  const cut = (Math.random() * GENOME_SIZE) | 0;
  for (let i = 0; i < GENOME_SIZE; i++) {
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

export class Brain {
  g: Genome;
  hidden: Float32Array;
  out: Float32Array;

  constructor(genome?: Genome) {
    this.g = genome || randomGenome();
    this.hidden = new Float32Array(N_HID);
    this.out = new Float32Array(N_OUT);
  }

  forward(inp: Float32Array): Float32Array {
    const g = this.g, h = this.hidden, o = this.out;
    let w = 0;
    for (let j = 0; j < N_HID; j++) {
      let sum = g[w++]; // bias
      for (let i = 0; i < N_IN; i++) sum += g[w++] * inp[i];
      h[j] = tanh(sum);
    }
    for (let k = 0; k < N_OUT; k++) {
      let sum = g[w++]; // bias
      for (let j = 0; j < N_HID; j++) sum += g[w++] * h[j];
      o[k] = tanh(sum);
    }
    return o;
  }
}