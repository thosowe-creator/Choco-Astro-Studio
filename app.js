const els = {
  fileInput: document.getElementById('fileInput'),
  fileMeta: document.getElementById('fileMeta'),
  canvas: document.getElementById('imageCanvas'),
  stage: document.getElementById('dropZone'),
  emptyState: document.getElementById('emptyState'),
  histogram: document.getElementById('histogramCanvas'),
  clipInfo: document.getElementById('clipInfo'),
  resetBtn: document.getElementById('resetBtn'),
  exportPngBtn: document.getElementById('exportPngBtn'),
  exportJpegBtn: document.getElementById('exportJpegBtn'),
  blackPoint: document.getElementById('blackPoint'),
  midtone: document.getElementById('midtone'),
  whitePoint: document.getElementById('whitePoint'),
  showMask: document.getElementById('showMask'),
  invertMask: document.getElementById('invertMask'),
  maskFeather: document.getElementById('maskFeather'),
  autoTargetBtn: document.getElementById('autoTargetBtn'),
  autoBgBtn: document.getElementById('autoBgBtn'),
  autoStarsBtn: document.getElementById('autoStarsBtn'),
  zoomLabel: document.getElementById('zoomLabel'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  fitBtn: document.getElementById('fitBtn'),
  viewEdited: document.getElementById('viewEdited'),
  viewOriginal: document.getElementById('viewOriginal'),
  viewCompare: document.getElementById('viewCompare'),
};

const ctx = els.canvas.getContext('2d', { willReadFrequently: true });
const hctx = els.histogram.getContext('2d');

const state = {
  file: null,
  image: null,
  original: null,
  sourceWidth: 0,
  sourceHeight: 0,
  sourceInfo: null,
  edited: null,
  w: 0,
  h: 0,
  scale: 1,
  view: 'edited',
  activeMask: 'none',
  masks: { target: null, background: null, stars: null },
  userHint: null,
  dragStart: null,
  dragRect: null,
  adjustments: defaultAdjustments(),
  locals: defaultLocals(),
  renderQueued: false,
  renderTimer: null,
};

const MAX_PROCESSING_PIXELS = 2600000;
const HISTOGRAM_SAMPLE_PIXELS = 350000;

function defaultAdjustments() {
  return {
    exposure: 0,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    vibrance: 0,
    gamma: 1,
    autoStretch: 0,
    backgroundDarken: 0,
    backgroundNeutral: 0,
    gradientReduce: 0,
    starReduction: 0,
    clarity: 0,
    denoise: 0,
    haAccent: 0,
  };
}

function defaultLocals() {
  return {
    localBrightness: 0,
    localContrast: 1,
    localSaturation: 1,
    localClarity: 0,
  };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function lerp(a, b, t) { return a + (b - a) * t; }

function scheduleRender(delay = 45) {
  if (!state.original) return;
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderImage();
    });
  }, delay);
}

els.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) await loadFile(file);
});

['dragenter', 'dragover'].forEach(type => {
  els.stage.addEventListener(type, e => {
    e.preventDefault();
    els.stage.style.outline = '3px solid rgba(245,158,76,.34)';
  });
});
['dragleave', 'drop'].forEach(type => {
  els.stage.addEventListener(type, e => {
    e.preventDefault();
    els.stage.style.outline = '';
  });
});
els.stage.addEventListener('drop', async (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) await loadFile(file);
});

async function loadFile(file) {
  const lower = file.name.toLowerCase();
  resetAll(true);
  state.file = file;

  try {
    let imageData;
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
      imageData = await loadTiff(file);
    } else {
      imageData = await loadBrowserImage(file);
    }
    const prepared = prepareProcessingImage(imageData);
    state.original = prepared.imageData;
    state.edited = new ImageData(new Uint8ClampedArray(prepared.imageData.data), prepared.imageData.width, prepared.imageData.height);
    state.sourceWidth = imageData.width;
    state.sourceHeight = imageData.height;
    state.sourceInfo = { ...(imageData.info || {}), previewScale: prepared.scale };
    state.w = prepared.imageData.width;
    state.h = prepared.imageData.height;
    els.canvas.width = state.w;
    els.canvas.height = state.h;
    els.emptyState.style.display = 'none';
    fitToStage();
    updateMeta(file);
    renderImage();
  } catch (err) {
    console.error(err);
    alert(`이미지를 읽지 못했습니다. ${err.message || 'TIFF 압축/비트 심도/메모리 제한을 확인해주세요.'}`);
  }
}

function loadBrowserImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      cctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const imageData = cctx.getImageData(0, 0, c.width, c.height);
      imageData.info = { bitDepth: 8, sourceType: 'browser' };
      resolve(imageData);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function loadTiff(file) {
  if (!window.UTIF) throw new Error('TIFF 디코더를 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단 여부를 확인해주세요.');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('TIFF 페이지를 찾지 못했습니다.');
  const ifd = ifds[0];
  UTIF.decodeImage(buf, ifd);

  const normalized = decodeTiffToDisplayImage(ifd, buf);
  if (normalized) return normalized;

  const rgba = UTIF.toRGBA8(ifd);
  const imageData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
  imageData.info = {
    bitDepth: normalizeTagArray(ifd.t258)[0] || 8,
    sourceType: 'utif-rgba8',
    warning: 'TIFF 원본 샘플을 직접 해석하지 못해 UTIF 8-bit 변환을 사용했습니다.',
  };
  return imageData;
}

