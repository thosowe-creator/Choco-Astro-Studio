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
  viewStarless: document.getElementById('viewStarless'),
  viewStars: document.getElementById('viewStars'),
  separateStarsBtn: document.getElementById('separateStarsBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  languageSelect: document.getElementById('languageSelect'),
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
  starless: null,
  starLayer: null,
  userHint: null,
  dragStart: null,
  dragRect: null,
  adjustments: defaultAdjustments(),
  locals: defaultLocals(),
  renderQueued: false,
  renderTimer: null,
  language: localStorage.getItem('choco-astro-language') || 'en',
};

const MAX_PROCESSING_PIXELS = 2600000;
const HISTOGRAM_SAMPLE_PIXELS = 350000;

const i18n = {
  en: {
    tagline: 'Darkroom-grade stacked TIFF editor', openImage: 'Open Image', reset: 'Reset', savePng: 'Save PNG', saveJpg: 'Save JPG', settings: 'Settings',
    file: 'File', histogram: 'Histogram', masks: 'Masks', basicAdjust: 'Basic Adjust', astroTools: 'Astro Tools', starTools: 'Star Tools', localAdjust: 'Local Adjust', view: 'View',
    fileHint: 'Open a stacked TIFF, PNG, JPG, or WebP image.', black: 'Black', mid: 'Mid', white: 'White', wholeImage: 'Whole Image', objectMask: 'Object Mask', backgroundMask: 'Background Mask', starMask: 'Star Mask',
    maskHint: 'Object mask selects extended nebula/galaxy structures while excluding stars and background. Drag on the image to guide object detection.', showMask: 'Show Mask', invertMask: 'Invert Mask', feather: 'Feather',
    detectObject: 'Detect Object Mask', detectBackground: 'Detect Background Mask', detectStars: 'Detect Star Mask', exposure: 'Exposure', brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', vibrance: 'Vibrance', gamma: 'Gamma',
    autoStretch: 'Auto Stretch', backgroundDarken: 'Background Darken', backgroundNeutral: 'Background Neutralize', gradientReduce: 'Gradient Reduce', starToolsHint: 'Separate the image into a starless layer and a stars-only layer, then remove or add stars back while editing.', separateStars: 'Separate Stars', starViewHint: 'Use View → Starless or Stars to inspect the separated layers.', starRemove: 'Star Remove', starRestore: 'Add Stars Back', starReduction: 'Star Reduction', starColor: 'Star Color', clarity: 'Clarity / Structure', denoise: 'Denoise', haAccent: 'Hα Accent',
    localHint: 'Choose Object, Background, or Star Mask first. These controls only affect the selected mask.', localBrightness: 'Local Brightness', localContrast: 'Local Contrast', localSaturation: 'Local Saturation', localClarity: 'Local Detail',
    edited: 'Edited', original: 'Original', compare: 'Compare', starlessView: 'Starless', starsView: 'Stars', fit: 'Fit', language: 'Language', settingsHint: 'English is the default. Switch here whenever you want Korean UI labels.',
    emptyTitle: 'Drop your astro image into Choco Astro Studio', emptyText: 'TIFF/TIF, PNG, JPG, WebP · fast browser preview processing',
    metaName: 'Name', metaFormat: 'Format', metaSource: 'Source', metaWorking: 'Working', metaBit: 'Bit Depth', metaSize: 'File Size',
    readFail: 'Could not read the image.', readFailDetail: 'Check TIFF compression, bit depth, or memory limits.', tiffDecoderFail: 'Could not load the TIFF decoder. Check internet connection or CDN blocking.', noTiffPages: 'No TIFF pages were found.', tiffFallback: 'Could not directly interpret the TIFF samples, so UTIF 8-bit conversion was used.',
  },
  ko: {
    tagline: '스택 TIFF 천체사진 편집 스튜디오', openImage: '이미지 열기', reset: '초기화', savePng: 'PNG 저장', saveJpg: 'JPG 저장', settings: '설정',
    file: '파일', histogram: '히스토그램', masks: '마스크', basicAdjust: '기본 보정', astroTools: '천체사진 도구', starTools: '별 도구', localAdjust: '부분 보정', view: '보기',
    fileHint: '스태킹 완료 TIFF, PNG, JPG, WebP 등을 불러오세요.', black: '블랙', mid: '미드', white: '화이트', wholeImage: '전체 이미지', objectMask: '천체 마스크', backgroundMask: '배경 마스크', starMask: '별 마스크',
    maskHint: '천체 마스크는 별과 배경을 제외한 은하/성운 같은 확장 구조를 선택합니다. 이미지 위를 드래그하면 감지 기준을 줄 수 있습니다.', showMask: '마스크 표시', invertMask: '마스크 반전', feather: '페더',
    detectObject: '천체 마스크 감지', detectBackground: '배경 마스크 감지', detectStars: '별 마스크 감지', exposure: '노출', brightness: '밝기', contrast: '대비', saturation: '채도', vibrance: '자연 채도', gamma: '감마',
    autoStretch: '자동 스트레치', backgroundDarken: '배경 어둡게', backgroundNeutral: '배경 중화', gradientReduce: '그라디언트 완화', starToolsHint: '이미지를 별이 제거된 레이어와 별 전용 레이어로 분리한 뒤, 보정 중 별을 제거하거나 다시 더할 수 있습니다.', separateStars: '별 분리', starViewHint: '보기 → 별 제거본 또는 별 레이어에서 분리 결과를 확인하세요.', starRemove: '별 제거', starRestore: '별 다시 추가', starReduction: '별상 축소', starColor: '별 색감', clarity: '샤픈 / 구조', denoise: '노이즈 완화', haAccent: 'Hα 강조',
    localHint: '천체, 배경, 별 마스크 중 하나를 먼저 선택하세요. 이 조절값은 선택한 마스크에만 적용됩니다.', localBrightness: '부분 밝기', localContrast: '부분 대비', localSaturation: '부분 채도', localClarity: '부분 디테일',
    edited: '보정', original: '원본', compare: '비교', starlessView: '별 제거본', starsView: '별 레이어', fit: '맞춤', language: '언어', settingsHint: '기본값은 영어입니다. 여기에서 언제든 한국어 UI로 바꿀 수 있습니다.',
    emptyTitle: 'Choco Astro Studio에 천체사진을 올려보세요', emptyText: 'TIFF/TIF, PNG, JPG, WebP · 빠른 브라우저 미리보기 처리',
    metaName: '이름', metaFormat: '포맷', metaSource: '원본', metaWorking: '작업', metaBit: '비트', metaSize: '용량',
    readFail: '이미지를 읽지 못했습니다.', readFailDetail: 'TIFF 압축/비트 심도/메모리 제한을 확인해주세요.', tiffDecoderFail: 'TIFF 디코더를 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단 여부를 확인해주세요.', noTiffPages: 'TIFF 페이지를 찾지 못했습니다.', tiffFallback: 'TIFF 원본 샘플을 직접 해석하지 못해 UTIF 8-bit 변환을 사용했습니다.',
  }
};

