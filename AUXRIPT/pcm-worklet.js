// pcm-worklet.js
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const frames = input[0]?.length || 0;
    if (frames === 0) return true;

    let mono;
    if (input.length === 1) {
      mono = input[0].slice(0);
    } else {
      mono = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < input.length; c++) sum += input[c][i];
        mono[i] = sum / input.length;
      }
    }
    this.port.postMessage({ type: 'pcm', samples: mono }, [mono.buffer]);
    return true;
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor);