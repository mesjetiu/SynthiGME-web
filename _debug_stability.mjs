// Compare: current (unstable) vs per-stage tanh (stable OTA model)
const SR = 48000;
const DUR = 2.0;
const N = Math.floor(SR * DUR);

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function cutoffHz(cd) { return clamp(320 * Math.pow(2, cd * 4.0 / 0.55), 3, 20000); }
function fb(dial) {
  const v = clamp(dial, 0, 10);
  return v <= 5.5 ? (v / 5.5) * 3.82 : 3.82 + ((v - 5.5) / 4.5) * 0.55;
}

// Current model: tanh only at input
function runCurrent(input, ctrl, resp) {
  const feedbackBase = fb(resp);
  const st = { in1:0,in2:0,in3:0,in4:0,out1:0,out2:0,out3:0,out4:0 };
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const hz = cutoffHz(ctrl);
    let f = clamp((hz / SR) * 1.16, 0.0001, 0.98);
    const feedback = feedbackBase * (1 - 0.15 * f * f);
    const inputSample = input[i] + (Math.random() * 2 - 1) * 0.001;
    const rd = 1 + (feedbackBase / 4.37) * 1.4;
    let x = Math.tanh(inputSample * rd);
    x -= st.out4 * feedback;
    x *= 0.35013 * f * f * f * f;
    st.out1 = x + 0.3 * st.in1 + (1 - f) * st.out1; st.in1 = x;
    st.out2 = st.out1 + 0.3 * st.in2 + (1 - f) * st.out2; st.in2 = st.out1;
    st.out3 = st.out2 + 0.3 * st.in3 + (1 - f) * st.out3; st.in3 = st.out2;
    st.out4 = st.out3 + 0.3 * st.in4 + (1 - f) * st.out4; st.in4 = st.out3;
    out[i] = Math.tanh(st.out4 * 1.15);
  }
  return out;
}

// New model: tanh after each integrator (OTA saturation per stage)
function runPerStage(input, ctrl, resp) {
  const feedbackBase = fb(resp);
  const st = { in1:0,in2:0,in3:0,in4:0,out1:0,out2:0,out3:0,out4:0 };
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const hz = cutoffHz(ctrl);
    let f = clamp((hz / SR) * 1.16, 0.0001, 0.98);
    const feedback = feedbackBase * (1 - 0.15 * f * f);
    const inputSample = input[i] + (Math.random() * 2 - 1) * 0.001;
    const rd = 1 + (feedbackBase / 4.37) * 1.4;
    let x = Math.tanh(inputSample * rd);
    x -= st.out4 * feedback;
    x *= 0.35013 * f * f * f * f;
    // Per-stage OTA saturation
    st.out1 = Math.tanh(x + 0.3 * st.in1 + (1 - f) * st.out1); st.in1 = x;
    st.out2 = Math.tanh(st.out1 + 0.3 * st.in2 + (1 - f) * st.out2); st.in2 = st.out1;
    st.out3 = Math.tanh(st.out2 + 0.3 * st.in3 + (1 - f) * st.out3); st.in3 = st.out2;
    st.out4 = Math.tanh(st.out3 + 0.3 * st.in4 + (1 - f) * st.out4); st.in4 = st.out3;
    out[i] = st.out4;  // already limited by tanh in last stage
  }
  return out;
}

function analyze(arr, label, startFrac = 0.25) {
  const s = Math.floor(arr.length * startFrac);
  const len = arr.length - s;
  let rms = 0, peak = 0, min = Infinity, max = -Infinity;
  for (let i = s; i < arr.length; i++) {
    rms += arr[i] * arr[i];
    const a = Math.abs(arr[i]);
    if (a > peak) peak = a;
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  rms = Math.sqrt(rms / len);
  const dB = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '-inf';

  // Measure amplitude stability: split into 10 segments, check RMS variance
  const segLen = Math.floor(len / 10);
  const segRms = [];
  for (let seg = 0; seg < 10; seg++) {
    let sr = 0;
    for (let j = 0; j < segLen; j++) {
      const v = arr[s + seg * segLen + j];
      sr += v * v;
    }
    segRms.push(Math.sqrt(sr / segLen));
  }
  const meanRms = segRms.reduce((a, b) => a + b) / segRms.length;
  const variance = segRms.reduce((a, b) => a + (b - meanRms) ** 2, 0) / segRms.length;
  const stability = meanRms > 0 ? (Math.sqrt(variance) / meanRms * 100).toFixed(1) : '0.0';

  console.log(`  ${label}: Peak=${peak.toFixed(4)}, RMS=${dB}dB, StabilityCV=${stability}%`);
}

const silence = new Float64Array(N);
const saw440 = new Float64Array(N);
for (let i = 0; i < N; i++) saw440[i] = 0.5 * (2 * ((i * 440 / SR) % 1) - 1);

console.log('=== SILENCE, self-oscillation stability ===');
for (const r of [7, 8, 9, 10]) {
  console.log(`--- Response=${r} ---`);
  analyze(runCurrent(silence, 0, r), 'CURRENT');
  analyze(runPerStage(silence, 0, r), 'PER-STAGE');
}

console.log('\n=== Q bajo (resp=0), silencio: no debería oirse ===');
analyze(runCurrent(silence, 0, 0), 'CURRENT');
analyze(runPerStage(silence, 0, 0), 'PER-STAGE');

console.log('\n=== Filtrado SAW 440Hz, cutoff 320Hz ===');
console.log('--- Response=0 ---');
analyze(runCurrent(saw440, 0, 0), 'CURRENT');
analyze(runPerStage(saw440, 0, 0), 'PER-STAGE');
console.log('--- Response=5 ---');
analyze(runCurrent(saw440, 0, 5), 'CURRENT');
analyze(runPerStage(saw440, 0, 5), 'PER-STAGE');
console.log('--- Response=8 ---');
analyze(runCurrent(saw440, 0, 8), 'CURRENT');
analyze(runPerStage(saw440, 0, 8), 'PER-STAGE');

console.log('\n=== Filtrado SAW 440Hz, cutoff ALTO (3979Hz), resp=0 ===');
analyze(runCurrent(saw440, 0.5, 0), 'CURRENT');
analyze(runPerStage(saw440, 0.5, 0), 'PER-STAGE');
