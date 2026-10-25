// ============== STATE ==============
const els = {};
[
  'fileInput','fileName','statusMsg',
  'vg1','vg1V','vg2','vg2V','vg3','vg3V','vg4','vg4V','vg5','vg5V','vTotalV',
  'vDist','vDistV','vLow','vLowV','vHigh','vHighV',
  'nType','nVol','nVolV','nBoost','nBoostV','nRate','nRateV','nDur','nDurV',
  'nDuck','nDuckAmt','nDuckAmtV','nThresh','nThreshV','nReact','nReactV',
  'mVol','mVolV','mClip',
  'playBtn','stopBtn','mp3Q','exportBtn','exportStatus'
].forEach(id => els[id] = document.getElementById(id));

let audioCtx = null;
let audioBuffer = null;
let playing = false;
let liveNodes = [];

function setStatus(t, target = 'statusMsg') { els[target].textContent = t; }

function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function totalVoiceGain() {
  return parseFloat(els.vg1.value) * parseFloat(els.vg2.value) *
         parseFloat(els.vg3.value) * parseFloat(els.vg4.value) *
         parseFloat(els.vg5.value);
}

function updateLabels() {
  els.vg1V.textContent = els.vg1.value + 'x';
  els.vg2V.textContent = els.vg2.value + 'x';
  els.vg3V.textContent = els.vg3.value + 'x';
  els.vg4V.textContent = els.vg4.value + 'x';
  els.vg5V.textContent = els.vg5.value + 'x';
  els.vTotalV.textContent = totalVoiceGain().toLocaleString() + 'x';
  els.vDistV.textContent = els.vDist.value + '%';
  els.vLowV.textContent = els.vLow.value + ' Hz';
  els.vHighV.textContent = els.vHigh.value + ' Hz';
  els.nVolV.textContent = els.nVol.value + '%';
  els.nBoostV.textContent = els.nBoost.value + 'x';
  els.nRateV.textContent = els.nRate.value + '/s';
  els.nDurV.textContent = els.nDur.value + 'ms';
  els.nDuckAmtV.textContent = els.nDuckAmt.value + '%';
  els.nThreshV.textContent = els.nThresh.value + ' dB';
  els.nReactV.textContent = els.nReact.value + ' ms';
  els.mVolV.textContent = els.mVol.value + '%';
}

['vg1','vg2','vg3','vg4','vg5','vDist','vLow','vHigh','nVol','nBoost','nRate','nDur','nDuckAmt','nThresh','nReact','mVol']
  .forEach(id => els[id].oninput = () => { updateLabels(); if (playing) rebuildLive(); });
['nType','nDuck','mClip']
  .forEach(id => els[id].onchange = () => { if (playing) rebuildLive(); });

