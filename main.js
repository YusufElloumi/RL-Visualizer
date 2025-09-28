import * as THREE from 'three';

// CONFIG
const DISCIPLINES = [
  'piling',
  'structural_steel',
  'piping',
  'equipment',
  'instrumentation',
  'cable_tray',
  'electrical',
  'insulation'
];

const disciplineColors = {
  piling: '#00D4FF',
  structural_steel: '#FF3B3B',
  piping: '#00C853',
  equipment: '#FF9800',
  instrumentation: '#9C27B0',
  cable_tray: '#9E9E9E',
  electrical: '#FFEB3B',
  insulation: '#FFFFFF'
};

const chartSize = 10;
const offset = 0.5;

// THREE SETUP
let scene, camera, renderer;

/** Initialize Three.js scene, camera, renderer and visual elements. */
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(15, 10, 15);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('mousemove', onMouseMove);

  addOrbitControls();
  ensureLabelsContainer();

  addGridLines('y');
  addGridLines('x');
  addGridLines('z');
  addGridLabels();
  addAxisEndLabels();

  // Create the chart once; it will update during playback
  window.blocksChart = new PlacementChart();
  if (window.simulation?.timeSeconds != null) {
    window.blocksChart.setSimTimeGetter?.(() => window.simulation.timeSeconds);
  }

  addUI();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// GRID LINES & LABELS
/** Add grid lines on a plane defined by axis ('x' | 'y' | 'z'). */
function addGridLines(axis) {
  const positions = [...Array(10).keys()];
  const mat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.7 });

  if (axis === 'y') {
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-chartSize/2 , -chartSize/2, p - chartSize/2),
        new THREE.Vector3(chartSize/2, -chartSize/2, p - chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p - chartSize/2, -chartSize/2, -chartSize/2),
        new THREE.Vector3(p - chartSize/2, -chartSize/2, chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
  } else if (axis === 'x') {
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-chartSize/2, -chartSize/2, p - chartSize/2),
        new THREE.Vector3(-chartSize/2, chartSize/2, p - chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-chartSize/2, p - chartSize/2, -chartSize/2),
        new THREE.Vector3(-chartSize/2, p - chartSize/2, chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
  } else if (axis === 'z') {
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p - chartSize/2, -chartSize/2, -chartSize/2),
        new THREE.Vector3(p - chartSize/2, chartSize/2, -chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
    positions.forEach(p => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-chartSize/2, p - chartSize/2, -chartSize/2),
        new THREE.Vector3(chartSize/2, p - chartSize/2, -chartSize/2)
      ]);
      scene.add(new THREE.Line(g, mat));
    });
  }
}

/** Create numeric labels (0–9) for each axis. */
function addGridLabels() {
  const positions = [...Array(10).keys()];
  const container = document.getElementById('labels-container');
  if (!container) return;

  positions.forEach(pos => {
    const xLabel = document.createElement('div');
    const yLabel = document.createElement('div');
    const zLabel = document.createElement('div');
    xLabel.className = yLabel.className = zLabel.className = 'grid-label';
    xLabel.textContent = String(pos);
    yLabel.textContent = String(pos);
    zLabel.textContent = String(pos);
    container.appendChild(xLabel);
    container.appendChild(yLabel);
    container.appendChild(zLabel);

    const worldX = new THREE.Vector3(pos - chartSize/2 + offset, -chartSize/2 - 0.02, -chartSize/2);
    const worldY = new THREE.Vector3(-chartSize/2, -chartSize/2 - 0.02, pos - chartSize/2 + offset);
    const worldZ = new THREE.Vector3(-chartSize/2 - 0.02, pos - chartSize/2 + offset, -chartSize/2);

    if (!window.gridLabels) window.gridLabels = [];
    window.gridLabels.push({ x: xLabel, y: yLabel, z: zLabel, pos, worldX, worldY, worldZ });
  });
}

/** Reproject labels each frame. */
function updateGridLabels() {
  if (!window.gridLabels || !camera || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();

  window.gridLabels.forEach(item => {
    [['x','worldX'], ['y','worldY'], ['z','worldZ']].forEach(([key, worldKey]) => {
      const el = item[key];
      const world = item[worldKey].clone();
      world.project(camera);
      if (world.z < -1 || world.z > 1) { el.style.display = 'none'; return; }
      const x = (world.x + 1)/2 * rect.width + rect.left;
      const y = (1 - world.y)/2 * rect.height + rect.top;
      el.style.display = 'block';
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    });
  });
}

/** Minimal orbit-like camera controls (drag/pan + wheel zoom). */
function addOrbitControls() {
  let mouseDown = false, mouseX = 0, mouseY = 0;
  let targetRotationX = 0, targetRotationY = 0, rotationX = 0, rotationY = 0;

  renderer.domElement.addEventListener('mousedown', e => { mouseDown = true; mouseX = e.clientX; mouseY = e.clientY; });
  renderer.domElement.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    const dx = e.clientX - mouseX; const dy = e.clientY - mouseY;
    targetRotationY += dx * 0.01; targetRotationX += dy * 0.01;
    mouseX = e.clientX; mouseY = e.clientY;
  });
  renderer.domElement.addEventListener('mouseup', () => { mouseDown = false; });
  renderer.domElement.addEventListener('wheel', e => {
    camera.position.multiplyScalar(e.deltaY > 0 ? 1.1 : 0.9);
    camera.position.clampLength(5, 200);
  });

  window.updateCamera = () => {
    rotationX += (targetRotationX - rotationX) * 0.05;
    rotationY += (targetRotationY - rotationY) * 0.05;
    const d = camera.position.length();
    camera.position.x = d * Math.sin(rotationY) * Math.cos(rotationX);
    camera.position.y = d * Math.sin(rotationX);
    camera.position.z = d * Math.cos(rotationY) * Math.cos(rotationX);
    camera.lookAt(0, 0, 0);
  };
}