function decodeTiffToDisplayImage(ifd, buf) {
  const w = ifd.width || ifd.t256;
  const h = ifd.height || ifd.t257;
  const bytes = ifd.data;
  if (!w || !h || !bytes) return null;

  const bits = normalizeTagArray(ifd.t258);
  const samples = Number(ifd.t277 || bits.length || 1);
  const sampleBits = bits[0] || 8;
  const sampleFormat = normalizeTagArray(ifd.t339)[0] || 1;
  const planar = Number(ifd.t284 || 1);
  if (![8, 16, 32].includes(sampleBits) || planar !== 1 || samples < 1) return null;

  const littleEndian = detectTiffEndian(buf);
  const bytesPerSample = sampleBits / 8;
  const expected = w * h * samples * bytesPerSample;
  if (bytes.length < Math.min(expected, w * h * bytesPerSample)) return null;

  const photometric = Number(ifd.t262 || 2);
  const readSample = createTiffSampleReader(bytes, sampleBits, sampleFormat, littleEndian);
  const read = (pixel, channel) => readSample((pixel * samples + Math.min(channel, samples - 1)) * bytesPerSample);
  const hasRgb = samples >= 3 && photometric !== 0 && photometric !== 1;
  const pixelCount = w * h;
  const sampleStep = Math.max(1, Math.floor(pixelCount / 180000));
  const lumSamples = [];

  for (let p = 0; p < pixelCount; p += sampleStep) {
    const r = read(p, 0);
    const g = hasRgb ? read(p, 1) : r;
    const b = hasRgb ? read(p, 2) : r;
    const l = luminance(r, g, b);
    if (Number.isFinite(l)) lumSamples.push(l);
  }
  if (lumSamples.length < 16) return null;
  lumSamples.sort((a, b) => a - b);
  let black = percentileSorted(lumSamples, 0.0015);
  let white = percentileSorted(lumSamples, 0.9985);
  if (!(white > black)) {
    black = lumSamples[0];
    white = lumSamples[lumSamples.length - 1] || 1;
  }
  const range = Math.max(white - black, Number.EPSILON);
  const out = new Uint8ClampedArray(pixelCount * 4);
  const invert = photometric === 0;

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    let r = read(p, 0);
    let g = hasRgb ? read(p, 1) : r;
    let b = hasRgb ? read(p, 2) : r;
    if (invert) { r = white - (r - black); g = white - (g - black); b = white - (b - black); }
    out[i] = toneMapPreview(r, black, range);
    out[i + 1] = toneMapPreview(g, black, range);
    out[i + 2] = toneMapPreview(b, black, range);
    out[i + 3] = samples >= 4 ? clamp255(read(p, 3) * 255) : 255;
  }

  const imageData = new ImageData(out, w, h);
  imageData.info = {
    bitDepth: sampleBits,
    sampleFormat,
    samples,
    sourceType: 'normalized-tiff',
    black,
    white,
  };
  return imageData;
}

function normalizeTagArray(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (value && typeof value.length === 'number') return Array.from(value, Number);
  return value == null ? [] : [Number(value)];
}

function detectTiffEndian(buf) {
  const sig = new Uint8Array(buf, 0, 2);
  return sig[0] === 0x49 && sig[1] === 0x49;
}

function createTiffSampleReader(bytes, bits, format, littleEndian) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (offset) => {
    if (offset < 0 || offset >= bytes.length) return 0;
    if (bits === 8) return bytes[offset] / 255;
    if (bits === 16) {
      const v = format === 2 ? view.getInt16(offset, littleEndian) : view.getUint16(offset, littleEndian);
      return format === 2 ? (v + 32768) / 65535 : v / 65535;
    }
    if (bits === 32 && format === 3) return view.getFloat32(offset, littleEndian);
    const v = format === 2 ? view.getInt32(offset, littleEndian) : view.getUint32(offset, littleEndian);
    return format === 2 ? (v + 2147483648) / 4294967295 : v / 4294967295;
  };
}

function percentileSorted(values, p) {
  return values[clampIndex(Math.floor(values.length * p), values.length)];
}

function toneMapPreview(value, black, range) {
  const x = clamp01((value - black) / range);
  const stretched = Math.asinh(x * 10) / Math.asinh(10);
  return clamp255(Math.pow(stretched, 0.82) * 255);
}

function prepareProcessingImage(imageData) {
  const pixels = imageData.width * imageData.height;
  if (pixels <= MAX_PROCESSING_PIXELS) return { imageData, scale: 1 };
  const scale = Math.sqrt(MAX_PROCESSING_PIXELS / pixels);
  return { imageData: resizeImageData(imageData, scale), scale };
}