// ============== NOISE GENERATORS ==============
function makeNoiseBuffer(ctx, type, duration) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  } else if (type === 'blue') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      const v = w - last;
      last = w;
      d[i] = v * 0.5;
    }
  } else if (type === 'violet') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      const v = w - last;
      last = w;
      d[i] = v * 0.9;
    }
  } else if (type === 'hum50' || type === 'hum60') {
    const f = type === 'hum50' ? 50 : 60;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = Math.sin(2*Math.PI*f*t) * 0.5
           + Math.sin(2*Math.PI*f*2*t) * 0.25
           + Math.sin(2*Math.PI*f*3*t) * 0.12;
    }
  } else if (type === 'crackle') {
    for (let i = 0; i < len; i++) {
      d[i] = 0;
      if (Math.random() < 0.001) {
        const amp = Math.random() * 2 - 1;
        const decay = 20 + Math.floor(Math.random() * 60);
        for (let j = 0; j < decay && i+j < len; j++) {
          d[i+j] += amp * Math.exp(-j / 5) * 0.7;
        }
      }
    }
  } else if (type === 'vinyl') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      let v = last * 0.8;
      if (Math.random() < 0.0003) v += (Math.random() * 2 - 1) * 0.6;
      d[i] = v;
    }
  } else if (type === 'tapehiss') {
    let hp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      hp = w - prev * 0.9;
      prev = w;
      d[i] = hp * 0.15;
    }
  } else if (type === 'radio') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.4 + w * 0.6;
      let v = last * 0.6;
      if (Math.random() < 0.002) v = 0;
      d[i] = v;
    }
  } else if (type === 'glitch') {
    for (let i = 0; i < len; i += 128) {
      const burst = Math.random() < 0.05;
      for (let j = 0; j < 128 && i+j < len; j++) {
        d[i+j] = burst
          ? (Math.random() * 2 - 1) * (Math.random() < 0.5 ? 1 : 0)
          : (Math.random() * 2 - 1) * 0.1;
      }
    }
  } else if (type === 'dropout') {
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.05;
    let i = 0;
    while (i < len) {
      const gapLen = Math.floor(sr * (0.02 + Math.random() * 0.1));
      for (let j = 0; j < gapLen && i+j < len; j++) d[i+j] = 0;
      i += gapLen + Math.floor(sr * (0.1 + Math.random() * 0.3));
    }
  } else if (type === 'engine') {
    // engine rumble: low freq thump + irregular sputter + mid noise
    let phase1 = 0, phase2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // base firing rate wobbles between 60-140Hz
      const f = 60 + 40 * Math.sin(t * 0.7) + 20 * Math.sin(t * 2.3);
      phase1 += (2 * Math.PI * f) / sr;
      phase2 += (2 * Math.PI * f * 0.5) / sr;
      const thump = Math.sin(phase1) * 0.5 + Math.sin(phase2) * 0.3;
      const sputter = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 0.8 : 0;
      const mid = (Math.random() * 2 - 1) * 0.15;
      const env = 0.7 + 0.3 * Math.sin(t * 1.3);
      d[i] = (thump * env + sputter + mid) * 0.9;
    }
  } else if (type === 'taser') {
    // taser: high-voltage zap with rapid pulses and crackle
    for (let i = 0; i < len; i++) d[i] = 0;
    let i = 0;
    while (i < len) {
      // zap burst: 40-120ms of very high freq oscillation + dense crackle
      const burstLen = Math.floor(sr * (0.04 + Math.random() * 0.08));
      const burstAmp = 0.6 + Math.random() * 0.4;
      const buzzFreq = 1800 + Math.random() * 800;
      for (let j = 0; j < burstLen && i + j < len; j++) {
        const tt = j / sr;
        const env = Math.min(1, j / 50) * Math.exp(-tt * 15);
        const buzz = Math.sign(Math.sin(2 * Math.PI * buzzFreq * tt)) * 0.5;
        const crack = (Math.random() * 2 - 1) * 0.7;
        d[i + j] += (buzz + crack) * burstAmp * env;
      }
      // pause between zaps
      i += burstLen + Math.floor(sr * (0.05 + Math.random() * 0.25));
    }
  }
  return buf;
}

function makeMachineGunBuffer(ctx, duration, rate, shotDurMs) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const interval = 1 / rate;
  const shotDur = shotDurMs / 1000;
  const shotLen = Math.floor(sr * shotDur);

  let t = 0;
  while (t < duration) {
    const start = Math.floor(t * sr);
    if (start >= len) break;
    const startFreq = 80 + Math.random() * 120;
    const crackGain = 0.7 + Math.random() * 0.3;
    const thumpGain = 0.5 + Math.random() * 0.3;
    for (let i = 0; i < shotLen && start + i < len; i++) {
      const tt = i / sr;
      const env = Math.exp(-tt * (60 + Math.random() * 20));
      const crack = (Math.random() * 2 - 1) * crackGain * env;
      const thump = Math.sin(2 * Math.PI * startFreq * tt) * thumpGain * Math.exp(-tt * 25);
      const small = Math.sin(2 * Math.PI * 1500 * tt) * 0.2 * env;
      d[start + i] += (crack + thump + small) * 0.9;
    }
    t += interval;
  }
  return buf;
}