/** Ensure the labels container exists. */
function ensureLabelsContainer() {
  let c = document.getElementById('labels-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'labels-container';
    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    c.style.pointerEvents = 'none';
    document.body.appendChild(c);
  }
  return c;
}

/** Add axis end labels (x/y/z). */
function addAxisEndLabels() {
  const container = ensureLabelsContainer();
  const mk = (txt) => {
    const el = document.createElement('div');
    el.className = 'axis-label';
    el.textContent = txt;
    el.style.cssText = `position:absolute;font:700 14px/1.2 Arial;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7);background:rgba(0,0,0,.35);padding:2px 6px;border-radius:6px;pointer-events:none;transform:translate(-50%,-50%)`;
    container.appendChild(el);
    return el;
  };

  const pad = 0.35;
  const worldXEnd = new THREE.Vector3( chartSize/2 + pad, -chartSize/2 - 0.02, -chartSize/2 );
  const worldYEnd = new THREE.Vector3( -chartSize/2, -chartSize/2 - 0.02,  chartSize/2 + pad );
  const worldZEnd = new THREE.Vector3( -chartSize/2 - 0.02,  chartSize/2 + pad, -chartSize/2 );

  window.axisEndLabels = {
    x: { el: mk('x'), world: worldXEnd },
    y: { el: mk('y'), world: worldYEnd },
    z: { el: mk('z'), world: worldZEnd },
  };
}

/** Reproject axis end labels each frame. */
function updateAxisEndLabels() {
  if (!window.axisEndLabels || !camera || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();

  for (const k of ['x','y','z']) {
    const { el, world } = window.axisEndLabels[k];
    const p = world.clone().project(camera);
    if (p.z < -1 || p.z > 1) { el.style.display = 'none'; continue; }
    const sx = (p.x + 1) / 2 * rect.width + rect.left;
    const sy = (1 - p.y) / 2 * rect.height + rect.top;
    el.style.display = 'block';
    el.style.left = `${Math.round(sx)}px`;
    el.style.top  = `${Math.round(sy)}px`;
  }
}

// HOVER INSPECTOR
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const hoverTip = document.createElement('div');
hoverTip.style.cssText = 'position:absolute;padding:6px 8px;background:rgba(0,0,0,.85);color:#fff;border-radius:6px;font:12px/1.2 Arial;pointer-events:none;display:none;z-index:20;';
document.body.appendChild(hoverTip);

/** Mouse move handler for hover raycasting + tooltip. */
function onMouseMove(e) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  hoverTip.style.left = `${e.clientX + 12}px`;
  hoverTip.style.top  = `${e.clientY + 12}px`;
}

// DATA MODEL
// Cell store: key "x,y,z" (USER coords) -> { mesh, counts:{disc->done}, req:{disc->need}, coord }
const cellMap = new Map();

/** Key for cell coordinates. */
function cellKey(x,y,z){ return `${x},${y},${z}`; }

// Episode data
let ACTIONS = [];              // recorded_actions: [step][k] index or no-op
let VALID = {};                // { discKey: [ [[x,y,z], req] ] } (USER coords)
let REQMAP = {};               // { discKey: { "x,y,z": req } }
let NOOP_INDEX = {};           // { discKey: validLen }

// placement-by-placement timeline
let currentTick = 0;           // 0..(steps*8 - 1)
let playing = false;
let fps = 6;
let slicePredicate = null;     // function(x,y,z) -> boolean

// Shared geometry
const CUBE_GEO = new THREE.BoxGeometry(1,1,1);
const EDGE_GEO = new THREE.EdgesGeometry(CUBE_GEO);

