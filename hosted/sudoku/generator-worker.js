// Builds puzzles off the main thread so the page never freezes (Extrem can take a second).
import { generate } from './logic.js';

const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

self.onmessage = (event) => {
  const { id, level } = event.data;
  self.postMessage({ id, ...generate(level, random) });
};
