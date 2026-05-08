import * as THREE from "three";

type SketchMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

interface BubbleData {
  rotAxis: THREE.Vector3;
  rotSpeed: number;
  driftFreq: THREE.Vector3;
  driftAmp: THREE.Vector3;
  driftPhase: THREE.Vector3;
  origin: THREE.Vector3;
  noiseScaleRange: [number, number];
  displacementRange: [number, number];
  morphFreq: number;
  morphPhase: number;
  mixPhases: THREE.Vector3;
  basePositions: Float32Array;
  vertNormals: Float32Array;
}

const seed = Date.now() * Math.random();
const rand = (() => {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
})();

const randVec3 = (min: number, max: number) =>
  new THREE.Vector3(min + rand() * (max - min), min + rand() * (max - min), min + rand() * (max - min));

const randPhaseVec3 = () => randVec3(0, Math.PI * 2);

// Noise texture

const NOISE_SIZE = 256;
const noiseData = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.floor(Math.random() * 256);

const blurred = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
for (let y = 0; y < NOISE_SIZE; y++) {
  for (let x = 0; x < NOISE_SIZE; x++) {
    let sum = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      sum += noiseData[((y + dy + NOISE_SIZE) % NOISE_SIZE) * NOISE_SIZE + ((x + dx + NOISE_SIZE) % NOISE_SIZE)];
    }
    blurred[y * NOISE_SIZE + x] = sum / 25;
  }
}

const noiseTex = new THREE.DataTexture(blurred, NOISE_SIZE, NOISE_SIZE, THREE.RedFormat);
noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter;
noiseTex.needsUpdate = true;

const dayProgress = (new Date().getHours() + new Date().getMinutes() / 60) / 24;
const noiseSpeed = 0.005 + Math.sin(dayProgress * Math.PI * 2) * 0.003 + rand() * 0.007;
const timeOffset = rand() * 1000;
const seedVal = rand() * 100;

// Renderer

const canvas = document.getElementById("bg") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf0ede8, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 3.2 + rand() * 0.4;

// Hatching patterns

const patternFns = [
  `float p__N__(vec2 uv, float seed) {
    float n1 = texture2D(tNoise, uv * 0.3 + seed * 0.01).r;
    float n2 = texture2D(tNoise, uv * 2.0 + seed * 0.07).r;
    float wobble = (n1 - 0.5) * 0.9;
    float line = fract((uv.y + wobble) * 7.0 + n1 * 0.5);
    float thickness = 0.025 + n1 * 0.03;
    float stroke = smoothstep(0.5 - thickness, 0.5, line) * (1.0 - smoothstep(0.5, 0.5 + thickness, line));
    return stroke * smoothstep(0.25, 0.55, n2) * smoothstep(0.3, 0.8, n1);
  }`,
  `float p__N__(vec2 uv, float seed) {
    float n1 = texture2D(tNoise, uv * 0.2 + seed * 0.013).r;
    float n2 = texture2D(tNoise, uv * 2.2 + seed * 0.05).r;
    float angle = 0.5 + (n1 - 0.5) * 1.8;
    float proj = uv.x * cos(angle) + uv.y * sin(angle);
    float line = fract((proj + (n1 - 0.5) * 0.6) * 7.0 + n2 * 0.3);
    float thickness = 0.02 + n1 * 0.035;
    float stroke = smoothstep(0.5 - thickness, 0.5, line) * (1.0 - smoothstep(0.5, 0.5 + thickness, line));
    return stroke * smoothstep(0.2, 0.5, n2) * smoothstep(0.25, 0.75, n1);
  }`,
  `float p__N__(vec2 uv, float seed) {
    float n1 = texture2D(tNoise, uv * 0.35 + seed * 0.012).r;
    float n2 = texture2D(tNoise, uv * 2.0 + seed * 0.06).r;
    float wobble = (n1 - 0.5) * 0.7;
    float l1 = fract((uv.y + wobble) * 7.0 + n1 * 0.4);
    float l2 = fract(((uv.x * 0.8 + uv.y * 0.6) + wobble * 0.5) * 7.5);
    float th = 0.04 + n1 * 0.05;
    float s1 = smoothstep(0.5 - th, 0.5, l1) * (1.0 - smoothstep(0.5, 0.5 + th, l1));
    float s2 = smoothstep(0.5 - th, 0.5, l2) * (1.0 - smoothstep(0.5, 0.5 + th, l2));
    return max(s1, s2) * smoothstep(0.2, 0.5, n2) * smoothstep(0.2, 0.7, n1);
  }`,
  `float p__N__(vec2 uv, float seed) {
    float n1 = texture2D(tNoise, uv * 0.2 + seed * 0.015).r;
    float n2 = texture2D(tNoise, uv * 1.8 + seed * 0.04).r;
    float line = fract((n1 * 3.0 + uv.x * 0.4 + uv.y * 0.3) * 2.0);
    float thickness = 0.03 + n2 * 0.04;
    float stroke = smoothstep(0.5 - thickness, 0.5, line) * (1.0 - smoothstep(0.5, 0.5 + thickness, line));
    return stroke * smoothstep(0.2, 0.5, n2) * smoothstep(0.2, 0.7, n1);
  }`,
  `float p__N__(vec2 uv, float seed) {
    float n1 = texture2D(tNoise, uv * 0.25 + seed * 0.017).r;
    float n2 = texture2D(tNoise, uv * 2.0 + seed * 0.04).r;
    float angle = -0.6 + (n1 - 0.5) * 1.6;
    float proj = uv.x * cos(angle) + uv.y * sin(angle);
    float line = fract((proj + (n2 - 0.5) * 0.5) * 7.5);
    float thickness = 0.04 + n1 * 0.04;
    float stroke = smoothstep(0.5 - thickness, 0.5, line) * (1.0 - smoothstep(0.5, 0.5 + thickness, line));
    return stroke * smoothstep(0.2, 0.5, n2) * smoothstep(0.2, 0.7, n1);
  }`,
];