/** Build a vertical banded texture from discipline mix. */
function makeBandTexture(mixArray, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');

  const SEP = Math.max(1, Math.floor(size / 256));
  const DARK = 'rgba(0,0,0,0.85)', LIGHT = 'rgba(255,255,255,0.85)';

  let y = 0;
  for (let i = 0; i < mixArray.length; i++) {
    const { w, color } = mixArray[i];
    const h = Math.round(size * w);
    ctx.fillStyle = color;
    ctx.fillRect(0, y, size, i === mixArray.length - 1 ? size - y : h);

    if (i < mixArray.length - 1) {
      const sepY = y + h;
      ctx.fillStyle = DARK;  ctx.fillRect(0, sepY, size, SEP);
      ctx.fillStyle = LIGHT; ctx.fillRect(0, sepY + 1, size, Math.max(1, SEP - 1));
    }
    y += h;
  }
  ctx.fillStyle = DARK;  ctx.fillRect(0, 0, size, SEP);
  ctx.fillStyle = LIGHT; ctx.fillRect(0, size - SEP, size, SEP);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Convert counts map -> sorted mix array. */
function countsToMix(counts){
  const entries = Object.entries(counts || {}).filter(([,n]) => n>0);
  const total = entries.reduce((s,[,n]) => s+n, 0);
  if (!entries.length) return [];
  return entries
    .sort(([a],[b]) => DISCIPLINES.indexOf(a) - DISCIPLINES.indexOf(b))
    .map(([disc,n]) => ({ disc, w: n/total, color: disciplineColors[disc] || '#888'}));
}

/** Material for a cell based on its counts. */
function materialForCounts(counts) {
  const mix = countsToMix(counts);
  if (!mix.length) return new THREE.MeshBasicMaterial({ color: 0x808080, toneMapped: false });
  const map = makeBandTexture(mix, 512);
  return new THREE.MeshBasicMaterial({ map, color: 0xffffff, toneMapped: false });
}

/** Completion -> brightness (darker = more complete). */
function brightnessForCompletion(completion){
  return 1.0 - 0.55 * Math.max(0, Math.min(1, completion));
}

// UI
/** Build the UI panel and wire controls. */
function addUI() {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;left:20px;top:20px;background:rgba(0,0,0,.8);color:#fff;padding:10px;border-radius:8px;font:13px Arial;z-index:10;width:560px;';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;">
      <button id="btnPrev">⟨</button>
      <button id="btnPlay">Play</button>
      <button id="btnNext">⟩</button>
      <span id="stepLabel" style="flex:1 1 auto; min-width:160px; margin-left:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Step: 0 / 0</span>
      <div style="flex:0 0 auto; display:flex; align-items:center; gap:6px; white-space:nowrap;">
        <span>FPS</span>
        <input id="fpsInput" type="number" min="1" max="60" value="6" style="width:56px;">
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;">
      <label style="display:flex;gap:6px;align-items:center;">
        <span style="opacity:.9;">Valid</span>
        <input id="valid-file-input" type="file">
      </label>
      <label style="display:flex;gap:6px;align-items:center;">
        <span style="opacity:.9;">Recorded actions</span>
        <input id="actions-file-input" type="file">
      </label>
      <button id="btnTargetPreview" style="margin-left:auto;">Render Target Preview</button>
      <span id="uploadStatus" style="opacity:.9;"></span>
    </div>
    <input id="stepSlider" type="range" min="0" max="0" value="0" style="width:100%;margin-top:8px;">
    <div style="margin-top:8px;">
      <b>Slice filter</b> <span style="opacity:.8;">(e.g., <i>x&gt;4</i>, <i>x&gt;=2 &amp;&amp; z&lt;5</i>, <i>(x+y+z)%2==0</i>)</span><br>
      <input id="sliceInput" type="text" placeholder="x>4" style="width:100%;margin-top:4px;">
      <div style="margin-top:6px;display:flex;gap:6px;">
        <button id="btnApplySlice">Apply</button>
        <button id="btnClearSlice">Clear</button>
        <label style="margin-left:auto;display:flex;gap:6px;align-items:center;">
          <input type="checkbox" id="chkCompletion" checked>
          <span>Completion shading</span>
        </label>
      </div>
    </div>
    <div id="legend" style="margin-top:10px;background:rgba(255,255,255,.05);padding:8px;border-radius:6px;max-height:200px;overflow:auto;"></div>
  `;
  document.body.appendChild(panel);

  // Bottom-right Target Preview Dock (zoom/pan)
  const dock = document.createElement('div');
  dock.id = 'targetPreviewDock';
  dock.style.cssText = `position:fixed;right:20px;bottom:20px;width:360px;max-width:40vw;background:rgba(0,0,0,.85);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;z-index:50;display:none;box-shadow:0 8px 24px rgba(0,0,0,.35);`;
  dock.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
    <div style="opacity:.9;">Target Preview</div>
    <div style="display:flex;gap:6px;">
      <button id="btnRefreshPreview" title="Re-render">↻</button>
      <button id="btnHidePreview" title="Hide">✕</button>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:6px;justify-content:flex-end;">
    <button id="zoomOutBtn" title="Zoom out">−</button>
    <button id="zoomInBtn"  title="Zoom in">+</button>
    <button id="zoomResetBtn" title="Reset view">Reset</button>
  </div>
  <div id="previewViewport" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:6px;position:relative;overflow:hidden;height:260px;cursor:grab;">
    <img id="targetPreview" alt="target preview" style="display:none;position:absolute;left:0;top:0;max-width:none;max-height:none;image-rendering:pixelated;transform-origin:0 0;will-change:transform;">
  </div>`;

  // Zoom/Pan wiring
  const viewport = dock.querySelector('#previewViewport');
  const img      = dock.querySelector('#targetPreview');
  const zoomIn   = dock.querySelector('#zoomInBtn');
  const zoomOut  = dock.querySelector('#zoomOutBtn');
  const zoomReset= dock.querySelector('#zoomResetBtn');

  let scale = 1, minScale = 1, maxScale = 8;
  let tx = 0, ty = 0;
  let dragging = false, sx = 0, sy = 0;

  const applyTransform = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const contentSize = () => ({ w: (img.naturalWidth||0)*scale, h: (img.naturalHeight||0)*scale });

  function fitToViewport() {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const sFit = Math.min(vw / img.naturalWidth, vh / img.naturalHeight);
    minScale = scale = sFit;
    const { w, h } = contentSize();
    tx = (vw - w) * 0.5; ty = (vh - h) * 0.5;
    applyTransform();
  }
  function clampPan() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const { w, h } = contentSize();
    if (w <= vw) tx = (vw - w) * 0.5; else { const minX = vw - w, maxX = 0; tx = Math.min(maxX, Math.max(minX, tx)); }
    if (h <= vh) ty = (vh - h) * 0.5; else { const minY = vh - h, maxY = 0; ty = Math.min(maxY, Math.max(minY, ty)); }
  }
  function zoomAt(clientX, clientY, factor) {
    const prev = scale;
    const next = Math.max(minScale, Math.min(maxScale, scale * factor));
    if (next === prev) return;
    const rect = viewport.getBoundingClientRect();
    const cx = clientX - rect.left - tx;
    const cy = clientY - rect.top  - ty;
    scale = next;
    tx -= cx * (scale / prev - 1);
    ty -= cy * (scale / prev - 1);
    clampPan();
    applyTransform();
  }
  viewport.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp((-e.deltaY) * 0.0015)); }, { passive: false });
  viewport.addEventListener('mousedown', (e) => { if (img.style.display === 'none') return; dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; viewport.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', (e) => { if (!dragging) return; tx = e.clientX - sx; ty = e.clientY - sy; clampPan(); applyTransform(); });
  window.addEventListener('mouseup', () => { dragging = false; viewport.style.cursor = 'grab'; });
  zoomIn?.addEventListener('click', () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width/2, r.top + r.height/2, 1.2); });
  zoomOut?.addEventListener('click', () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width/2, r.top + r.height/2, 1/1.2); });
  zoomReset?.addEventListener('click', () => fitToViewport());
  function showAndFit() { if (!img) return; img.style.display = 'block'; requestAnimationFrame(fitToViewport); }
  img.addEventListener('load', showAndFit);
  if (img.complete && img.naturalWidth) showAndFit();
  new ResizeObserver(() => fitToViewport()).observe(viewport);
  document.body.appendChild(dock);

  // Transport + controls
  document.getElementById('btnPrev').addEventListener('click', () => goToTick(Math.max(0, currentTick-1)));
  document.getElementById('btnNext').addEventListener('click', () => goToTick(Math.min(timelineLength()-1, currentTick+1)));
  document.getElementById('btnPlay').addEventListener('click', togglePlay);
  document.getElementById('stepSlider').addEventListener('input', e => goToTick(parseInt(e.target.value,10)));
  document.getElementById('fpsInput').addEventListener('change', e => fps = Math.max(1, Math.min(60, parseInt(e.target.value,10) || 6)));
  document.getElementById('btnApplySlice').addEventListener('click', () => setSlice(document.getElementById('sliceInput').value));
  document.getElementById('btnClearSlice').addEventListener('click', () => { document.getElementById('sliceInput').value=''; setSlice(''); });
  document.getElementById('chkCompletion').addEventListener('change', () => refreshAllMaterials());

  // File uploads
  const validInput   = panel.querySelector('#valid-file-input');
  const actionsInput = panel.querySelector('#actions-file-input');
  const statusEl     = panel.querySelector('#uploadStatus');
  const previewImg   = dock.querySelector('#targetPreview');

  let uploadedValid = null;
  let uploadedActs  = null;

  const setStatus = (msg, ok=true) => { statusEl.textContent = msg; statusEl.style.color = ok ? '#a9f3a9' : '#ff9b9b'; };

  async function handleValidFile(file) {
    try { const txt = await file.text(); uploadedValid = parseValidText(txt); setStatus(`Loaded valid: ${file.name}`); maybeLoadEpisode(); }
    catch (err) { console.error('Valid parse error:', err); setStatus(`Valid parse error: ${err.message}`, false); }
  }
  async function handleActionsFile(file) {
    try { const txt = await file.text(); uploadedActs = parseRecordedActionsText(txt); setStatus(`Loaded actions: ${file.name}`); maybeLoadEpisode(); }
    catch (err) { console.error('Actions parse error:', err); setStatus(`Actions parse error: ${err.message}`, false); }
  }
  function maybeLoadEpisode() {
    if (!uploadedValid || !uploadedActs) return;
    loadEpisodeData(uploadedActs, uploadedValid);
    goToTick(0);
    renderLegend(0);
    updateUIForEpisode();
    setStatus(`Episode ready — ${ACTIONS.length} steps`);
  }
  validInput.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) handleValidFile(f); });
  actionsInput.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) handleActionsFile(f); });

  // Preview controls
  document.getElementById('btnTargetPreview').addEventListener('click', async () => {
    if (!ACTIONS?.length) { alert('Load actions first.'); return; }
    dock.style.display = 'block';
    const url = await captureTargetPng();
    if (url) { previewImg.src = url; previewImg.style.display = 'block'; }
  });
  dock.querySelector('#btnRefreshPreview').addEventListener('click', async () => {
    if (!ACTIONS?.length) { alert('Load actions first.'); return; }
    const url = await captureTargetPng();
    if (url) { previewImg.src = url; previewImg.style.display = 'block'; }
  });
  dock.querySelector('#btnHidePreview').addEventListener('click', () => { dock.style.display = 'none'; });
}

