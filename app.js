// ============== STATE ==============
const els = {};
[
  'fileInput','fileName','statusMsg',
  'vg1','vg1V','vg2','vg2V','vg3','vg3V','vTotalV',
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
let voiceSrc = null;
let noiseSrc = null;

function setStatus(t, target = 'statusMsg') { els[target].textContent = t; }

function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function totalVoiceGain() {
  return parseFloat(els.vg1.value) * parseFloat(els.vg2.value) * parseFloat(els.vg3.value);
}

function updateLabels() {
  els.vg1V.textContent = els.vg1.value + 'x';
  els.vg2V.textContent = els.vg2.value + 'x';
  els.vg3V.textContent = els.vg3.value + 'x';
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

['vg1','vg2','vg3','vDist','vLow','vHigh','nVol','nBoost','nRate','nDur','nDuckAmt','nThresh','nReact','mVol']
  .forEach(id => els[id].oninput = () => { updateLabels(); if (playing) rebuildLive(); });
['nType','nDuck','mClip']
  .forEach(id => els[id].onchange = () => { if (playing) rebuildLive(); });

// ============== NOISE GENERATORS ==============

// non-machinegun noise buffer
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
  }
  return buf;
}

// machine gun noise: bang bang bang, faster than generic white
function makeMachineGunBuffer(ctx, duration, rate, shotDurMs) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  const interval = 1 / rate; // seconds between shots
  const shotDur = shotDurMs / 1000;
  const shotLen = Math.floor(sr * shotDur);

  let t = 0;
  while (t < duration) {
    const start = Math.floor(t * sr);
    if (start >= len) break;

    // each shot: sharp attack, fast decay, low thump + high crack
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

// gunshot heavy: fewer, deeper, more boom
function makeGunshotBuffer(ctx, duration, rate, shotDurMs) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  const interval = 1 / rate;
  const shotDur = (shotDurMs * 2) / 1000; // longer tail
  const shotLen = Math.floor(sr * shotDur);

  let t = 0;
  while (t < duration) {
    const start = Math.floor(t * sr);
    if (start >= len) break;

    const boomFreq = 50 + Math.random() * 50;
    const crackGain = 1.0;
    const boomGain = 1.0;

    for (let i = 0; i < shotLen && start + i < len; i++) {
      const tt = i / sr;
      const env = Math.exp(-tt * 30);
      const crack = (Math.random() * 2 - 1) * crackGain * Math.exp(-tt * 100);
      const boom = Math.sin(2 * Math.PI * boomFreq * tt) * boomGain * Math.exp(-tt * 12);
      d[start + i] += (crack + boom) * 1.1;
    }
    t += interval;
  }
  return buf;
}

// burst: rapid cluster of shots, then pause
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

// ============== CHAIN BUILD ==============
// ctx, buffer, destination
function buildChain(ctx, buffer, dest) {
  const nodes = [];

  // --- VOICE ---
  const voiceSrc = ctx.createBufferSource();
  voiceSrc.buffer = buffer;

  const vLow = ctx.createBiquadFilter();
  vLow.type = "highpass";
  vLow.frequency.value = parseFloat(els.vLow.value);
  vLow.Q.value = 0.707;

  const vHigh = ctx.createBiquadFilter();
  vHigh.type = "lowpass";
  vHigh.frequency.value = parseFloat(els.vHigh.value);
  vHigh.Q.value = 0.707;

  const vg1 = ctx.createGain(); vg1.gain.value = parseFloat(els.vg1.value);
  const vg2 = ctx.createGain(); vg2.gain.value = parseFloat(els.vg2.value);
  const vg3 = ctx.createGain(); vg3.gain.value = parseFloat(els.vg3.value);

  const vDistAmt = parseInt(els.vDist.value) / 100;
  const vDistWS = ctx.createWaveShaper();
  vDistWS.curve = makeDistCurve(vDistAmt);
  vDistWS.oversample = "4x";

  voiceSrc.connect(vLow);
  vLow.connect(vHigh);
  vHigh.connect(vg1);
  vg1.connect(vg2);
  vg2.connect(vg3);
  vg3.connect(vDistWS);
  nodes.push(voiceSrc, vLow, vHigh, vg1, vg2, vg3, vDistWS);

  const voiceOut = vDistWS;

  // --- NOISE ---
  const noiseOut = ctx.createGain();
  noiseOut.gain.value = (parseInt(els.nVol.value) / 100) * parseFloat(els.nBoost.value);
  nodes.push(noiseOut);

  const noiseType = els.nType.value;
  let noiseNode;
  if (noiseType === "machinegun") {
    const nb = makeMachineGunBuffer(ctx, buffer.duration, parseInt(els.nRate.value), parseInt(els.nDur.value));
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = nb;
  } else if (noiseType === "gunshot") {
    const nb = makeGunshotBuffer(ctx, buffer.duration, parseInt(els.nRate.value), parseInt(els.nDur.value));
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = nb;
  } else if (noiseType === "burst") {
    const nb = makeBurstBuffer(ctx, buffer.duration, parseInt(els.nDur.value));
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = nb;
  } else {
    const nb = makeNoiseBuffer(ctx, noiseType, buffer.duration);
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = nb;
    noiseNode.loop = true;
  }
  noiseNode.connect(noiseOut);
  nodes.push(noiseNode);

  // --- SIDECHAIN DUCK ---
  // If duck enabled: when voice is loud, noise volume drops
  if (els.nDuck.checked) {
    const duckGain = ctx.createGain();
    duckGain.gain.value = 1.0;
    noiseOut.disconnect();
    noiseOut.connect(duckGain);
    nodes.push(duckGain);

    // envelope follower using ScriptProcessor (portable, works in all browsers)
    const envelope = makeEnvelopeFollower(ctx, buffer, {
      thresholdDb: parseFloat(els.nThresh.value),
      duckAmount: parseInt(els.nDuckAmt.value) / 100,
      reactMs: parseInt(els.nReact.value)
    });
    envelope.connect(duckGain.gain);
    nodes.push(envelope);
    noiseOut.__duckGain = duckGain;
    noiseNode.__duckGain = duckGain;
  }

  // --- MASTER MIX ---
  const mix = ctx.createGain();
  voiceOut.connect(mix);
  if (noiseOut.__duckGain) noiseOut.__duckGain.connect(mix);
  else noiseOut.connect(mix);

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
    },
    stop: () => {
      try { voiceSrc.stop(); } catch(e){}
      try { noiseNode.stop(); } catch(e){}
    },
    voiceSrc,
    noiseNode
  };
}