// Shaders

const allFnDefs = patternFns.map((fn, i) => fn.replace(/__N__/g, String(i))).join("\n");

const LAYER_PAIRS: [number, number][] = [[0, 1], [2, 3], [4, 0]];
const UV_SCALES = [1.0, 1.3, 0.8];
const SEED_MULTS = [1.0, 2.3, 4.1];
const EDGE_THRESHOLDS = [0.0, 0.0, 0.1];

const layerGlsl = LAYER_PAIRS.map((pair, i) => {
  const uv = `uv * ${UV_SCALES[i].toFixed(1)}`;
  const sd = `uSeed * ${SEED_MULTS[i].toFixed(1)}`;
  const edge = `smoothstep(${EDGE_THRESHOLDS[i].toFixed(2)}, ${(EDGE_THRESHOLDS[i] + 0.2).toFixed(2)}, edge)`;
  return `ink += mix(p${pair[0]}(${uv}, ${sd}), p${pair[1]}(${uv}, ${sd}), uMix.${"xyz"[i]}) * ${edge};`;
}).join("\n    ");

const fragmentShader = `
  varying vec3 vNorm;
  varying vec4 vClipPos;
  uniform float uSeed;
  uniform vec2 uResolution;
  uniform sampler2D tNoise;
  uniform vec3 uMix;

  ${allFnDefs}

  void main() {
    vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    vec2 uv = screenUV * vec2(uResolution.x / uResolution.y, 1.0) * 1.8;

    float edge = pow(1.0 - abs(dot(normalize(vNorm), vec3(0.0, 0.0, 1.0))), 0.25);

    float ink = 0.0;
    ${layerGlsl}
    ink = clamp(ink, 0.0, 1.0);

    float inkVar = texture2D(tNoise, gl_FragCoord.xy / 256.0).r * 0.08;
    vec3 paper = vec3(0.941, 0.929, 0.91);
    gl_FragColor = vec4(mix(paper, vec3(0.06 + inkVar), ink * 0.9), 1.0);
  }
`;

const vertexShader = `
  varying vec3 vNorm;
  varying vec4 vClipPos;

  void main() {
    vNorm = normalize(normalMatrix * normal);
    vClipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClipPos;
  }
`;

// Material

const material = new THREE.ShaderMaterial({
  uniforms: {
    uSeed: { value: seedVal },
    uResolution: { value: new THREE.Vector2(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()) },
    tNoise: { value: noiseTex },
    uMix: { value: new THREE.Vector3(rand(), rand(), rand()) },
  },
  vertexShader,
  fragmentShader,
  transparent: false,
  depthWrite: true,
  side: THREE.FrontSide,
});