function t(key) {
  return (i18n[state.language] && i18n[state.language][key]) || i18n.en[key] || key;
}

function applyLanguage(language = state.language) {
  state.language = language;
  localStorage.setItem('choco-astro-language', language);
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  if (els.languageSelect) els.languageSelect.value = language;
  if (!state.file) els.fileMeta.innerHTML = `<p>${t('fileHint')}</p>`;
  else updateMeta(state.file);
}


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
    starRemove: 0,
    starRestore: 0,
    starReduction: 0,
    starColor: 1,
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
    alert(`${t('readFail')} ${err.message || t('readFailDetail')}`);
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
  if (!window.UTIF) throw new Error(t('tiffDecoderFail'))
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error(t('noTiffPages'))
  const ifd = ifds[0];
  UTIF.decodeImage(buf, ifd);

  const normalized = decodeTiffToDisplayImage(ifd, buf);
  if (normalized) return normalized;

  const rgba = UTIF.toRGBA8(ifd);
  const imageData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
  imageData.info = {
    bitDepth: normalizeTagArray(ifd.t258)[0] || 8,
    sourceType: 'utif-rgba8',
    warning: t('tiffFallback'),
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
      <dt>${t('metaName')}</dt><dd title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</dd>
      <dt>${t('metaFormat')}</dt><dd>${escapeHtml(file.type || file.name.split('.').pop()?.toUpperCase() || 'unknown')}</dd>
      <dt>${t('metaSource')}</dt><dd>${state.sourceWidth} × ${state.sourceHeight}</dd>
      <dt>${t('metaWorking')}</dt><dd>${preview}</dd>
      <dt>${t('metaBit')}</dt><dd>${escapeHtml(bitDepth)} · ${escapeHtml(info.sourceType || 'browser')}</dd>
      <dt>${t('metaSize')}</dt><dd>${(file.size / 1024 / 1024).toFixed(2)} MB</dd>
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
  state.starless = null;
  state.starLayer = null;
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
    els.fileMeta.innerHTML = `<p>${t('fileHint')}</p>`;
  }
  applyLanguage();
  syncControls();
  activateTool('view');
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
  const needsStars = adj.starRemove > 0 || adj.starRestore > 0 || adj.starReduction > 0 || adj.starColor !== 1 || state.activeMask === 'stars' || state.activeMask === 'target' || state.activeMask === 'background';
  const needsBackground = adj.backgroundNeutral > 0 || adj.backgroundDarken > 0 || state.activeMask === 'background' || state.activeMask === 'target';
  const starMask = needsStars ? ensureMask('stars') : state.masks.stars;
  const bgMask = needsBackground ? ensureMask('background') : state.masks.background;
  const mask = getActiveMask();
  const localMask = state.activeMask === 'none' ? null : mask;
  const scopeMask = localMask;
  const needsSoftBase = adj.denoise > 0 || adj.gradientReduce > 0 || adj.clarity > 0 || state.locals.localClarity > 0;
  const needsStarBase = starMask && (adj.starRemove > 0 || adj.starRestore > 0 || adj.starReduction > 0);
  const blurred = (needsSoftBase || needsStarBase) ? boxBlurImageData(state.original, needsStarBase ? 4 : 2) : null;
  const gradient = adj.gradientReduce > 0 ? boxBlurImageData(state.original, Math.max(12, Math.round(Math.min(w, h) / 28))) : null;

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

    if (starMask) {
      const s = starMask[p] / 255;
      if (s > 0) {
        const baseR = needsStarBase && blurred ? blurred.data[i] / 255 : 0;
        const baseG = needsStarBase && blurred ? blurred.data[i + 1] / 255 : 0;
        const baseB = needsStarBase && blurred ? blurred.data[i + 2] / 255 : 0;

        if (adj.starRemove > 0) {
          const remove = clamp01(adj.starRemove * s);
          r = lerp(r, baseR, remove);
          g = lerp(g, baseG, remove);
          b = lerp(b, baseB, remove);
        }

        if (adj.starReduction > 0) {
          const factor = adj.starReduction * s * 0.62;
          r = lerp(r, baseR, factor);
          g = lerp(g, baseG, factor);
          b = lerp(b, baseB, factor);
        }

        if (adj.starColor !== 1) {
          const colored = applySaturation(r, g, b, adj.starColor, Math.max(0, adj.starColor - 1));
          r = lerp(r, colored[0], s);
          g = lerp(g, colored[1], s);
          b = lerp(b, colored[2], s);
        }

        if (adj.starRestore > 0) {
          const sr = src[i] / 255 - baseR;
          const sg = src[i + 1] / 255 - baseG;
          const sb = src[i + 2] / 255 - baseB;
          const restored = applySaturation(clamp01(baseR + Math.max(0, sr)), clamp01(baseG + Math.max(0, sg)), clamp01(baseB + Math.max(0, sb)), adj.starColor, 0);
          const add = clamp01(adj.starRestore * s);
          r = clamp01(r + (restored[0] - baseR) * add);
          g = clamp01(g + (restored[1] - baseG) * add);
          b = clamp01(b + (restored[2] - baseB) * add);
        }
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

    if (scopeMask) {
      let scope = scopeMask[p] / 255;
      if (els.invertMask.checked) scope = 1 - scope;
      r = lerp(src[i] / 255, r, scope);
      g = lerp(src[i + 1] / 255, g, scope);
      b = lerp(src[i + 2] / 255, b, scope);
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
  if (state.view === 'starless') frame = state.starless || makeStarlessPreview();
  if (state.view === 'stars') frame = state.starLayer || makeStarLayerPreview();
  ctx.putImageData(frame, 0, 0);
  if (els.showMask.checked && state.activeMask !== 'none') drawMaskOverlay();
  applyZoom();
}


function separateStarLayers() {
  if (!state.original) return;
  const starMask = ensureMask('stars');
  const base = boxBlurImageData(state.original, 4);
  const src = state.original.data;
  const starless = new Uint8ClampedArray(src.length);
  const stars = new Uint8ClampedArray(src.length);

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const s = starMask ? starMask[p] / 255 : 0;
    for (let c = 0; c < 3; c++) {
      const original = src[i + c];
      const background = base.data[i + c];
      const starSignal = Math.max(0, original - background) * s;
      starless[i + c] = clamp255(original - starSignal);
      stars[i + c] = clamp255(starSignal * 2.4);
    }
    starless[i + 3] = src[i + 3];
    stars[i + 3] = 255;
  }

  state.starless = new ImageData(starless, state.w, state.h);
  state.starLayer = new ImageData(stars, state.w, state.h);
}

function makeStarlessPreview() {
  separateStarLayers();
  return state.starless || state.edited;
}

function makeStarLayerPreview() {
  separateStarLayers();
  return state.starLayer || state.edited;
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
  const samples = [];

  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]) / 255;
    lum[p] = l;
    if (p % 6 === 0) samples.push(l);
  }
  samples.sort((a, b) => a - b);
  const q45 = percentileSorted(samples, 0.45) || 0;
  const q92 = percentileSorted(samples, 0.92) || 1;
  const star = ensureMask('stars');
  const bg = ensureMask('background');
  const broad = blurScalar(lum, w, h, Math.max(9, Math.round(Math.min(w, h) / 90)));
  const hint = state.userHint;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const notStar = 1 - (star?.[p] || 0) / 255;
      const notBackground = 1 - (bg?.[p] || 0) / 255;
      const broadSignal = clamp01((broad[p] - q45) / Math.max(0.02, q92 - q45));
      let hintWeight = 1;
      if (hint) {
        const dx = x - hint.x, dy = y - hint.y;
        hintWeight = clamp01(1 - Math.sqrt(dx * dx + dy * dy) / Math.max(30, hint.radius));
        hintWeight = 0.45 + hintWeight * 0.75;
      }
      const score = notBackground * notStar * broadSignal * hintWeight;
      mask[p] = score > 0.08 ? clamp255(score * 255) : 0;
    }
  }
  return featherMask(cleanMask(mask, w, h, 1), w, h, Number(els.maskFeather.value));
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
  const q = samples[Math.floor(samples.length * 0.975)] || 0.75;
  const broad = blurScalar(lum, w, h, 5);
  const mask = new Uint8ClampedArray(w * h);
  for (let p = 0; p < lum.length; p++) {
    const pointLike = lum[p] - broad[p];
    if (lum[p] > q || pointLike > 0.06) mask[p] = clamp255((Math.max(lum[p] - q, pointLike) / 0.16) * 255);
  }
  return featherMask(dilateMask(mask, w, h, 2), w, h, 2);
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