// LINE CHART: Blocks placed vs simulated time
class PlacementChart {
  constructor(opts = {}) {
    this.width = opts.width || 650;
    this.height = opts.height || 400;
    this.padding = { l: 40, r: 12, t: 16, b: 28 };
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.series = new Map(); // discipline -> { color, data:[{t,y}], total }
    this.maxY = 1;
    this.maxT = 0;

    this.seen = new Set(); // de-dupe keys (e.g., `tick:disc` or `step:n`)

    this.playing = false;
    this.accTime = 0;        // x-axis seconds
    this.lastReal = null;    // wall-clock seconds

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute', right: '16px', top: '16px',
      background: 'rgba(18,18,18,0.8)', borderRadius: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,.35)', padding: '8px',
      pointerEvents: 'auto', backdropFilter: 'blur(6px)', zIndex: 10000
    });

    this.title = document.createElement('div');
    this.title.textContent = 'Graph of resource intensity, per resource type';
    Object.assign(this.title.style, { color: '#fff', font: '600 12px/1.2 system-ui, Arial', margin: '4px 6px 6px' });
    this.root.appendChild(this.title);

    this.legend = document.createElement('div');
    Object.assign(this.legend.style, { display: 'flex', flexWrap: 'wrap', gap: '6px 10px', margin: '0 6px 6px', alignItems: 'center' });
    this.root.appendChild(this.legend);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx = this.canvas.getContext('2d');
    this.root.appendChild(this.canvas);

    document.body.appendChild(this.root);

    this._initAllDisciplines();
  }

  /** Add one point per discipline for a step, using totals per discipline. */
  logStepTotals(step, totals) {
    const key = `step:${step}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);

    const t = this.now();
    for (const disc of DISCIPLINES) {
      const inc = (totals && totals[disc]) || 0;
      const s = this.ensureDiscipline(disc);
      if (inc !== 0) s.total += inc;
      s.data.push({ t, y: s.total });
      this.maxY = Math.max(this.maxY, s.total);
    }
    this.maxT = Math.max(this.maxT, t);
  }

  /** External play/pause control. */
  setPlaying(isPlaying) {
    this.playing = !!isPlaying;
    this.lastReal = performance.now() / 1000; // snap clock
  }

  /** Reset chart data. */
  reset(opts = {}) {
    const { clearClock = false, clearSeen = true } = opts;
    this.series.clear();
    this.legend.innerHTML = '';
    this.maxY = 1;
    this.maxT = clearClock ? 0 : this.maxT;
    if (clearClock) { this.accTime = 0; this.lastReal = null; }
    if (clearSeen) this.seen.clear();
    this._initAllDisciplines();
  }

  /** Pre-seed zero entries + legend for all disciplines. */
  _initAllDisciplines() {
    (DISCIPLINES || []).forEach(disc => {
      if (this.series.has(disc)) return;
      const color = (disciplineColors && disciplineColors[disc]) || '#888';
      const entry = { color, data: [{ t: this.now(), y: 0 }], total: 0 };
      this.series.set(disc, entry);

      const chip = document.createElement('div');
      chip.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle;"></span>${disc}`;
      Object.assign(chip.style, { color:'#fff', font:'500 11px/1 system-ui, Arial' });
      this.legend.appendChild(chip);
    });
  }

  /** Ensure series exists for a discipline. */
  ensureDiscipline(discipline) {
    if (this.series.has(discipline)) return this.series.get(discipline);
    const color = (disciplineColors && disciplineColors[discipline]) || '#888';
    const entry = { color, data: [{ t: this.now(), y: 0 }], total: 0 };
    this.series.set(discipline, entry);

    const chip = document.createElement('div');
    chip.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle;"></span>${discipline}`;
    Object.assign(chip.style, { color:'#fff', font:'500 11px/1 system-ui, Arial' });
    this.legend.appendChild(chip);

    return entry;
  }

  /** Advance simulated clock only while playing. */
  _updateClock() {
    const realNow = performance.now() / 1000;
    if (this.lastReal == null) this.lastReal = realNow;
    if (this.playing) {
      const dt = Math.max(0, realNow - this.lastReal);
      this.accTime += dt;
      this.maxT = Math.max(this.maxT, this.accTime);
    }
    this.lastReal = realNow;
  }

  /** Current simulated time. */
  now() { return this.accTime; }

  /** Stamp a placement for a single discipline at current time. */
  logBlockPlaced(discipline, uniqueId) {
    if (uniqueId && this.seen.has(uniqueId)) return;
    if (uniqueId) this.seen.add(uniqueId);
    const s = this.ensureDiscipline(discipline);
    s.total += 1;
    const t = this.now();
    s.data.push({ t, y: s.total });
    this.maxY = Math.max(this.maxY, s.total);
    this.maxT = Math.max(this.maxT, t);
  }

  /** Keep each line flat up to now. */
  tick() {
    const t = this.now();
    for (const s of this.series.values()) {
      if (s.data.length === 0 || s.data[s.data.length - 1].t !== t) s.data.push({ t, y: s.total });
    }
    this.maxT = Math.max(this.maxT, t);
  }

  // Rendering
  renderAxes(ctx, W, H, pad) {
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(0.5, 0.5);

    const x0 = pad.l, y0 = H - pad.b, x1 = W - pad.r, y1 = pad.t;

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);

    ctx.fillStyle = '#fff';
    ctx.font = '11px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Simulation Time (s)', (x0 + x1) / 2, H - 6);

    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Manhours utilized per Discipline', 0, 0);
    ctx.restore();

    const xTicks = 5, yTicks = 4;
    for (let i = 0; i <= xTicks; i++) {
      const x = x0 + (i / xTicks) * (x1 - x0);
      const t = (i / xTicks) * Math.max(1e-6, this.maxT);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(String(Math.round(t)), x, y0 + 16);
    }
    for (let i = 0; i <= yTicks; i++) {
      const v = (i / yTicks) * this.maxY;
      const y = y0 - (i / yTicks) * (y0 - y1);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(v)), x0 - 6, y + 3);
    }

    ctx.restore();
  }

  renderLines(ctx, W, H, pad) {
    const x0 = pad.l, y0 = H - pad.b, x1 = W - pad.r, y1 = pad.t;
    const xScale = (t) => x0 + (t / Math.max(1e-6, this.maxT)) * (x1 - x0);
    const yScale = (y) => y0 - (y / Math.max(1e-6, this.maxY)) * (y0 - y1);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.lineWidth = 2;

    for (const s of this.series.values()) {
      const pts = s.data; if (pts.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(xScale(pts[0].t), yScale(pts[0].y));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(xScale(pts[i].t), yScale(pts[i].y));
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Draw chart (advances time only when playing). */
  render() {
    this._updateClock();
    this.tick();
    const W = this.width, H = this.height, pad = this.padding;
    this.renderAxes(this.ctx, W, H, pad);
    this.renderLines(this.ctx, W, H, pad);
  }
}

// TARGET PNG CAPTURE
/** Compute final per-cell counts from ACTIONS/VALID/REQMAP (USER coords). */
function computeFinalState() {
  const state = new Map(); // key -> { coord:[x,y,z], counts:{disc:n}, req:{disc:need} }
  for (let step = 0; step < ACTIONS.length; step++) {
    const row = ACTIONS[step]; if (!Array.isArray(row)) continue;
    for (let k = 0; k < DISCIPLINES.length; k++) {
      const disc = DISCIPLINES[k];
      const arr  = VALID[disc] || [];
      const noop = NOOP_INDEX[disc] ?? arr.length;
      const a    = row[k];
      if (!Number.isFinite(a) || a === noop) continue;
      if (a < 0 || a >= arr.length) continue;
      const ent   = arr[a];
      const coord = Array.isArray(ent?.[0]) ? ent[0] : ent;
      if (!Array.isArray(coord) || coord.length !== 3) continue;
      const key = coord.join(',');
      let cell = state.get(key);
      if (!cell) { cell = { coord: coord.slice(0,3), counts: {}, req: {} }; state.set(key, cell); }
      cell.counts[disc] = (cell.counts[disc] || 0) + 1;
      const need = REQMAP[disc]?.[key];
      if (need !== undefined && cell.req[disc] === undefined) cell.req[disc] = need;
    }
  }
  return state;
}

/** Overall completion for a counts/req pair. */
function completionFor(counts, req) {
  let doneSum = 0, needSum = 0;
  for (const d of Object.keys(counts)) {
    const done = counts[d] || 0;
    const need = req[d];
    if (Number.isFinite(need) && need > 0) { needSum += need; doneSum += Math.min(done, need); }
  }
  return needSum > 0 ? doneSum / needSum : 0;
}

/** Build a minimal scene containing final cells only. */
function buildTargetSceneFromState(state) {
  const targetScene = new THREE.Scene();
  targetScene.background = new THREE.Color(0xffffff);
  for (const [, cell] of state) {
    const mat = materialForCounts(cell.counts);
    const comp = completionFor(cell.counts, cell.req);
    mat.color.setScalar(brightnessForCompletion(comp));

    const mesh = new THREE.Mesh(CUBE_GEO, mat);
    const outline = new THREE.LineSegments(EDGE_GEO, new THREE.LineBasicMaterial({ color: 0x000000 }));
    mesh.add(outline);

    const [xu, yu, zu] = cell.coord;
    const sx = xu + offset, sy = zu + offset, sz = yu + offset;
    mesh.position.set(sx - chartSize/2, sy - chartSize/2, sz - chartSize/2);
    targetScene.add(mesh);
  }
  return targetScene;
}

/** Render a scene with a camera to PNG dataURL (offscreen). */
async function renderSceneToPng(sceneToRender, cameraLike, width = 1600, height = 1000) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height; canvas.style.cssText = 'position:absolute;left:-99999px;top:-99999px;opacity:0;';
  document.body.appendChild(canvas);

  const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, canvas, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  offscreenRenderer.setSize(width, height, false);

  const cam = new THREE.PerspectiveCamera(cameraLike.fov, width / height, cameraLike.near, cameraLike.far);
  cam.position.copy(cameraLike.position);
  cam.quaternion.copy(cameraLike.quaternion);
  cam.updateProjectionMatrix();
  cam.lookAt(0, 0, 0);

  offscreenRenderer.render(sceneToRender, cam);
  const url = canvas.toDataURL('image/png');
  offscreenRenderer.dispose();
  canvas.remove();
  return url;
}

/** Compute final, build scene, render, return PNG data URL. */
async function captureTargetPng() {
  try {
    const state = computeFinalState();
    const targetScene = buildTargetSceneFromState(state);
    return await renderSceneToPng(targetScene, camera, 1600, 1000);
  } catch (e) {
    console.error('Target PNG capture failed:', e);
    alert('Could not render target image. See console for details.');
    return null;
  }
}

/** Trigger download for a data URL. */
function downloadDataUrl(url, filename = 'target.png') {
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

// EPISODE LOADING & REBUILD
/** Normalize valid input into consistent format. */
function normalizeValidInput(validIn) {
  if (Array.isArray(validIn) && validIn.length === 8) {
    const out = {}; for (let i = 0; i < 8; i++) { const disc = DISCIPLINES[i]; const arr = validIn[i] || []; out[disc] = arr.map(item => (Array.isArray(item) && Array.isArray(item[0]) ? [item[0], item[1]] : [item, undefined])); } return out;
  }
  if (validIn && typeof validIn === 'object') {
    const out = {}; for (const disc of DISCIPLINES) { const arr = validIn[disc] || []; out[disc] = arr.map(item => (Array.isArray(item) && Array.isArray(item[0]) ? [item[0], item[1]] : [item, undefined])); } return out;
  }
  const out = {}; DISCIPLINES.forEach(d => out[d] = []); return out;
}

/** Load episode data and initialize visualization. */
function loadEpisodeData(recorded_actions, valid_in) {
  ACTIONS = Array.isArray(recorded_actions) ? recorded_actions.map((row, i) => {
    const r = Array.from(row || []);
    if (r.length !== DISCIPLINES.length) { console.warn(`Step ${i}: expected 8 actions, got ${r.length}. Coercing.`); r.length = DISCIPLINES.length; }
    return r.map(v => Number.isFinite(+v) ? (+v|0) : undefined);
  }) : [];

  VALID = normalizeValidInput(valid_in);

  REQMAP = {}; NOOP_INDEX = {};
  for (const disc of DISCIPLINES) {
    const arr = VALID[disc] || [];
    NOOP_INDEX[disc] = arr.length;
    const req = {};
    for (let i = 0; i < arr.length; i++) {
      const xyz = arr[i][0]; const need = arr[i][1];
      if (Array.isArray(xyz) && xyz.length === 3) req[xyz.join(',')] = Number.isFinite(need) ? need : undefined;
    }
    REQMAP[disc] = req;
  }

  window.blocksChart?.reset({ clearClock: true, clearSeen: true });
  clearAllCells();
  currentTick = 0;
  rebuildUpToTick(currentTick);
  updateUIForEpisode();
  renderLegend(currentTick);
}

/** Remove all cells from scene. */
function clearAllCells() {
  for (const [, cell] of cellMap) {
    if (cell.mesh?.material?.map) cell.mesh.material.map.dispose();
    if (cell.mesh?.material) cell.mesh.material.dispose();
    scene.remove(cell.mesh);
  }
  cellMap.clear();
}

// STEP-BASED PLAYBACK
function timelineLength() { return ACTIONS.length; }

function rebuildUpToTick(tick) {
  clearAllCells();
  for (let step = 0; step <= tick; step++) applyStepOnce(step);
  applySliceVisibility();
}

/** Apply one step worth of placements. */
function applyStepOnce(step) {
  if (!ACTIONS.length) return;
  const row = ACTIONS[step]; if (!Array.isArray(row)) return;
  const stepTotals = {};

  for (let k = 0; k < DISCIPLINES.length; k++) {
    const disc = DISCIPLINES[k];
    const arr  = VALID[disc] || [];
    const noop = NOOP_INDEX[disc] ?? arr.length;
    const a    = row[k];
    if (!Number.isFinite(a) || a === noop) continue;
    if (a < 0 || a >= arr.length) { console.warn(`Step ${step}, ${disc}: idx ${a} OOR`); continue; }

    const ent = arr[a];
    const c   = Array.isArray(ent?.[0]) ? ent[0] : ent;
    if (Array.isArray(c) && c.length === 3) { addWorkAtCell(c[0], c[1], c[2], disc); stepTotals[disc] = (stepTotals[disc] || 0) + 1; }
  }

  if (window.blocksChart) window.blocksChart.logStepTotals(step, stepTotals);
}

/** Update slider/label for current episode. */
function updateUIForEpisode() {
  const slider = document.getElementById('stepSlider');
  const label  = document.getElementById('stepLabel');
  const maxIdx = Math.max(0, timelineLength() - 1);
  const cur    = Math.max(0, Math.min(maxIdx, currentTick|0));
  if (slider) { slider.max = String(maxIdx); slider.value = String(cur); }
  if (label)  label.textContent = `Step ${cur} / ${maxIdx}`;
}

/** Render legend for the current tick. */
function renderLegend(tick) {
  const el = document.getElementById('legend');
  if (!el || ACTIONS.length === 0) { if (el) el.innerHTML=''; return; }
  const step = Math.max(0, Math.min(timelineLength()-1, tick|0));
  const row  = ACTIONS[step] || [];

  const html = DISCIPLINES.map((disc, k) => {
    const valid = VALID[disc] || [];
    const noop  = NOOP_INDEX[disc] ?? valid.length;
    const a     = row[k];
    const sw = `<span style="display:inline-block;width:10px;height:10px;margin-right:6px;background:${disciplineColors[disc]};border:${disc==='insulation'?'1px solid #333':''}"></span>`;
    let body;
    if (!Number.isFinite(a)) body = `<i>missing</i>`;
    else if (a === noop) body = `<i>no-op</i>`;
    else if (a < 0 || a >= valid.length) body = `<i>invalid idx ${a}</i>`;
    else { const tup = valid[a]; const c = Array.isArray(tup?.[0]) ? tup[0] : tup; body = `(${c[0]},${c[1]},${c[2]})`; }
    return `<div>${sw}<b>${disc}</b>: ${body}</div>`;
  }).join('');

  el.innerHTML = `<div style="margin-bottom:6px;"><b>Actions @ step ${step}</b></div>${html}`;
}

// CELL UPDATE / MATERIAL
/** Add work to (x,y,z) in USER coords for a discipline. */
function addWorkAtCell(xu, yu, zu, disc) {
  const key = cellKey(xu, yu, zu);
  let cell = cellMap.get(key);
  if (!cell) {
    const counts = { [disc]: 1 };
    const req = {};
    const r = REQMAP[disc]?.[`${xu},${yu},${zu}`];
    if (r !== undefined) req[disc] = r;

    const mesh = new THREE.Mesh(CUBE_GEO, materialForCounts(counts));
    const outline = new THREE.LineSegments(EDGE_GEO, new THREE.LineBasicMaterial({ color: 0x000000 }));
    mesh.add(outline);

    const sx = xu + offset;
    const sy = zu + offset;
    const sz = yu + offset;
    mesh.position.set(sx - chartSize/2, sy - chartSize/2, sz - chartSize/2);

    scene.add(mesh);
    cell = { mesh, counts, req, coord: {x:xu,y:yu,z:zu} };
    cellMap.set(key, cell);
  } else {
    cell.counts[disc] = (cell.counts[disc] || 0) + 1;
    const r = REQMAP[disc]?.[`${xu},${yu},${zu}`];
    if (r !== undefined && cell.req[disc] === undefined) cell.req[disc] = r;
    const old = cell.mesh.material; if (old?.map) old.map.dispose(); if (old) old.dispose();
    cell.mesh.material = materialForCounts(cell.counts);
  }
  applyCompletionTint(cell);
}

/** Completion ratio for a cell. */
function cellCompletion(cell) {
  const discs = Object.keys(cell.counts);
  let doneSum = 0, needSum = 0;
  discs.forEach(d => {
    const need = cell.req[d];
    const done = cell.counts[d] || 0;
    if (Number.isFinite(need) && need > 0) { needSum += need; doneSum += Math.min(done, need); }
  });
  return needSum <= 0 ? 0 : (doneSum / needSum);
}

/** Apply completion-based tinting to a cell. */
function applyCompletionTint(cell) {
  const chk = document.getElementById('chkCompletion');
  const enabled = !chk || chk.checked;
  const mat = cell.mesh.material; if (!mat) return;
  const comp = cellCompletion(cell);
  mat.color.setScalar(enabled ? brightnessForCompletion(comp) : 1.0);
  mat.needsUpdate = true;
}

/** Refresh materials for all cells (toggle completion shading). */
function refreshAllMaterials() {
  for (const [, cell] of cellMap) applyCompletionTint(cell);
}

// SLICE FILTER (USER coords)
/** Set slice filter expression using x,y,z. */
function setSlice(expr) {
  expr = (expr || '').trim();
  if (!expr) { slicePredicate = null; applySliceVisibility(); return; }
  const safe = /^[\sxyz0-9<>=!&|()%/*+.-]+$/.test(expr);
  if (!safe) { alert('Invalid slice expression. Allowed: x,y,z, numbers and operators.'); return; }
  try { const fn = new Function('x','y','z', `return (${expr});`); fn(0,0,0); slicePredicate = fn; applySliceVisibility(); }
  catch { alert('Could not parse slice expression.'); }
}

/** Apply slice filter to all cells. */
function applySliceVisibility() {
  for (const [, cell] of cellMap) {
    if (!slicePredicate) { cell.mesh.visible = true; continue; }
    const {x,y,z} = cell.coord; cell.mesh.visible = !!slicePredicate(x,y,z);
  }
}

// PLAYBACK CONTROLS
let lastTick = 0;

/** Toggle play/pause. */
function togglePlay(){
  playing = !playing;
  const btn = document.getElementById('btnPlay');
  btn.textContent = playing ? 'Pause' : 'Play';
  window.blocksChart?.setPlaying(playing);
}

/** Jump to a specific tick. */
function goToTick(t){
  const N = timelineLength(); if (N === 0) return;
  t = Math.max(0, Math.min(N - 1, t|0));
  currentTick = t;
  rebuildUpToTick(currentTick);
  updateUIForEpisode();
  renderLegend(currentTick);
  const slider = document.getElementById('stepSlider');
  if (slider) slider.value = String(currentTick);
}

/** Advance timeline based on FPS while playing. */
function advanceIfDue(nowMs){
  const dt = nowMs - lastTick;
  const interval = 1000 / Math.max(1, fps);
  if (!playing || dt < interval) return;
  lastTick = nowMs;
  if (currentTick >= timelineLength() - 1) { togglePlay(); return; }
  goToTick(currentTick + 1);
}

// RENDER LOOP + HOVER PICK
/** Main animation loop. */
function animate(ts=0) {
  requestAnimationFrame(animate);
  if (window.updateCamera) window.updateCamera();
  updateGridLabels();
  updateAxisEndLabels();
  if (window.blocksChart) window.blocksChart.render();

  if (scene && camera && renderer) {
    raycaster.setFromCamera(mouseNDC, camera);
    const meshes = [];
    for (const [, c] of cellMap) if (c.mesh.visible) meshes.push(c.mesh);
    const hits = meshes.length ? raycaster.intersectObjects(meshes, false) : [];
    if (hits.length) {
      const mesh = hits[0].object.type === 'Mesh' ? hits[0].object : hits[0].object.parent;
      let cell = null; for (const [, c] of cellMap) if (c.mesh === mesh) { cell = c; break; }
      if (cell) {
        const comp = (cellCompletion(cell)*100).toFixed(1);
        const rows = Object.keys(cell.counts)
          .sort((a,b)=>DISCIPLINES.indexOf(a)-DISCIPLINES.indexOf(b))
          .map(d=>{
            const done = cell.counts[d]||0;
            const need = cell.req[d];
            const needTxt = Number.isFinite(need) ? ` / ${need}` : '';
            return `<div><span style="display:inline-block;width:10px;height:10px;background:${disciplineColors[d]};margin-right:6px;border:${d==='insulation'?'1px solid #333':''}"></span>${d}: ${done}${needTxt}</div>`;
          }).join('');
        hoverTip.innerHTML = `<b>(${cell.coord.x},${cell.coord.y},${cell.coord.z})</b> – overall ${comp}%<div style="margin-top:4px">${rows||'<i>no work</i>'}</div>`;
        hoverTip.style.display = 'block';
      } else hoverTip.style.display = 'none';
    } else hoverTip.style.display = 'none';
  }

  advanceIfDue(ts);
  renderer.render(scene, camera);
}

// FILE PARSING
/** Parse recorded actions (supports numpy-ish text). */
function parseRecordedActionsText(txt) {
  if (typeof txt !== 'string') throw new Error('recorded_actions: expected text');
  txt = txt.trim()
    .replace(/\barray\s*\(/g, '(')
    .replace(/,\s*dtype\s*=\s*[^)]+/g, '')
    .replace(/\(\s*(\[[^\]]*\])\s*\)/g, '$1');
  if (/^\(\s*\[/.test(txt) && /\]\s*\)$/.test(txt)) txt = txt.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
  if (!/^[\s\[\]0-9,.\-]+$/.test(txt)) throw new Error('recorded_actions: unexpected characters (not a numeric array)');
  const arr = (new Function(`return (${txt});`))();
  if (!Array.isArray(arr) || arr.length === 0 || !Array.isArray(arr[0])) throw new Error('recorded_actions: expected a 2D array (list of 8-length rows)');
  if (arr[0].length !== 8) throw new Error(`recorded_actions: inner length must be 8 (got ${arr[0].length})`);
  for (let i = 0; i < arr.length; i++) {
    if (!Array.isArray(arr[i]) || arr[i].length !== 8) throw new Error(`recorded_actions: row ${i} is not length 8`);
    for (let j = 0; j < 8; j++) {
      const v = Number(arr[i][j]); if (!Number.isFinite(v)) throw new Error(`recorded_actions: non-numeric at [${i}][${j}]`);
      arr[i][j] = v | 0;
    }
  }
  return arr;
}

/** Parse valid placement data (Python-ish -> normalized JS). */
function parseValidText(txt) {
  if (typeof txt !== 'string') throw new Error('valid: expected text');
  txt = txt.trim()
    .replace(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g, '[$1,$2,$3]')
    .replace(/\(\s*(\[[^\]]+\])\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g, '[$1,$2]');
  if (!/^[\s\[\]0-9,.\-]+$/.test(txt)) console.warn('parseValidText: non-numeric artifacts detected; attempting to evaluate anyway');
  const raw = (new Function(`return (${txt});`))();
  if (!Array.isArray(raw) || raw.length !== 8) throw new Error('valid: top-level must be an array of 8 discipline lists');
  const normalized = raw.map((list, i) => {
    if (!Array.isArray(list)) throw new Error(`valid: discipline index ${i} is not a list`);
    return list.map((item, j) => {
      if (Array.isArray(item) && item.length === 2 && Array.isArray(item[0]) && item[0].length === 3) {
        const xyz = item[0].map(n => +n); const req = +item[1]; return [xyz, req];
      }
      if (Array.isArray(item) && item.length === 3) return [item.map(n => +n)];
      if (item && typeof item === 'object' && Array.isArray(item.coord)) { const xyz = item.coord.slice(0,3).map(n => +n); return ('req' in item) ? [xyz, +item.req] : [xyz]; }
      throw new Error(`valid: unexpected entry at [${i}][${j}]`);
    });
  });
  return normalized;
}

/** Expose loader globally. */
window.loadEpisodeData = loadEpisodeData;

// STARTUP
/** Boot the app. */
async function start() {
  initThree();
  animate();
}

start();