function resizeImageData(imageData, scale) {
  const w = Math.max(1, Math.round(imageData.width * scale));
  const h = Math.max(1, Math.round(imageData.height * scale));
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  const cctx = c.getContext('2d');
  cctx.putImageData(imageData, 0, 0);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(c, 0, 0, w, h);
  const resized = octx.getImageData(0, 0, w, h);
  resized.info = imageData.info;
  return resized;
}

function updateMeta(file) {
  const info = state.sourceInfo || {};
  const bitDepth = info.bitDepth ? `${info.bitDepth}-bit` : '8-bit';
  const preview = info.previewScale && info.previewScale < 1
    ? `${state.w} × ${state.h} 미리보기 (${Math.round(info.previewScale * 100)}%)`
    : `${state.w} × ${state.h}`;
  const warning = info.warning ? `<p class="meta-warning">${escapeHtml(info.warning)}</p>` : '';
  els.fileMeta.innerHTML = `
    <dl>
      <dt>이름</dt><dd title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</dd>
      <dt>포맷</dt><dd>${escapeHtml(file.type || file.name.split('.').pop()?.toUpperCase() || 'unknown')}</dd>
      <dt>원본</dt><dd>${state.sourceWidth} × ${state.sourceHeight}</dd>
      <dt>작업</dt><dd>${preview}</dd>
      <dt>비트</dt><dd>${escapeHtml(bitDepth)} · ${escapeHtml(info.sourceType || 'browser')}</dd>
      <dt>용량</dt><dd>${(file.size / 1024 / 1024).toFixed(2)} MB</dd>
    </dl>
    ${warning}
  `;
}
function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s])); }

function resetAll(clearImage = true) {
  state.adjustments = defaultAdjustments();
  state.locals = defaultLocals();
  state.activeMask = 'none';
  state.masks = { target: null, background: null, stars: null };
  state.userHint = null;
  state.dragRect = null;
  if (clearImage) {
    state.original = null;
    state.edited = null;
    state.file = null;
    state.w = 0;
    state.h = 0;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    els.emptyState.style.display = 'block';
    els.fileMeta.innerHTML = '<p>스태킹 완료 TIFF, PNG, JPG, WebP 등을 불러오세요.</p>';
  }
  syncControls();
  updateMaskButtons();
}

function syncControls() {
  for (const [key, value] of Object.entries(state.adjustments)) {
    const el = document.querySelector(`[data-adj="${key}"]`);
    if (el) el.value = value;
  }
  for (const [key, value] of Object.entries(state.locals)) {
    const el = document.querySelector(`[data-local="${key}"]`);
    if (el) el.value = value;
  }
  els.blackPoint.value = 0;
  els.midtone.value = 1;
  els.whitePoint.value = 1;
}

function autoCreateMasks() {
  state.masks.stars = state.masks.stars || createStarMask();
  state.masks.background = state.masks.background || createBackgroundMask(state.masks.stars);
  state.masks.target = state.masks.target || createTargetMask();
}