// Geometry

const group = new THREE.Group();
scene.add(group);

const bubbleData: BubbleData[] = [];
const shapeCount = 3 + Math.floor(rand() * 3);

for (let i = 0; i < shapeCount; i++) {
  const radius = 0.25 + rand() * 0.6;
  const detail = 6 + Math.floor(rand() * 10);
  const geo = new THREE.SphereGeometry(radius, detail, detail);

  const shapeRoll = rand();
  if (shapeRoll < 0.15) {
    geo.scale(0.7 + rand() * 0.3, 0.9 + rand() * 0.4, 1.0 + rand() * 0.3);
  } else if (shapeRoll < 0.3) {
    geo.scale(1.0 + rand() * 0.2, 0.7 + rand() * 0.3, 0.9 + rand() * 0.2);
  } else {
    geo.scale(0.85 + rand() * 0.3, 0.85 + rand() * 0.3, 0.85 + rand() * 0.3);
  }

  const pos = geo.getAttribute("position");
  const jag = 0.15 + rand() * 0.25;
  const seen = new Map<string, number>();
  for (let v = 0; v < pos.count; v++) {
    const nx = pos.getX(v), ny = pos.getY(v), nz = pos.getZ(v);
    const key = `${nx.toFixed(6)},${ny.toFixed(6)},${nz.toFixed(6)}`;
    let offset: number;
    if (seen.has(key)) {
      offset = seen.get(key)!;
    } else {
      offset = (rand() - 0.5) * 2 * jag * radius;
      seen.set(key, offset);
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const scale = (len + offset) / len;
    pos.setXYZ(v, nx * scale, ny * scale, nz * scale);
  }
  const flatGeo = geo.toNonIndexed();
  flatGeo.computeVertexNormals();

  // Store base positions and per-vertex radial directions for morphing
  const flatPos = flatGeo.getAttribute("position");
  const basePositions = new Float32Array(flatPos.count * 3);
  const vertNormals = new Float32Array(flatPos.count * 3);
  for (let v = 0; v < flatPos.count; v++) {
    const x = flatPos.getX(v), y = flatPos.getY(v), z = flatPos.getZ(v);
    basePositions[v * 3] = x;
    basePositions[v * 3 + 1] = y;
    basePositions[v * 3 + 2] = z;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    vertNormals[v * 3] = x / len;
    vertNormals[v * 3 + 1] = y / len;
    vertNormals[v * 3 + 2] = z / len;
  }

  const m = new THREE.Mesh(flatGeo, material.clone());

  const origin = new THREE.Vector3((rand() - 0.5) * 1.4, (rand() - 0.5) * 1.0, (rand() - 0.5) * 0.6);
  m.position.copy(origin);

  const rotAxis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
  const rotSpeed = 0.008 + rand() * 0.02;

  const driftFreq = randVec3(0.02, 0.06);
  const driftAmp = randVec3(0.25, 0.7);
  driftAmp.z *= 0.3;
  const driftPhase = randPhaseVec3();

  const jagA = rand(), jagB = rand();
  const noiseScaleRange: [number, number] = [0.25 + jagA * 0.35, 0.25 + jagB * 0.35];
  const displacementRange: [number, number] = [0.15 + rand() * 0.25 + jagA * 0.2, 0.15 + rand() * 0.25 + jagB * 0.2];
  const morphFreq = 0.05 + rand() * 0.08;
  const morphPhase = rand() * Math.PI * 2;
  const mixPhases = randPhaseVec3();

  bubbleData.push({ rotAxis, rotSpeed, driftFreq, driftAmp, driftPhase, origin, noiseScaleRange, displacementRange, morphFreq, morphPhase, mixPhases, basePositions, vertNormals });
  group.add(m);
}

// Post-processing: blur+threshold merge

const fsVert = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const rtWidth = Math.floor(window.innerWidth * renderer.getPixelRatio());
const rtHeight = Math.floor(window.innerHeight * renderer.getPixelRatio());

const maskRT = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
const blurRT1 = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
const blurRT2 = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
const sceneRT = new THREE.WebGLRenderTarget(rtWidth, rtHeight);

const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });


