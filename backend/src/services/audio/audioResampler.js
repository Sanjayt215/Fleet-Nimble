export function resamplePcm16(input, inputRate, outputRate) {
  if (inputRate === outputRate) return input;
  if (input.length === 0) return new Int16Array(0);

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const idxLow = Math.floor(srcIdx);
    const idxHigh = Math.min(idxLow + 1, input.length - 1);
    const frac = srcIdx - idxLow;
    output[i] = Math.round(input[idxLow] + (input[idxHigh] - input[idxLow]) * frac);
  }

  return output;
}

export function convertSampleRate(input, inputRate, outputRate) {
  return resamplePcm16(input, inputRate, outputRate);
}