function renderImage() {
  if (!state.original) return;
  const src = state.original.data;
  const out = new Uint8ClampedArray(src.length);
  const w = state.w, h = state.h;
  const adj = state.adjustments;
  const bp = Number(els.blackPoint.value);
  const wp = Number(els.whitePoint.value);
  const mid = Number(els.midtone.value);
  const gamma = Math.max(0.05, adj.gamma / Math.max(0.05, mid));
  const exposureMul = Math.pow(2, adj.exposure);
  const mask = getActiveMask();
  const localMask = state.activeMask === 'none' ? null : mask;
  const blurred = (adj.denoise > 0 || adj.gradientReduce > 0 || adj.clarity > 0 || state.locals.localClarity > 0) ? boxBlurImageData(state.original, 2) : null;
  const gradient = adj.gradientReduce > 0 ? boxBlurImageData(state.original, Math.max(12, Math.round(Math.min(w, h) / 28))) : null;
  const starMask = state.masks.stars;
  const bgMask = state.masks.background;

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    let r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;

    if (adj.gradientReduce > 0 && gradient) {
      const gr = gradient.data[i] / 255, gg = gradient.data[i + 1] / 255, gb = gradient.data[i + 2] / 255;
      const avg = (gr + gg + gb) / 3;
      r = lerp(r, clamp01(r - (gr - avg) * 0.85), adj.gradientReduce);
      g = lerp(g, clamp01(g - (gg - avg) * 0.85), adj.gradientReduce);
      b = lerp(b, clamp01(b - (gb - avg) * 0.85), adj.gradientReduce);
    }

    r = stretchChannel(r, bp, wp, gamma, exposureMul, adj.autoStretch);
    g = stretchChannel(g, bp, wp, gamma, exposureMul, adj.autoStretch);
    b = stretchChannel(b, bp, wp, gamma, exposureMul, adj.autoStretch);

    r = clamp01((r - 0.5) * adj.contrast + 0.5 + adj.brightness);
    g = clamp01((g - 0.5) * adj.contrast + 0.5 + adj.brightness);
    b = clamp01((b - 0.5) * adj.contrast + 0.5 + adj.brightness);

    [r, g, b] = applySaturation(r, g, b, adj.saturation, adj.vibrance);

    if (adj.haAccent > 0) {
      const ha = Math.max(0, r - Math.max(g, b) * 0.72);
      r = clamp01(r + ha * adj.haAccent * 0.8);
      g = clamp01(g - ha * adj.haAccent * 0.12);
      b = clamp01(b - ha * adj.haAccent * 0.06);
    }

    const bg = bgMask ? bgMask[p] / 255 : 0;
    if (adj.backgroundNeutral > 0 && bg > 0) {
      const avg = (r + g + b) / 3;
      r = lerp(r, avg, adj.backgroundNeutral * bg * 0.75);
      g = lerp(g, avg, adj.backgroundNeutral * bg * 0.75);
      b = lerp(b, avg, adj.backgroundNeutral * bg * 0.75);
    }
    if (adj.backgroundDarken > 0 && bg > 0) {
      const factor = 1 - adj.backgroundDarken * bg * 0.55;
      r *= factor; g *= factor; b *= factor;
    }

    if (blurred && adj.denoise > 0) {
      const br = blurred.data[i] / 255, bgc = blurred.data[i + 1] / 255, bb = blurred.data[i + 2] / 255;
      const bgWeight = (bgMask ? bgMask[p] / 255 : 1) * adj.denoise * 0.65;
      r = lerp(r, br, bgWeight);
      g = lerp(g, bgc, bgWeight);
      b = lerp(b, bb, bgWeight);
    }

    if (blurred && adj.clarity > 0) {
      r = clamp01(r + (r - blurred.data[i] / 255) * adj.clarity * 0.8);
      g = clamp01(g + (g - blurred.data[i + 1] / 255) * adj.clarity * 0.8);
      b = clamp01(b + (b - blurred.data[i + 2] / 255) * adj.clarity * 0.8);
    }

    if (starMask && adj.starReduction > 0) {
      const s = starMask[p] / 255;
      if (s > 0) {
        const localMedian = localBackgroundEstimate(src, w, h, p);
        const factor = adj.starReduction * s * 0.62;
        r = lerp(r, localMedian[0], factor);
        g = lerp(g, localMedian[1], factor);
        b = lerp(b, localMedian[2], factor);
      }
    }

    if (localMask) {
      let m = localMask[p] / 255;
      if (els.invertMask.checked) m = 1 - m;
      if (m > 0.001) {
        let lr = r, lg = g, lb = b;
        lr = clamp01((lr - 0.5) * state.locals.localContrast + 0.5 + state.locals.localBrightness);
        lg = clamp01((lg - 0.5) * state.locals.localContrast + 0.5 + state.locals.localBrightness);
        lb = clamp01((lb - 0.5) * state.locals.localContrast + 0.5 + state.locals.localBrightness);
        [lr, lg, lb] = applySaturation(lr, lg, lb, state.locals.localSaturation, 0);
        if (blurred && state.locals.localClarity > 0) {
          lr = clamp01(lr + (lr - blurred.data[i] / 255) * state.locals.localClarity);
          lg = clamp01(lg + (lg - blurred.data[i + 1] / 255) * state.locals.localClarity);
          lb = clamp01(lb + (lb - blurred.data[i + 2] / 255) * state.locals.localClarity);
        }
        r = lerp(r, lr, m);
        g = lerp(g, lg, m);
        b = lerp(b, lb, m);
      }
    }

    out[i] = clamp255(r * 255);
    out[i + 1] = clamp255(g * 255);
    out[i + 2] = clamp255(b * 255);
    out[i + 3] = src[i + 3];
  }

  state.edited = new ImageData(out, w, h);
  drawCanvas();
  drawHistogram(state.edited);
}

function stretchChannel(v, bp, wp, gamma, exposureMul, autoStretch) {
  let x = clamp01((v - bp) / Math.max(0.001, wp - bp));
  if (autoStretch > 0) {
    const log = Math.log1p(x * 18) / Math.log1p(18);
    const arc = Math.asinh(x * 8) / Math.asinh(8);
    x = lerp(x, lerp(log, arc, 0.45), autoStretch);
  }
  x = Math.pow(x * exposureMul, 1 / gamma);
  return clamp01(x);
}

function applySaturation(r, g, b, sat, vib) {
  const l = luminance(r, g, b);
  const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
  const currentSat = maxc - minc;
  const vibMul = 1 + vib * (1 - currentSat) * 0.9;
  const m = sat * vibMul;
  return [
    clamp01(l + (r - l) * m),
    clamp01(l + (g - l) * m),
    clamp01(l + (b - l) * m),
  ];
}