function makeGunshotBuffer(ctx, duration, rate, shotDurMs) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const interval = 1 / rate;
  const shotDur = (shotDurMs * 2) / 1000;
  const shotLen = Math.floor(sr * shotDur);
  let t = 0;
  while (t < duration) {
    const start = Math.floor(t * sr);
    if (start >= len) break;
    const boomFreq = 50 + Math.random() * 50;
    for (let i = 0; i < shotLen && start + i < len; i++) {
      const tt = i / sr;
      const crack = (Math.random() * 2 - 1) * Math.exp(-tt * 100);
      const boom = Math.sin(2 * Math.PI * boomFreq * tt) * Math.exp(-tt * 12);
      d[start + i] += (crack + boom) * 1.1;
    }
    t += interval;
  }
  return buf;
}

function makeBurstBuffer(ctx, duration, shotDurMs) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const shotDur = shotDurMs / 1000;
  const shotLen = Math.floor(sr * shotDur);
  let t = 0.1;
  while (t < duration) {
    const clusterSize = 5 + Math.floor(Math.random() * 8);
    const clusterRate = 20 + Math.random() * 20;
    for (let c = 0; c < clusterSize; c++) {
      const start = Math.floor(t * sr);
      if (start >= len) break;
      const boomFreq = 80 + Math.random() * 100;
      for (let i = 0; i < shotLen && start + i < len; i++) {
        const tt = i / sr;
        const env = Math.exp(-tt * 80);
        const crack = (Math.random() * 2 - 1) * env;
        const thump = Math.sin(2 * Math.PI * boomFreq * tt) * env * 0.6;
        d[start + i] += (crack + thump);
      }
      t += 1 / clusterRate;
    }
    t += 0.5 + Math.random() * 1.5;
  }
  return buf;
}

// ============== ENVELOPE FOLLOWER (duck) ==============
// Uses ScriptProcessor for portability. Output: ConstantSourceNode whose
// offset tracks 1.0 (loud) -> (1-duckAmount) (ducked) based on voice level.
function makeSidechainControl(ctx, voiceBuffer, opts) {
  const threshLinear = Math.pow(10, opts.thresholdDb / 20);
  const duckAmount = opts.duckAmount;
  const attackSec = Math.max(0.005, (opts.reactMs / 1000) * 0.5);
  const releaseSec = Math.max(0.02, (opts.reactMs / 1000) * 2);

  // read voice RMS via ScriptProcessor (feed a COPY of the buffer in)
  const analyserSrc = ctx.createBufferSource();
  analyserSrc.buffer = voiceBuffer;

  const preGain = ctx.createGain();
  preGain.gain.value = 1.0; // match main chain's pre-gain approx (doesn't matter for relative RMS)

  analyserSrc.connect(preGain);

  const blockSize = 1024;
  const sp = ctx.createScriptProcessor(blockSize, 1, 1);

  const ctrl = ctx.createConstantSource();
  ctrl.offset.value = 1.0;

  let env = 1.0;

  sp.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    // RMS
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);

    const target = rms > threshLinear ? (1 - duckAmount) : 1.0;

    // smooth
    const coef = target < env ? attackSec : releaseSec;
    const s = 1 - Math.exp(-1 / (ctx.sampleRate * coef));
    for (let i = 0; i < input.length; i++) {
      env += (target - env) * s;
    }
    ctrl.offset.value = env;

    // silence output
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) out[i] = 0;
  };

  preGain.connect(sp);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sp.connect(sink);
  sink.connect(ctx.destination);

  return {
    node: ctrl,
    start: () => { analyserSrc.start(); ctrl.start(); },
    stop: () => { try { analyserSrc.stop(); } catch(e){} try { ctrl.stop(); } catch(e){} },
    _nodes: [analyserSrc, preGain, sp, sink, ctrl]
  };
}