const fullscreenQuad = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial(),
);
const fsScene = new THREE.Scene();
fsScene.add(fullscreenQuad);
const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const blurShader = {
  vertexShader: fsVert,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uDirection;
    uniform vec2 uResolution;
    uniform float uSpread;
    varying vec2 vUv;
    void main() {
      vec2 texel = uDirection / uResolution * uSpread;
      float result = 0.0;
      result += texture2D(tDiffuse, vUv - 4.0 * texel).r * 0.0162;
      result += texture2D(tDiffuse, vUv - 3.0 * texel).r * 0.0540;
      result += texture2D(tDiffuse, vUv - 2.0 * texel).r * 0.1218;
      result += texture2D(tDiffuse, vUv - 1.0 * texel).r * 0.1960;
      result += texture2D(tDiffuse, vUv).r * 0.2261;
      result += texture2D(tDiffuse, vUv + 1.0 * texel).r * 0.1960;
      result += texture2D(tDiffuse, vUv + 2.0 * texel).r * 0.1218;
      result += texture2D(tDiffuse, vUv + 3.0 * texel).r * 0.0540;
      result += texture2D(tDiffuse, vUv + 4.0 * texel).r * 0.0162;
      gl_FragColor = vec4(vec3(result), 1.0);
    }
  `,
};

const blurHMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uDirection: { value: new THREE.Vector2(1, 0) },
    uResolution: { value: new THREE.Vector2(rtWidth, rtHeight) },
    uSpread: { value: 3.0 },
  },
  ...blurShader,
});

const blurVMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uDirection: { value: new THREE.Vector2(0, 1) },
    uResolution: { value: new THREE.Vector2(rtWidth, rtHeight) },
    uSpread: { value: 3.0 },
  },
  ...blurShader,
});

const compositeMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null },
    tMask: { value: null },
    tRawMask: { value: null },
    uThreshold: { value: 0.45 },
  },
  vertexShader: fsVert,
  fragmentShader: `
    uniform sampler2D tScene;
    uniform sampler2D tMask;
    uniform sampler2D tRawMask;
    uniform float uThreshold;
    varying vec2 vUv;
    void main() {
      float blurred = texture2D(tMask, vUv).r;
      float raw = texture2D(tRawMask, vUv).r;
      float inside = smoothstep(uThreshold - 0.08, uThreshold + 0.08, blurred);
      vec4 scene = texture2D(tScene, vUv);
      vec3 paper = vec3(0.941, 0.929, 0.91);

      vec3 bridge = scene.rgb * 0.7 + vec3(0.5, 0.55, 0.6) * 0.3;
      vec3 shape = mix(bridge, scene.rgb, step(0.5, raw));
      gl_FragColor = vec4(mix(paper, shape, inside), 1.0);
    }
  `,
});

const BLUR_PASSES = 6;

// Animated merge parameters
const mergeParams = {
  blurSpreadBase: 1.8 + rand() * 1.0,
  blurSpreadRange: 0.5 + rand() * 0.7,
  blurSpreadFreq: 0.02 + rand() * 0.03,
  blurSpreadPhase: rand() * Math.PI * 2,
  thresholdBase: 0.72 + rand() * 0.1,
  thresholdRange: 0.05 + rand() * 0.05,
  thresholdFreq: 0.015 + rand() * 0.025,
  thresholdPhase: rand() * Math.PI * 2,
};

// Animation

function animate(time: number) {
  const t = time * 0.001 + timeOffset;

  group.children.forEach((child, i) => {
    const mesh = child as SketchMesh;
    const bd = bubbleData[i];

    mesh.rotateOnAxis(bd.rotAxis, bd.rotSpeed * 0.016);
    mesh.position.x = bd.origin.x + Math.sin(t * bd.driftFreq.x + bd.driftPhase.x) * bd.driftAmp.x;
    mesh.position.y = bd.origin.y + Math.sin(t * bd.driftFreq.y + bd.driftPhase.y) * bd.driftAmp.y;
    mesh.position.z = bd.origin.z + Math.sin(t * bd.driftFreq.z + bd.driftPhase.z) * bd.driftAmp.z;

    const mat = mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uSeed.value = seedVal + t * 0.03;
    mat.uniforms.uMix.value.set(
      Math.sin(t * noiseSpeed + bd.mixPhases.x) * 0.5 + 0.5,
      Math.sin(t * noiseSpeed * 0.7 + bd.mixPhases.y) * 0.5 + 0.5,
      Math.sin(t * noiseSpeed * 1.3 + bd.mixPhases.z) * 0.5 + 0.5,
    );

    // Morph vertices: radial displacement oscillates per-vertex
    const pos = mesh.geometry.getAttribute("position");
    const morphT = t * bd.morphFreq + bd.morphPhase;
    const disp = bd.displacementRange[0] + (bd.displacementRange[1] - bd.displacementRange[0]) * (Math.sin(morphT) * 0.5 + 0.5);
    const ns = bd.noiseScaleRange[0] + (bd.noiseScaleRange[1] - bd.noiseScaleRange[0]) * (Math.sin(morphT * 0.7) * 0.5 + 0.5);

    for (let v = 0; v < pos.count; v++) {
      const bx = bd.basePositions[v * 3];
      const by = bd.basePositions[v * 3 + 1];
      const bz = bd.basePositions[v * 3 + 2];
      const nx = bd.vertNormals[v * 3];
      const ny = bd.vertNormals[v * 3 + 1];
      const nz = bd.vertNormals[v * 3 + 2];

      // Per-vertex phase from position (cheap spatial variation)
      const vPhase = (bx * ns * 3.0 + by * ns * 5.0 + bz * ns * 7.0);
      const offset = Math.sin(morphT + vPhase) * disp;

      pos.setXYZ(v, bx + nx * offset, by + ny * offset, bz + nz * offset);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  // Animate merge parameters
  const spread = mergeParams.blurSpreadBase + Math.sin(t * mergeParams.blurSpreadFreq + mergeParams.blurSpreadPhase) * mergeParams.blurSpreadRange;
  const threshold = mergeParams.thresholdBase + Math.sin(t * mergeParams.thresholdFreq + mergeParams.thresholdPhase) * mergeParams.thresholdRange;
  blurHMat.uniforms.uSpread.value = spread;
  blurVMat.uniforms.uSpread.value = spread;
  compositeMat.uniforms.uThreshold.value = threshold;

  // 1. Render scene normally to sceneRT
  renderer.setRenderTarget(sceneRT);
  renderer.setClearColor(0xf0ede8, 1);
  renderer.clear();
  renderer.render(scene, camera);

  // 2. Render mask (white shapes on black) + normals
  const origMaterials: THREE.Material[] = [];
  group.children.forEach(child => {
    const mesh = child as THREE.Mesh;
    origMaterials.push(mesh.material as THREE.Material);
    mesh.material = whiteMat;
  });
  renderer.setRenderTarget(maskRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);

  group.children.forEach((child, idx) => {
    (child as THREE.Mesh).material = origMaterials[idx];
  });

  // 3. Blur the mask
  let readRT = maskRT;
  for (let p = 0; p < BLUR_PASSES; p++) {
    blurHMat.uniforms.tDiffuse.value = readRT.texture;
    fullscreenQuad.material = blurHMat;
    renderer.setRenderTarget(blurRT1);
    renderer.clear();
    renderer.render(fsScene, fsCamera);

    blurVMat.uniforms.tDiffuse.value = blurRT1.texture;
    fullscreenQuad.material = blurVMat;
    renderer.setRenderTarget(blurRT2);
    renderer.clear();
    renderer.render(fsScene, fsCamera);

    readRT = blurRT2;
  }

  // 4. Composite directly to screen
  compositeMat.uniforms.tScene.value = sceneRT.texture;
  compositeMat.uniforms.tMask.value = blurRT2.texture;
  compositeMat.uniforms.tRawMask.value = maskRT.texture;
  fullscreenQuad.material = compositeMat;
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(fsScene, fsCamera);

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Resize

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const w = Math.floor(window.innerWidth * renderer.getPixelRatio());
  const h = Math.floor(window.innerHeight * renderer.getPixelRatio());
  maskRT.setSize(w, h);
  blurRT1.setSize(w, h);
  blurRT2.setSize(w, h);
  sceneRT.setSize(w, h);
  blurHMat.uniforms.uResolution.value.set(w, h);
  blurVMat.uniforms.uResolution.value.set(w, h);
  group.children.forEach(c => {
    ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uResolution.value.set(w, h);
  });
});