function drawCanvas() {
  if (!state.original || !state.edited) return;
  let frame = state.edited;
  if (state.view === 'original') frame = state.original;
  if (state.view === 'compare') frame = makeCompareImage();
  ctx.putImageData(frame, 0, 0);
  if (els.showMask.checked && state.activeMask !== 'none') drawMaskOverlay();
  applyZoom();
}

function makeCompareImage() {
  const out = new Uint8ClampedArray(state.edited.data);
  const mid = Math.floor(state.w / 2);
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < mid; x++) {
      const i = (y * state.w + x) * 4;
      out[i] = state.original.data[i];
      out[i + 1] = state.original.data[i + 1];
      out[i + 2] = state.original.data[i + 2];
      out[i + 3] = state.original.data[i + 3];
    }
  }
  return new ImageData(out, state.w, state.h);
}

function drawMaskOverlay() {
  const mask = getActiveMask();
  if (!mask) return;
  const overlay = ctx.getImageData(0, 0, state.w, state.h);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    let m = mask[p] / 255;
    if (els.invertMask.checked) m = 1 - m;
    if (m > 0.03) {
      overlay.data[i] = lerp(overlay.data[i], 52, m * 0.45);
      overlay.data[i + 1] = lerp(overlay.data[i + 1], 87, m * 0.35);
      overlay.data[i + 2] = lerp(overlay.data[i + 2], 255, m * 0.55);
    }
  }
  ctx.putImageData(overlay, 0, 0);
}

function drawHistogram(imageData) {
  const bins = new Uint32Array(256);
  const data = imageData.data;
  const pixelCount = data.length / 4;
  const stride = Math.max(4, Math.floor(pixelCount / HISTOGRAM_SAMPLE_PIXELS) * 4);
  let clipped = 0;
  let counted = 0;
  for (let i = 0; i < data.length; i += stride) {
    const l = Math.round(luminance(data[i], data[i + 1], data[i + 2]));
    bins[l]++;
    counted++;
    if (l <= 1 || l >= 254) clipped++;
  }
  const max = Math.max(...bins);
  const w = els.histogram.width, h = els.histogram.height;
  hctx.clearRect(0, 0, w, h);
  hctx.fillStyle = '#120d0a';
  hctx.fillRect(0, 0, w, h);
  hctx.strokeStyle = 'rgba(255, 222, 190, 0.14)';
  hctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (h / 4) * i;
    hctx.beginPath(); hctx.moveTo(0, y); hctx.lineTo(w, y); hctx.stroke();
  }
  hctx.fillStyle = '#f59e4c';
  for (let x = 0; x < 256; x++) {
    const bar = Math.sqrt(bins[x] / max) * (h - 16);
    hctx.fillRect(x * w / 256, h - bar, Math.ceil(w / 256), bar);
  }
  hctx.strokeStyle = '#f5eee7';
  hctx.beginPath();
  const bp = Number(els.blackPoint.value) * w;
  const wp = Number(els.whitePoint.value) * w;
  hctx.moveTo(bp, 0); hctx.lineTo(bp, h);
  hctx.moveTo(wp, 0); hctx.lineTo(wp, h);
  hctx.stroke();
  els.clipInfo.textContent = `clip ${((clipped / Math.max(1, counted)) * 100).toFixed(2)}%`;
}

function createTargetMask() {
  if (!state.original) return null;
  const { data, width: w, height: h } = state.original;
  const mask = new Uint8ClampedArray(w * h);
  const lum = new Float32Array(w * h);
  let sum = 0, sum2 = 0;
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]) / 255;
    lum[p] = l; sum += l; sum2 += l * l;
  }
  const mean = sum / lum.length;
  const std = Math.sqrt(sum2 / lum.length - mean * mean);
  const threshold = mean + std * 0.48;
  const hint = state.userHint || { x: w / 2, y: h / 2, radius: Math.min(w, h) * 0.35 };
  const maxDist = Math.max(30, hint.radius || Math.min(w, h) * 0.38);
  const blurred = blurScalar(lum, w, h, 7);
  const broad = blurScalar(lum, w, h, 25);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const dx = x - hint.x, dy = y - hint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const proximity = clamp01(1 - dist / maxDist);
      const structure = Math.max(0, broad[p] - mean * 0.7) + Math.max(0, blurred[p] - broad[p]) * 1.2;
      const score = structure * 1.6 + Math.max(0, lum[p] - threshold) * 0.7 + proximity * 0.15;
      mask[p] = score > std * 0.42 ? clamp255((score / Math.max(std, 0.02)) * 140) : 0;
    }
  }
  return featherMask(cleanMask(mask, w, h, 2), w, h, Number(els.maskFeather.value));
}