// ============== CHAIN ==============
function buildChain(ctx, buffer, dest) {
  const nodes = [];
  const extraSources = [];

  // ---- VOICE ----
  const voiceSrc = ctx.createBufferSource();
  voiceSrc.buffer = buffer;

  const vLow = ctx.createBiquadFilter();
  vLow.type = "highpass"; vLow.frequency.value = parseFloat(els.vLow.value); vLow.Q.value = 0.707;

  const vHigh = ctx.createBiquadFilter();
  vHigh.type = "lowpass"; vHigh.frequency.value = parseFloat(els.vHigh.value); vHigh.Q.value = 0.707;

  const vg1 = ctx.createGain(); vg1.gain.value = parseFloat(els.vg1.value);
  const vg2 = ctx.createGain(); vg2.gain.value = parseFloat(els.vg2.value);
  const vg3 = ctx.createGain(); vg3.gain.value = parseFloat(els.vg3.value);
  const vg4 = ctx.createGain(); vg4.gain.value = parseFloat(els.vg4.value);
  const vg5 = ctx.createGain(); vg5.gain.value = parseFloat(els.vg5.value);

  const vDistWS = ctx.createWaveShaper();
  vDistWS.curve = makeDistCurve(parseInt(els.vDist.value) / 100);
  vDistWS.oversample = "4x";

  // voice chain: src -> HP -> LP -> g1 -> g2 -> g3 -> g4 -> g5 -> dist
  voiceSrc.connect(vLow);
  vLow.connect(vHigh);
  vHigh.connect(vg1);
  vg1.connect(vg2);
  vg2.connect(vg3);
  vg3.connect(vg4);
  vg4.connect(vg5);
  vg5.connect(vDistWS);
  nodes.push(voiceSrc, vLow, vHigh, vg1, vg2, vg3, vg4, vg5, vDistWS);
  const voiceOut = vDistWS;

  // ---- NOISE ----
  const noiseType = els.nType.value;
  let noiseNode;
  if (noiseType === "machinegun") {
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = makeMachineGunBuffer(ctx, buffer.duration, parseInt(els.nRate.value), parseInt(els.nDur.value));
  } else if (noiseType === "gunshot") {
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = makeGunshotBuffer(ctx, buffer.duration, parseInt(els.nRate.value), parseInt(els.nDur.value));
  } else if (noiseType === "burst") {
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = makeBurstBuffer(ctx, buffer.duration, parseInt(els.nDur.value));
  } else {
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = makeNoiseBuffer(ctx, noiseType, buffer.duration);
    noiseNode.loop = true;
  }

  const nVolGain = ctx.createGain();
  nVolGain.gain.value = (parseInt(els.nVol.value) / 100) * parseFloat(els.nBoost.value);

  noiseNode.connect(nVolGain);
  nodes.push(noiseNode, nVolGain);

  let noiseOut = nVolGain;

  // ---- SIDECHAIN DUCK ----
  if (els.nDuck.checked) {
    const duck = ctx.createGain();
    duck.gain.value = 1.0;
    nVolGain.connect(duck);

    const sc = makeSidechainControl(ctx, buffer, {
      thresholdDb: parseFloat(els.nThresh.value),
      duckAmount: parseInt(els.nDuckAmt.value) / 100,
      reactMs: parseInt(els.nReact.value)
    });
    sc.node.connect(duck.gain);
    extraSources.push(sc);

    nodes.push(duck);
    noiseOut = duck;
  }

  // ---- MASTER ----
  const mix = ctx.createGain();
  voiceOut.connect(mix);
  noiseOut.connect(mix);

  const masterGain = ctx.createGain();
  masterGain.gain.value = parseInt(els.mVol.value) / 100;

  if (els.mClip.checked) {
    const clipWS = ctx.createWaveShaper();
    clipWS.curve = makeClipCurve(1);
    clipWS.oversample = "none";
    mix.connect(clipWS);
    clipWS.connect(masterGain);
    nodes.push(clipWS);
  } else {
    mix.connect(masterGain);
  }
  masterGain.connect(dest);
  nodes.push(mix, masterGain);

  return {
    nodes,
    start: (when = 0) => {
      voiceSrc.start(when);
      noiseNode.start(when);
      extraSources.forEach(s => s.start());
    },
    stop: () => {
      try { voiceSrc.stop(); } catch(e){}
      try { noiseNode.stop(); } catch(e){}
      extraSources.forEach(s => s.stop());
    },
    voiceSrc,
    noiseNode
  };
}