// ============== SIDECHAIN ENVELOPE FOLLOWER ==============
// Returns an AudioNode whose output is a control signal (0..1) that
// DROPS when voice is loud, RISES when voice is quiet.
// Connect it to duckGain.gain.
function makeEnvelopeFollower(ctx, voiceBuffer, opts) {
  const threshLinear = Math.pow(10, opts.thresholdDb / 20);
  const duckAmount = opts.duckAmount;
  const attackSec = Math.max(0.005, opts.reactMs / 1000 * 0.5);
  const releaseSec = Math.max(0.02, opts.reactMs / 1000 * 2);

  // We need to observe the raw voice signal. But we're in an offline/live
  // graph, and the voice source already connects to the main chain.
  // Create a second copy for analysis.
  const analyserSrc = ctx.createBufferSource();
  analyserSrc.buffer = voiceBuffer;

  const analyserGain = ctx.createGain();
  analyserGain.gain.value = 0; // silent tap (won't be heard anyway - we don't connect to dest)

  analyserSrc.connect(analyserGain);

  // Use ScriptProcessor to read amplitude per sample
  const blockSize = 1024;
  const sp = ctx.createScriptProcessor(blockSize, 1, 1);

  let env = 1.0;
  let attackCoef = Math.exp(-1 / (ctx.sampleRate * attackSec));
  let releaseCoef = Math.exp(-1 / (ctx.sampleRate * releaseSec));

  sp.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);

    // run envelope over block
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      const s = Math.abs(input[i]);
      sum += s;
    }
    const avg = sum / input.length;

    const targetDuck = avg > threshLinear
      ? (1 - duckAmount) // duck down
      : 1.0;             // full noise

    // smooth env towards target
    for (let i = 0; i < output.length; i++) {
      if (targetDuck < env) env = targetDuck + (env - targetDuck) * attackCoef;
      else env = targetDuck + (env - targetDuck) * releaseCoef;
      // sp output becomes control signal (but sp output is audio-rate, we're reusing it)
      output[i] = env;
    }
  };

  analyserGain.connect(sp);
  // Must connect to something to run. Use zero-gain sink.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sp.connect(sink);
  sink.connect(ctx.destination);

  // We return a "virtual node" via a gain we control - but since we need
  // to plug into duckGain.gain, we can't just return sp because its
  // output is audio not control.
  // Simpler approach: use sp to write env into a ConstantSourceNode's offset.
  const offsetNode = ctx.createConstantSource();
  offsetNode.offset.value = 1.0;
  // Override onaudioprocess to set offset
  sp.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += Math.abs(input[i]);
    const avg = sum / input.length;

    const targetDuck = avg > threshLinear ? (1 - duckAmount) : 1.0;

    if (targetDuck < env) env = targetDuck + (env - targetDuck) * attackCoef;
    else env = targetDuck + (env - targetDuck) * releaseCoef;

    // keep output silence (so no audio leak) - control via offset
    offsetNode.offset.value = env;
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) output[i] = 0;
  };

  analyserSrc.start();
  offsetNode.start();

  return offsetNode;
}

// ============== CURVES ==============
function makeDistCurve(amount) {
  const N = 2048;
  const curve = new Float32Array(N);
  const k = 1 + amount * 30;
  if (amount === 0) {
    for (let i = 0; i < N; i++) curve[i] = (i / (N - 1)) * 2 - 1;
    return curve;
  }
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

// ============== LIVE PLAY ==============
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
  if (!audioBuffer) { setStatus("Chọn file trước đã."); return; }
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

// ============== EXPORT MP3 ==============
els.exportBtn.onclick = async () => {
  if (!audioBuffer) { setStatus("Chọn file trước.", 'exportStatus'); return; }
  if (typeof lamejs === "undefined") {
    setStatus("lame.min.js chưa load. Kiểm tra file trong repo.", 'exportStatus');
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