function createBackgroundMask(existingStarMask = null) {
  if (!state.original) return null;
  const { data, width: w, height: h } = state.original;
  const mask = new Uint8ClampedArray(w * h);
  const values = [];
  for (let i = 0; i < data.length; i += 16) values.push(luminance(data[i], data[i + 1], data[i + 2]));
  values.sort((a, b) => a - b);
  const q55 = values[Math.floor(values.length * 0.55)] || 32;
  const q78 = values[Math.floor(values.length * 0.78)] || 96;
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]);
    const m = 1 - clamp01((l - q55) / Math.max(1, q78 - q55));
    mask[p] = clamp255(m * 255);
  }
  const star = existingStarMask || state.masks.stars || createStarMask();
  for (let p = 0; p < mask.length; p++) mask[p] = clamp255(mask[p] * (1 - (star?.[p] || 0) / 255));
  return featherMask(mask, w, h, 10);
}

function createStarMask() {
  if (!state.original) return null;
  const { data, width: w, height: h } = state.original;
  const lum = new Float32Array(w * h);
  const samples = [];
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = luminance(data[i], data[i + 1], data[i + 2]) / 255;
    if (p % 5 === 0) samples.push(lum[p]);
  }
  samples.sort((a, b) => a - b);
  const q = samples[Math.floor(samples.length * 0.985)] || 0.8;
  const broad = blurScalar(lum, w, h, 5);
  const mask = new Uint8ClampedArray(w * h);
  for (let p = 0; p < lum.length; p++) {
    const pointLike = lum[p] - broad[p];
    if (lum[p] > q || pointLike > 0.12) mask[p] = clamp255((Math.max(lum[p] - q, pointLike) / 0.22) * 255);
  }
  return featherMask(dilateMask(mask, w, h, 1), w, h, 2);
}

function cleanMask(mask, w, h, iterations) {
  let out = mask;
  for (let it = 0; it < iterations; it++) out = dilateMask(erodeMask(out, w, h), w, h, 1);
  return out;
}
function erodeMask(mask, w, h) {
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let min = 255;
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) min = Math.min(min, mask[(y + yy) * w + x + xx]);
    out[y * w + x] = min;
  }
  return out;
}
function dilateMask(mask, w, h, radius) {
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let max = 0;
    for (let yy = -radius; yy <= radius; yy++) for (let xx = -radius; xx <= radius; xx++) {
      const nx = x + xx, ny = y + yy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) max = Math.max(max, mask[ny * w + nx]);
    }
    out[y * w + x] = max;
  }
  return out;
}
function featherMask(mask, w, h, radius) {
  if (radius <= 0) return mask;
  const scalar = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) scalar[i] = mask[i] / 255;
  const blurred = blurScalar(scalar, w, h, radius);
  const out = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = clamp255(blurred[i] * 255);
  return out;
}