// ============== CURVES ==============
function makeDistCurve(amount) {
  const N = 2048;
  const curve = new Float32Array(N);
  if (amount === 0) {
    for (let i = 0; i < N; i++) curve[i] = (i / (N - 1)) * 2 - 1;
    return curve;
  }
  const k = 1 + amount * 30;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function makeClipCurve(amount) {
  const N = 2048;
  const curve = new Float32Array(N);
  const thr = 1 - amount * 0.99;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.max(-thr, Math.min(thr, x)) / thr;
  }
  return curve;
}

// ============== LIVE ==============
function cleanupLive() {
  liveNodes.forEach(n => { try { n.disconnect(); } catch(e){} });
  liveNodes = [];
  playing = false;
}

function rebuildLive() {
  if (!audioBuffer) return;
  cleanupLive();
  const ctx = ensureCtx();
  const chain = buildChain(ctx, audioBuffer, ctx.destination);
  chain.start();
  liveNodes = chain.nodes;
  playing = true;
  chain.voiceSrc.onended = () => { playing = false; };
}

els.playBtn.onclick = () => {
  if (!audioBuffer) { setStatus("Chọn file trước."); return; }
  rebuildLive();
  setStatus("Đang phát...");
};

els.stopBtn.onclick = () => {
  cleanupLive();
  setStatus("Đã dừng.");
};

els.fileInput.onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  els.fileName.textContent = f.name + " (" + (f.size/1024).toFixed(1) + " KB)";
  setStatus("Đang decode...");
  try {
    const arr = await f.arrayBuffer();
    const ctx = ensureCtx();
    audioBuffer = await ctx.decodeAudioData(arr);
    setStatus("Load xong: " + audioBuffer.duration.toFixed(1) + "s, " +
      audioBuffer.sampleRate + "Hz, " + audioBuffer.numberOfChannels + "ch");
  } catch (err) {
    setStatus("Lỗi decode: " + err.message);
  }
};

// ============== EXPORT ==============
els.exportBtn.onclick = async () => {
  if (!audioBuffer) { setStatus("Chọn file trước.", 'exportStatus'); return; }
  if (typeof lamejs === "undefined") {
    setStatus("lame.min.js chưa load.", 'exportStatus');
    return;
  }

  els.exportBtn.disabled = true;
  setStatus("Render offline...", 'exportStatus');

  try {
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const chCount = Math.min(2, audioBuffer.numberOfChannels);

    const off = new OfflineAudioContext(chCount, len, sr);
    const chain = buildChain(off, audioBuffer, off.destination);
    chain.start(0);

    const rendered = await off.startRendering();

    setStatus("Encode MP3...", 'exportStatus');

    const bitrate = parseInt(els.mp3Q.value, 10) * 1000;
    const left = floatTo16(rendered.getChannelData(0));
    const right = rendered.numberOfChannels > 1 ? floatTo16(rendered.getChannelData(1)) : left;

    const enc = new lamejs.Mp3Encoder(rendered.numberOfChannels > 1 ? 2 : 1, rendered.sampleRate, bitrate);

    const chunk = 1152;
    const chunks = [];
    for (let i = 0; i < left.length; i += chunk) {
      const l = left.subarray(i, i + chunk);
      const r = right.subarray(i, i + chunk);
      const buf = rendered.numberOfChannels > 1
        ? enc.encodeBuffer(l, r)
        : enc.encodeBuffer(l);
      if (buf.length > 0) chunks.push(new Uint8Array(buf));
    }
    const tail = enc.flush();
    if (tail.length > 0) chunks.push(new Uint8Array(tail));

    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "noise_engine_" + Date.now() + ".mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);

    setStatus("✅ Xong: " + (blob.size / 1024).toFixed(1) + " KB", 'exportStatus');
  } catch (err) {
    setStatus("❌ Lỗi: " + err.message, 'exportStatus');
    console.error(err);
  } finally {
    els.exportBtn.disabled = false;
  }
};

function floatTo16(arr) {
  const out = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = arr[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

updateLabels();
