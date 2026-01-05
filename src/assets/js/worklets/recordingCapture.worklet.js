/**
 * AudioWorklet processor for capturing audio samples for WAV recording.
 * Receives multiple channels and sends Float32 sample blocks to main thread.
 */
class RecordingCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channelCount = options.processorOptions?.channelCount || 2;
    this.isRecording = false;
    
    this.port.onmessage = (event) => {
      if (event.data.command === 'start') {
        this.isRecording = true;
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (this.isRecording && input && input.length > 0) {
      // Clone the sample data for each channel
      const channelData = [];
      for (let ch = 0; ch < this.channelCount; ch++) {
        if (input[ch]) {
          // Copy the Float32Array data
          channelData.push(new Float32Array(input[ch]));
        } else {
          // Fill with silence if channel doesn't exist
          channelData.push(new Float32Array(128));
        }
      }
      
      this.port.postMessage({
        type: 'samples',
        channels: channelData
      }, channelData.map(arr => arr.buffer));
    }
    
    return true;
  }
}

registerProcessor('recording-capture-processor', RecordingCaptureProcessor);