function blurScalar(input, w, h, radius) {
  radius = Math.max(1, Math.round(radius));
  const temp = new Float32Array(input.length);
  const out = new Float32Array(input.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += input[y * w + clampIndex(x, w)];
    for (let x = 0; x < w; x++) {
      temp[y * w + x] = sum / size;
      sum -= input[y * w + clampIndex(x - radius, w)];
      sum += input[y * w + clampIndex(x + radius + 1, w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[clampIndex(y, h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size;
      sum -= temp[clampIndex(y - radius, h) * w + x];
      sum += temp[clampIndex(y + radius + 1, h) * w + x];
    }
  }
  return out;
}
function clampIndex(v, max) { return Math.max(0, Math.min(max - 1, v)); }

function boxBlurImageData(imageData, radius) {
  const w = imageData.width, h = imageData.height, data = imageData.data;
  const out = new Uint8ClampedArray(data.length);
  const temp = new Float32Array(data.length);
  radius = Math.max(1, Math.round(radius));
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const sums = [0, 0, 0, 0];
    for (let x = -radius; x <= radius; x++) {
      const i = (y * w + clampIndex(x, w)) * 4;
      sums[0] += data[i]; sums[1] += data[i+1]; sums[2] += data[i+2]; sums[3] += data[i+3];
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      temp[i] = sums[0] / size; temp[i+1] = sums[1] / size; temp[i+2] = sums[2] / size; temp[i+3] = sums[3] / size;
      const remove = (y * w + clampIndex(x - radius, w)) * 4;
      const add = (y * w + clampIndex(x + radius + 1, w)) * 4;
      sums[0] += data[add] - data[remove]; sums[1] += data[add+1] - data[remove+1]; sums[2] += data[add+2] - data[remove+2]; sums[3] += data[add+3] - data[remove+3];
    }
  }
  for (let x = 0; x < w; x++) {
    const sums = [0, 0, 0, 0];
    for (let y = -radius; y <= radius; y++) {
      const i = (clampIndex(y, h) * w + x) * 4;
      sums[0] += temp[i]; sums[1] += temp[i+1]; sums[2] += temp[i+2]; sums[3] += temp[i+3];
    }
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      out[i] = sums[0] / size; out[i+1] = sums[1] / size; out[i+2] = sums[2] / size; out[i+3] = sums[3] / size;
      const remove = (clampIndex(y - radius, h) * w + x) * 4;
      const add = (clampIndex(y + radius + 1, h) * w + x) * 4;
      sums[0] += temp[add] - temp[remove]; sums[1] += temp[add+1] - temp[remove+1]; sums[2] += temp[add+2] - temp[remove+2]; sums[3] += temp[add+3] - temp[remove+3];
    }
  }
  return new ImageData(out, w, h);
}

function localBackgroundEstimate(data, w, h, p) {
  const x = p % w, y = Math.floor(p / w);
  const vals = [];
  const offsets = [[-4,0],[4,0],[0,-4],[0,4],[-3,-3],[3,3],[-3,3],[3,-3]];
  for (const [dx,dy] of offsets) {
    const nx = clampIndex(x + dx, w), ny = clampIndex(y + dy, h);
    const i = (ny * w + nx) * 4;
    vals.push([data[i] / 255, data[i+1] / 255, data[i+2] / 255]);
  }
  vals.sort((a,b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
  return vals[Math.floor(vals.length * 0.35)];
}

function getActiveMask() {
  if (state.activeMask === 'none') return null;
  return state.masks[state.activeMask];
}

function setActiveMask(mask) {
  state.activeMask = mask;
  updateMaskButtons();
  scheduleRender();
}
function updateMaskButtons() {
  document.querySelectorAll('.mask-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mask === state.activeMask));
}

document.querySelectorAll('[data-adj]').forEach(input => {
  input.addEventListener('input', () => {
    state.adjustments[input.dataset.adj] = Number(input.value);
    scheduleRender();
  });
});
document.querySelectorAll('[data-local]').forEach(input => {
  input.addEventListener('input', () => {
    state.locals[input.dataset.local] = Number(input.value);
    scheduleRender();
  });
});
[els.blackPoint, els.midtone, els.whitePoint, els.showMask, els.invertMask].forEach(el => el.addEventListener('input', scheduleRender));
els.maskFeather.addEventListener('input', () => {
  if (!state.original) return;
  if (state.activeMask === 'target') state.masks.target = createTargetMask();
  if (state.activeMask === 'background') state.masks.background = createBackgroundMask();
  if (state.activeMask === 'stars') state.masks.stars = createStarMask();
  scheduleRender();
});

document.querySelectorAll('.mask-btn').forEach(btn => btn.addEventListener('click', () => setActiveMask(btn.dataset.mask)));

els.autoTargetBtn.addEventListener('click', () => { if (state.original) { state.masks.target = createTargetMask(); setActiveMask('target'); els.showMask.checked = true; } });
els.autoBgBtn.addEventListener('click', () => { if (state.original) { state.masks.background = createBackgroundMask(); setActiveMask('background'); els.showMask.checked = true; } });
els.autoStarsBtn.addEventListener('click', () => { if (state.original) { state.masks.stars = createStarMask(); setActiveMask('stars'); els.showMask.checked = true; } });

els.resetBtn.addEventListener('click', () => { resetAll(false); if (state.original) renderImage(); });
els.exportPngBtn.addEventListener('click', () => exportImage('image/png', 'png'));
els.exportJpegBtn.addEventListener('click', () => exportImage('image/jpeg', 'jpg', 0.94));

function exportImage(type, ext, quality) {
  if (!state.edited) return;
  const c = document.createElement('canvas');
  c.width = state.w; c.height = state.h;
  c.getContext('2d').putImageData(state.edited, 0, 0);
  c.toBlob(blob => {
    const a = document.createElement('a');
    const base = (state.file?.name || 'astrodarkroom').replace(/\.[^.]+$/, '');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}_edited.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }, type, quality);
}

function applyPreset(name) {
  const A = defaultAdjustments();
  const L = defaultLocals();
  const hist = { bp: 0.01, mid: 1, wp: 1 };
  if (name === 'natural') Object.assign(A, { autoStretch: .32, contrast: 1.08, saturation: 1.12, backgroundNeutral: .35, denoise: .12 });
  if (name === 'strong') Object.assign(A, { autoStretch: .58, contrast: 1.28, saturation: 1.22, clarity: .35, backgroundDarken: .22, backgroundNeutral: .42 });
  if (name === 'nebula') Object.assign(A, { autoStretch: .48, contrast: 1.16, saturation: 1.38, vibrance: .35, clarity: .18, denoise: .12 });
  if (name === 'dark') Object.assign(A, { autoStretch: .36, contrast: 1.15, backgroundDarken: .58, backgroundNeutral: .55, denoise: .22 });
  if (name === 'dwarf') Object.assign(A, { autoStretch: .42, contrast: 1.12, saturation: 1.18, backgroundNeutral: .5, denoise: .32, starReduction: .18 });
  if (name === 'ha') Object.assign(A, { autoStretch: .42, contrast: 1.12, saturation: 1.18, haAccent: .62, backgroundNeutral: .32 });
  state.adjustments = A;
  state.locals = L;
  els.blackPoint.value = hist.bp;
  els.midtone.value = hist.mid;
  els.whitePoint.value = hist.wp;
  syncControls();
  els.blackPoint.value = hist.bp;
  els.midtone.value = hist.mid;
  els.whitePoint.value = hist.wp;
  scheduleRender();
}
document.querySelectorAll('.preset').forEach(btn => btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));

function setView(view) {
  state.view = view;
  [els.viewEdited, els.viewOriginal, els.viewCompare].forEach(b => b.classList.remove('active'));
  if (view === 'edited') els.viewEdited.classList.add('active');
  if (view === 'original') els.viewOriginal.classList.add('active');
  if (view === 'compare') els.viewCompare.classList.add('active');
  drawCanvas();
}
els.viewEdited.addEventListener('click', () => setView('edited'));
els.viewOriginal.addEventListener('click', () => setView('original'));
els.viewCompare.addEventListener('click', () => setView('compare'));

function fitToStage() {
  if (!state.w || !state.h) return;
  const rect = els.stage.getBoundingClientRect();
  state.scale = Math.min((rect.width - 40) / state.w, (rect.height - 40) / state.h, 1);
  applyZoom();
}
function applyZoom() {
  els.canvas.style.width = `${state.w * state.scale}px`;
  els.canvas.style.height = `${state.h * state.scale}px`;
  els.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
}
els.zoomIn.addEventListener('click', () => { state.scale = Math.min(6, state.scale * 1.25); applyZoom(); });
els.zoomOut.addEventListener('click', () => { state.scale = Math.max(0.05, state.scale / 1.25); applyZoom(); });
els.fitBtn.addEventListener('click', fitToStage);
window.addEventListener('resize', () => { if (state.original) fitToStage(); });

els.canvas.addEventListener('mousedown', e => {
  if (!state.original) return;
  const p = canvasPoint(e);
  state.dragStart = p;
  state.dragRect = null;
});
window.addEventListener('mousemove', e => {
  if (!state.dragStart || !state.original) return;
  const p = canvasPoint(e);
  const x1 = Math.min(state.dragStart.x, p.x), y1 = Math.min(state.dragStart.y, p.y);
  const x2 = Math.max(state.dragStart.x, p.x), y2 = Math.max(state.dragStart.y, p.y);
  const stageRect = els.stage.getBoundingClientRect();
  const canvasRect = els.canvas.getBoundingClientRect();
  const left = canvasRect.left - stageRect.left + x1 * state.scale;
  const top = canvasRect.top - stageRect.top + y1 * state.scale;
  const right = stageRect.width - (canvasRect.left - stageRect.left + x2 * state.scale);
  const bottom = stageRect.height - (canvasRect.top - stageRect.top + y2 * state.scale);
  els.stage.style.setProperty('--drag-left', `${left}px`);
  els.stage.style.setProperty('--drag-top', `${top}px`);
  els.stage.style.setProperty('--drag-right', `${right}px`);
  els.stage.style.setProperty('--drag-bottom', `${bottom}px`);
  els.stage.classList.add('dragging');
});
window.addEventListener('mouseup', e => {
  if (!state.dragStart || !state.original) return;
  const p = canvasPoint(e);
  const dx = p.x - state.dragStart.x, dy = p.y - state.dragStart.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 8) {
    state.userHint = { x: p.x, y: p.y, radius: Math.min(state.w, state.h) * 0.32 };
  } else {
    const x1 = Math.min(state.dragStart.x, p.x), y1 = Math.min(state.dragStart.y, p.y);
    const x2 = Math.max(state.dragStart.x, p.x), y2 = Math.max(state.dragStart.y, p.y);
    state.userHint = { x: (x1+x2)/2, y: (y1+y2)/2, radius: Math.max(x2-x1, y2-y1) * 0.9 };
  }
  state.masks.target = createTargetMask();
  setActiveMask('target');
  els.showMask.checked = true;
  state.dragStart = null;
  els.stage.classList.remove('dragging');
});
function canvasPoint(e) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: clampIndex(Math.round((e.clientX - rect.left) / state.scale), state.w),
    y: clampIndex(Math.round((e.clientY - rect.top) / state.scale), state.h),
  };
}

function autoStretchEstimate() {
  if (!state.original) return;
  const vals = [];
  const data = state.original.data;
  for (let i = 0; i < data.length; i += 16) vals.push(luminance(data[i], data[i+1], data[i+2]) / 255);
  vals.sort((a,b)=>a-b);
  els.blackPoint.value = Math.max(0, vals[Math.floor(vals.length * 0.005)] - 0.005).toFixed(3);
  els.whitePoint.value = Math.min(1, vals[Math.floor(vals.length * 0.997)] + 0.02).toFixed(3);
  els.midtone.value = 0.72;
}

document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'a' && state.original) { autoStretchEstimate(); scheduleRender(); }
  if (e.key.toLowerCase() === 'm') { els.showMask.checked = !els.showMask.checked; scheduleRender(); }
  if (e.key === ' ') { setView(state.view === 'original' ? 'edited' : 'original'); e.preventDefault(); }
});

syncControls();
