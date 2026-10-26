// Hero scene on a white page: a Sunstruck geodesic core inside a Quiet Shade
// shell, with Sunstruck particle rings orbiting the avatar, and a Quiet Shade
// particle field that drifts and is gently drawn toward the pointer. Particles
// are masked out behind the hero text so nothing sits under the copy.
// No post-processing (no bloom) to keep it light.
import * as THREE from 'three';

const SUN = '#F6CD4C';
const SHADE = '#66676D';
const INK = '#2B2C30';

const POINT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uAttract;
  uniform float uRadius;
  uniform float uAspect;
  uniform float uDrift;
  uniform vec2 uMouse;
  uniform vec4 uMask; // text area in NDC: minX, minY, maxX, maxY
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.21 + aSeed * 40.0) * uDrift;
    p.y += cos(uTime * 0.17 + aSeed * 23.0) * uDrift;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;

    // Gentle attraction toward the pointer, computed in screen space so it
    // feels the same at every depth.
    vec2 ndc = clip.xy / clip.w;
    vec2 d = uMouse - ndc;
    d.x *= uAspect;
    float f = smoothstep(uRadius, 0.0, length(d)) * uAttract;
    d.x /= uAspect;
    ndc += d * f;
    clip.xy = ndc * clip.w;
    gl_Position = clip;

    float depth = -mv.z;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aSeed) / depth;
    float fog = clamp(1.25 - (depth - 5.0) / 14.0, 0.18, 1.0);
    vAlpha = (0.3 + 0.7 * aSeed) * fog + f * 1.6;

    // Fade out anything that would sit behind the hero text.
    float e = 0.05;
    float inX = smoothstep(uMask.x - e, uMask.x, ndc.x) * (1.0 - smoothstep(uMask.z, uMask.z + e, ndc.x));
    float inY = smoothstep(uMask.y - e, uMask.y, ndc.y) * (1.0 - smoothstep(uMask.w, uMask.w + e, ndc.y));
    vAlpha *= 1.0 - inX * inY;
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uRimMix;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // Optional dark rim so Sunstruck dots read on a white page.
    vec3 col = mix(uColor, uRim, smoothstep(0.3, 0.4, d) * uRimMix);
    float a = smoothstep(0.5, 0.42, d) * clamp(vAlpha, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const easeOutBack = (x) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

/**
 * @param {HTMLElement} host   element that receives the canvas (fills the hero)
 * @param {object} opts
 * @param {boolean} opts.reduce        prefers-reduced-motion: render one static frame
 * @param {HTMLElement} [opts.anchor]  element the core is centred on (the avatar slot)
 * @param {HTMLElement} [opts.mask]    element (hero text) that particles must stay out of
 * @param {HTMLElement[]} [opts.watch] extra elements whose size changes move the anchor
 * @param {(x:number,y:number)=>void} [opts.onPointer] pointer position in NDC
 * @param {(fps:number)=>void} [opts.onFps]
 * @param {()=>void} [opts.onLost]     WebGL context lost
 */
export function createHero(host, opts = {}) {
  const { reduce = false, anchor = null, mask: maskEl = null, watch = [], onPointer, onFps, onLost } = opts;

  // Small or low-power devices get fewer particles and a lower pixel ratio.
  const small = window.matchMedia('(max-width: 700px), (max-height: 540px)').matches;
  const nav = window.navigator || {};
  const lowPower = small
    || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4)
    || (nav.deviceMemory && nav.deviceMemory <= 4)
    || (nav.connection && nav.connection.saveData);
  const dpr = window.devicePixelRatio || 1;
  const pixelRatio = Math.min(dpr, lowPower ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({
    antialias: pixelRatio < 2,
    alpha: true,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  const rand = mulberry32(20261026);

  // Uniform objects shared by every point material (same references).
  const shared = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(9, 9) },
    uAspect: { value: 1 },
    uPixelRatio: { value: pixelRatio },
    uRadius: { value: 0.42 },
    uMask: { value: new THREE.Vector4(9, 9, 9, 9) },
    uRim: { value: new THREE.Color(INK) },
  };
  const pointMaterial = (color, size, drift = 0, rim = 0) => new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uRimMix: { value: rim },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: 0 },
      uAttract: { value: 0 },
      uDrift: { value: drift },
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const pointsFrom = (positions, seeds, material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return new THREE.Points(g, material);
  };

  // --- Particle field --------------------------------------------------------
  const FIELD_N = small ? 600 : lowPower ? 1100 : 2000;
  const fPos = new Float32Array(FIELD_N * 3);
  const fSeed = new Float32Array(FIELD_N);
  for (let i = 0; i < FIELD_N; i++) {
    fPos[i * 3] = (rand() * 2 - 1) * 12;
    fPos[i * 3 + 1] = (rand() * 2 - 1) * 7.5;
    fPos[i * 3 + 2] = -11 + rand() * 13;
    fSeed[i] = rand();
  }
  const fieldMat = pointMaterial(SHADE, 24, 0.12);
  const field = pointsFrom(fPos, fSeed, fieldMat);
  scene.add(field);

  // --- Rig: core + rings, positioned on the avatar ------------------------------
  const rig = new THREE.Group();
  scene.add(rig);

  const core = new THREE.Group();
  rig.add(core);

  const icoOuter = new THREE.IcosahedronGeometry(1, 1);
  const outerEdges = new THREE.EdgesGeometry(icoOuter);
  const outerMat = new THREE.LineBasicMaterial({ color: SUN, transparent: true, opacity: 0 });
  const outer = new THREE.LineSegments(outerEdges, outerMat);
  core.add(outer);

  // Quiet Shade structural shell around the Sunstruck core
  const icoInner = new THREE.IcosahedronGeometry(1.12, 0);
  const innerEdges = new THREE.EdgesGeometry(icoInner);
  icoInner.dispose();
  const innerMat = new THREE.LineBasicMaterial({ color: SHADE, transparent: true, opacity: 0 });
  const inner = new THREE.LineSegments(innerEdges, innerMat);
  core.add(inner);

  // Nodes on the outer shell's unique vertices
  const seen = new Set();
  const nodeArr = [];
  const op = icoOuter.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i), y = op.getY(i), z = op.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!seen.has(key)) { seen.add(key); nodeArr.push(x, y, z); }
  }
  icoOuter.dispose();
  const nodeMat = pointMaterial(SUN, 64, 0, 0.7);
  const nodes = pointsFrom(new Float32Array(nodeArr), new Float32Array(nodeArr.length / 3).fill(0.75), nodeMat);
  outer.add(nodes);

  // Orbiting rings: [radius, tiltX, tiltY, speed, count]
  // Radii are in core units; the outermost stays inside the avatar column.
  const RINGS = [
    [1.2, 1.18, 0.25, 0.22, small ? 110 : 170],
    [1.34, 1.42, -0.55, -0.14, small ? 130 : 210],
    [1.48, 0.92, 0.7, 0.09, small ? 150 : 240],
  ];
  const ringMat = pointMaterial(SUN, 46, 0, 0.55);
  const ringLineMat = new THREE.LineBasicMaterial({ color: SHADE, transparent: true, opacity: 0 });
  const spinners = [];
  for (const [r, tx, ty, speed, n] of RINGS) {
    const tilt = new THREE.Group();
    tilt.rotation.set(tx, ty, 0);
    const spin = new THREE.Group();
    spin.userData.speed = speed;
    tilt.add(spin);
    rig.add(tilt);
    spinners.push(spin);

    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.02;
      const rr = r * (1 + (rand() - 0.5) * 0.05);
      pos[i * 3] = Math.cos(a) * rr;
      pos[i * 3 + 1] = Math.sin(a) * rr;
      pos[i * 3 + 2] = (rand() - 0.5) * 0.04;
      seed[i] = i % 29 === 0 ? 1 : 0.2 + rand() * 0.45;
    }
    spin.add(pointsFrom(pos, seed, ringMat));

    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160));
    spin.add(new THREE.Line(lineGeo, ringLineMat));
  }

  // --- Layout ---------------------------------------------------------------
  const anchorPos = new THREE.Vector2();
  let unit = 1;
  let width = 1, height = 1;
  const PAD = 20; // px of clear space kept around the hero text

  function layout() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    // Keep the drawing buffer under ~4.5 MP (e.g. 2560x1000 at 2x would be 10 MP).
    const pr = Math.max(1, Math.min(pixelRatio, Math.sqrt(4.5e6 / (width * height))));
    if (renderer.getPixelRatio() !== pr) {
      renderer.setPixelRatio(pr);
      shared.uPixelRatio.value = pr;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    shared.uAspect.value = camera.aspect;
    // Smaller dots on small screens so the rings stay delicate.
    const k = Math.min(1, Math.max(0.6, Math.min(width, height) / 800));
    fieldMat.uniforms.uSize.value = 24 * k;
    ringMat.uniforms.uSize.value = 46 * k;
    nodeMat.uniforms.uSize.value = 64 * k;

    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const wpp = visH / height; // world units per CSS pixel on the z=0 plane
    if (anchor && anchor.offsetParent !== null) {
      const hr = host.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      anchorPos.set(
        (ar.left + ar.width / 2 - hr.left - width / 2) * wpp,
        -(ar.top + ar.height / 2 - hr.top - height / 2) * wpp,
      );
      // Avatar HUD reaches 0.36 of the slot width; the core sits just outside it.
      unit = ar.width * 0.42 * wpp;
    } else {
      anchorPos.set(0, 0);
      unit = Math.min(visH, visH * camera.aspect) * 0.2;
    }
    if (maskEl) {
      const hr = host.getBoundingClientRect();
      const mr = maskEl.getBoundingClientRect();
      if (anchor) {
        // Keep the outer ring (1.48 units) clear of the text: horizontally when the
        // text sits beside the avatar, vertically (rings are tilted, so their height
        // is at most ~0.75 of the radius) when it sits below.
        const ar = anchor.getBoundingClientRect();
        const cx = ar.left + ar.width / 2, cy = ar.top + ar.height / 2;
        let maxR = Infinity;
        if (mr.right <= ar.left) maxR = cx - mr.right - 40;
        else if (mr.top >= ar.bottom - 1) maxR = (mr.top - cy - 24) / 0.75;
        if (maxR > 0) unit = Math.min(unit, (maxR / 1.48) * wpp);
      }
      const nx = (px) => ((px - hr.left) / width) * 2 - 1;
      const ny = (py) => -(((py - hr.top) / height) * 2 - 1);
      shared.uMask.value.set(nx(mr.left - PAD), ny(mr.bottom + PAD), nx(mr.right + PAD), ny(mr.top - PAD));
    }
    rig.position.set(anchorPos.x, anchorPos.y, 0);
    if (!running) renderOnce();
  }

  // --- Pointer --------------------------------------------------------------
  const mouse = new THREE.Vector2(9, 9);
  const mouseTarget = new THREE.Vector2(0, 0);
  const parallax = new THREE.Vector2(0, 0);
  let attract = 0, attractTarget = 0, idleTimer = 0;

  function setPointer(clientX, clientY) {
    const r = host.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -(((clientY - r.top) / r.height) * 2 - 1);
    if (y < -1.2 || y > 1.2) return;
    if (mouse.x > 5) mouse.set(x, y); // first contact: jump, don't sweep across
    mouseTarget.set(x, y);
    attractTarget = 0.34;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { attractTarget = 0; }, 2400);
    if (onPointer) onPointer(x, y);
  }
  const onPointerMove = (e) => { if (e.pointerType !== 'touch') setPointer(e.clientX, e.clientY); };
  const onTouch = (e) => { const t = e.touches[0]; if (t) setPointer(t.clientX, t.clientY); };
  const onLeave = () => { attractTarget = 0; };

  // --- Loop -----------------------------------------------------------------
  let destroyed = false;
  let running = false, inView = true, last = 0, elapsed = 0, revealT = reduce ? 1 : 0;
  let fpsFrames = 0, fpsTime = 0;

  function update(dt) {
    elapsed += dt;
    shared.uTime.value = elapsed;

    revealT = Math.min(1, revealT + dt / 2.2);
    const eIn = easeOutCubic(revealT);
    const eScale = easeOutBack(Math.min(1, revealT * 1.15));

    mouse.x = damp(mouse.x, mouseTarget.x, 5, dt);
    mouse.y = damp(mouse.y, mouseTarget.y, 5, dt);
    shared.uMouse.value.copy(mouse);
    attract = damp(attract, attractTarget, 2.5, dt);
    fieldMat.uniforms.uAttract.value = attract;
    ringMat.uniforms.uAttract.value = 0;

    // Depth parallax: rotate the field around the origin toward the pointer.
    parallax.x = damp(parallax.x, mouseTarget.x, 2, dt);
    parallax.y = damp(parallax.y, mouseTarget.y, 2, dt);
    field.rotation.y = parallax.x * 0.07 + elapsed * 0.006;
    field.rotation.x = -parallax.y * 0.05;

    const pulse = 1 + Math.sin(elapsed * 1.4) * 0.012;
    rig.scale.setScalar(unit * Math.max(0.001, eScale) * pulse);
    rig.rotation.y = parallax.x * 0.35 + (1 - eIn) * -1.6;
    rig.rotation.x = -parallax.y * 0.25;

    outer.rotation.y += dt * 0.16;
    outer.rotation.x += dt * 0.05;
    inner.rotation.y -= dt * 0.11;
    inner.rotation.z += dt * 0.06;
    for (const s of spinners) s.rotation.z += dt * s.userData.speed;

    applyOpacity(eIn);
  }

  function applyOpacity(e) {
    fieldMat.uniforms.uOpacity.value = 0.55 * e;
    ringMat.uniforms.uOpacity.value = e;
    nodeMat.uniforms.uOpacity.value = e;
    outerMat.opacity = e;
    innerMat.opacity = 0.45 * e;
    ringLineMat.opacity = 0.22 * e;
  }

  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    update(dt);
    renderer.render(scene, camera);

    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.75) {
      if (onFps) onFps(Math.round(fpsFrames / fpsTime));
      fpsFrames = 0;
      fpsTime = 0;
    }
  }

  function renderOnce() {
    // Static frame (reduced motion, or while paused after a resize).
    if (reduce) {
      rig.scale.setScalar(unit);
      rig.rotation.set(0.12, -0.35, 0);
      outer.rotation.set(0.4, 0.6, 0);
      inner.rotation.set(0.2, -0.5, 0.3);
      spinners.forEach((s, i) => { s.rotation.z = i * 1.3; });
      applyOpacity(1);
    } else {
      rig.scale.setScalar(unit * Math.max(0.001, easeOutBack(Math.min(1, revealT * 1.15))));
    }
    renderer.render(scene, camera);
  }

  function syncRunning() {
    const should = !reduce && inView && !document.hidden;
    if (should === running) return;
    running = should;
    last = 0;
    renderer.setAnimationLoop(running ? frame : null);
  }

  // --- Wiring ---------------------------------------------------------------
  const ro = new ResizeObserver(layout);
  ro.observe(host);
  if (anchor) ro.observe(anchor);
  watch.forEach((el) => el && ro.observe(el));

  const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncRunning(); }, { threshold: 0 });
  io.observe(host);

  const onVisibility = () => syncRunning();
  document.addEventListener('visibilitychange', onVisibility);

  const onContextLost = () => { destroy(); if (onLost) onLost(); };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  if (!reduce) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) layout(); });

  layout();
  syncRunning();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    renderer.setAnimationLoop(null);
    running = false;
    clearTimeout(idleTimer);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('touchstart', onTouch);
    window.removeEventListener('touchmove', onTouch);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    const mats = new Set();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) mats.add(o.material);
    });
    mats.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { destroy };
}

// Small seeded PRNG so the particle layout is identical on every load.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