function ensureMask(mask) {
  if (!state.original || mask === 'none') return null;
  if (state.masks[mask]) return state.masks[mask];
  if (mask === 'stars') state.masks.stars = createStarMask();
  if (mask === 'background') state.masks.background = createBackgroundMask(ensureMask('stars'));
  if (mask === 'target') state.masks.target = createTargetMask();
  return state.masks[mask];
}

function getActiveMask() {
  if (state.activeMask === 'none') return null;
  return ensureMask(state.activeMask);
}

function setActiveMask(mask) {
  state.activeMask = mask;
  ensureMask(mask);
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

function activateTool(tool) {
  document.querySelectorAll('[data-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tool));
  document.querySelector('.workspace')?.classList.toggle('view-only', tool === 'view');
}
document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => activateTool(btn.dataset.tool)));
els.languageSelect.addEventListener('change', () => applyLanguage(els.languageSelect.value));

els.autoTargetBtn.addEventListener('click', () => { if (state.original) { state.masks.target = createTargetMask(); setActiveMask('target'); els.showMask.checked = true; } });
els.autoBgBtn.addEventListener('click', () => { if (state.original) { state.masks.background = createBackgroundMask(); setActiveMask('background'); els.showMask.checked = true; } });
els.autoStarsBtn.addEventListener('click', () => { if (state.original) { state.masks.stars = createStarMask(); setActiveMask('stars'); els.showMask.checked = true; } });
els.separateStarsBtn.addEventListener('click', () => { if (state.original) { separateStarLayers(); setView('starless'); activateTool('view'); } });

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
    const base = (state.file?.name || 'choco-astro-studio').replace(/\.[^.]+$/, '');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}_edited.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }, type, quality);
}

function setView(view) {
  state.view = view;
  [els.viewEdited, els.viewOriginal, els.viewCompare, els.viewStarless, els.viewStars].forEach(b => b.classList.remove('active'));
  if (view === 'edited') els.viewEdited.classList.add('active');
  if (view === 'original') els.viewOriginal.classList.add('active');
  if (view === 'compare') els.viewCompare.classList.add('active');
  if (view === 'starless') els.viewStarless.classList.add('active');
  if (view === 'stars') els.viewStars.classList.add('active');
  drawCanvas();
}
els.viewEdited.addEventListener('click', () => setView('edited'));
els.viewOriginal.addEventListener('click', () => setView('original'));
els.viewCompare.addEventListener('click', () => setView('compare'));
els.viewStarless.addEventListener('click', () => setView('starless'));
els.viewStars.addEventListener('click', () => setView('stars'));

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

applyLanguage();
syncControls();
activateTool('view');
