function clampInt16(value) {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

function buildLanczosKernel(cutoff, lobes) {
  const tableLength = lobes * 256;
  const table = new Float64Array(tableLength);
  for (let i = 0; i < tableLength; i++) {
    const x = i / 256;
    const xPi = Math.PI * x;
    const cutoffXPi = cutoff * xPi;
    if (x === 0) {
      table[i] = cutoff / Math.PI;
    } else {
      const sinc = Math.sin(cutoffXPi) / xPi;
      const lanczos = Math.sin(xPi / lobes) / (xPi / lobes);
      const window = Math.abs(x) < lobes ? 1 : 0;
      table[i] = sinc * lanczos * window;
    }
  }
  return table;
}

const LANCZOS_CACHE = {};

function getLanczosWeights(cutoff, lobes = 8) {
  const key = `${cutoff}_${lobes}`;
  if (!LANCZOS_CACHE[key]) {
    LANCZOS_CACHE[key] = buildLanczosKernel(cutoff, lobes);
  }
  return LANCZOS_CACHE[key];
}

export function resamplePcm16(input, inputRate, outputRate) {
  if (inputRate === outputRate) return input;
  if (input.length === 0) return new Int16Array(0);

  const ratio = input.length / (input.length * outputRate / inputRate);
  const outputLength = Math.round(input.length * outputRate / inputRate);
  const output = new Int16Array(outputLength);

  const cutoff = Math.min(inputRate, outputRate) / Math.max(inputRate, outputRate) * 0.45;
  const lobes = 8;
  const halfWin = lobes * 256;
  const kernelTable = getLanczosWeights(cutoff, lobes);

  for (let i = 0; i < outputLength; i++) {
    const center = i * inputRate / outputRate;
    const leftIdx = Math.floor(center);

    let sum = 0;
    let weightSum = 0;

    for (let j = -lobes; j <= lobes; j++) {
      const sampleIdx = leftIdx + j;
      if (sampleIdx < 0 || sampleIdx >= input.length) continue;

      const delta = (sampleIdx - center + lobes) * 256;
      const frac = delta - Math.floor(delta);
      const tableIdx = Math.floor(delta);

      if (tableIdx < 0 || tableIdx >= kernelTable.length - 1) continue;

      const weight = kernelTable[tableIdx] + (kernelTable[tableIdx + 1] - kernelTable[tableIdx]) * frac;
      sum += input[sampleIdx] * weight;
      weightSum += weight;
    }

    output[i] = clampInt16(weightSum > 0 ? sum / weightSum : 0);
  }

  return output;
}

export function convertSampleRate(input, inputRate, outputRate) {
  return resamplePcm16(input, inputRate, outputRate);
}
