/*
 * 로뎀 월드 — 코드로 만든 소품(2026-11-15). 월드(index.html)가 늘 읽는다 — 상점 · 마을 · 집 안에서 쓴다. 외부 모델 · 그림 파일 없이 three.js 도형만으로.
 *   그림체: 장난감 같고 아늑하게 — 둥근 모서리, 파스텔, 2단 음영(MeshToonMaterial) + 얇은 바깥선. 아바타(bakeFigure)와 같은 결.
 *   소품마다 함수 하나, 색 · 크기를 인자로 바꾼다. 결과는 THREE.Group(본체 1 + 바깥선 1 — 그리기 2번).
 *   window.RodemProps = { house, tree, chair, car, stats }
 */
(function () {
  const T = window.THREE;

  // ---------------------------------------------------------------- 재질 — 월드의 TOON · 바깥선과 같은 값
  const TOON_GRAD = (() => {
    const t = new T.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, T.RedFormat);
    t.minFilter = t.magFilter = T.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();
  const TOON = new T.MeshToonMaterial({ vertexColors: true, gradientMap: TOON_GRAD });
  const OUTLINES = {};
  const outlineMat = (thick, color = "#4a372f") =>
    (OUTLINES[thick + color] ??= (() => {
      const m = new T.MeshBasicMaterial({ color, side: T.BackSide });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = vec3(position) + normalize(normal) * ${thick.toFixed(4)};`);
      };
      m.customProgramCacheKey = () => "outline" + thick + color;
      return m;
    })());

  // ---------------------------------------------------------------- 조각 · 합치기 — 월드의 P · merge 와 같은 모양
  const q = new T.Quaternion();
  const e3 = new T.Euler();
  const P = (geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => ({
    geo,
    color,
    m: new T.Matrix4().compose(new T.Vector3(x, y, z), q.clone().setFromEuler(e3.set(rx, ry, rz)), new T.Vector3(sx, sy, sz)),
  });
  const GRAD = [0.84, 1.05];
  const shade = (p, lo, hi) => ((p.grad = [lo, hi]), p);
  function merge(parts) {
    let n = 0;
    const tmp = [];
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.m);
      tmp.push([g, p.color, p.grad ?? GRAD]);
      n += g.attributes.position.count;
    }
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new T.Color();
    let o = 0;
    for (const [g, color, grad] of tmp) {
      c.set(color);
      const pa = g.attributes.position.array;
      pos.set(pa, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      // 조각마다 아래는 살짝 어둡게 · 위는 밝게 — 한 가지 색 면이 밋밋하지 않게(그림 파일 없이 색만으로)
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < pa.length; i += 3) { if (pa[i] < y0) y0 = pa[i]; if (pa[i] > y1) y1 = pa[i]; }
      const span = Math.max(1e-4, y1 - y0);
      for (let i = 0; i < g.attributes.position.count; i++) {
        const f = grad[0] + (grad[1] - grad[0]) * ((pa[i * 3 + 1] - y0) / span);
        col[(o + i) * 3] = Math.min(1, c.r * f);
        col[(o + i) * 3 + 1] = Math.min(1, c.g * f);
        col[(o + i) * 3 + 2] = Math.min(1, c.b * f);
      }
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.BufferAttribute(nor, 3));
    out.setAttribute("color", new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }
  /** 조각들 → 그룹(본체 + 바깥선). 바깥선은 둥근 조각만(outline: false 인 조각은 선 없이) */
  function build(parts, ol = 0.025) {
    const geo = merge(parts);
    const g = new T.Group();
    g.add(new T.Mesh(geo, TOON));
    const lined = parts.filter((p) => p.outline !== false);
    if (ol && lined.length) g.add(new T.Mesh(lined.length === parts.length ? geo : merge(lined), outlineMat(ol)));
    g.userData.tris = geo.attributes.position.count / 3;
    return g;
  }
  const noLine = (p) => ((p.outline = false), p);

  // ---------------------------------------------------------------- 기본 도형 — 둥근 상자 · 둥근 판 · 깎은 기둥
  const cache = {};
  /** 모서리가 둥근 상자(가로 w · 높이 h · 깊이 d, 둥근 r). 가운데가 원점 */
  function rbox(w, h, d, r = 0.08, seg = 3) {
    const k = `rb${w}|${h}|${d}|${r}|${seg}`;
    if (cache[k]) return cache[k];
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const s = new T.Shape();
    const x = -w / 2 + r;
    const y = -h / 2 + r;
    const iw = w - 2 * r;
    const ih = h - 2 * r;
    s.moveTo(x, y);
    s.lineTo(x + iw, y);
    s.lineTo(x + iw, y + ih);
    s.lineTo(x, y + ih);
    s.lineTo(x, y);
    const g = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return (cache[k] = g);
  }
  /**
   * 빚은 덩어리 — x 축을 따라 단면(둥근 네모)을 이어 붙인다. 상자를 쌓은 모양 대신 매끈하게 부푼 몸통을 만든다.
   * sections: [x, 가운데 높이 y, 폭 w, 키 h, 둥근 정도 e(2 = 타원, 4 = 둥근 네모)]
   */
  function loft(sections, seg = 12) {
    const pos = [], idx = [];
    const pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
    for (const [x, y, w, h, e = 3] of sections)
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        pos.push(x, y + (pw(Math.sin(a), e) * h) / 2, (pw(Math.cos(a), e) * w) / 2);
      }
    const n = sections.length;
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < seg; j++) {
        const a = i * seg + j, b = (i + 1) * seg + j, c = (i + 1) * seg + ((j + 1) % seg), d = i * seg + ((j + 1) % seg);
        idx.push(a, b, d, b, c, d);
      }
    const c0 = pos.length / 3; pos.push(sections[0][0], sections[0][1], 0);
    const c1 = c0 + 1; pos.push(sections[n - 1][0], sections[n - 1][1], 0);
    for (let j = 0; j < seg; j++) {
      idx.push(c0, j, (j + 1) % seg);
      idx.push(c1, (n - 1) * seg + ((j + 1) % seg), (n - 1) * seg + j);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const lathe = (pts, seg = 14) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  const SPH = new T.SphereGeometry(1, 12, 9);
  const SPH_LO = new T.SphereGeometry(1, 10, 7);
  const SPH_TINY = new T.SphereGeometry(1, 7, 5); // 열매처럼 작은 점
  const SPH_SM = new T.SphereGeometry(1, 9, 6); // 앞불처럼 작지만 둥글어야 하는 것
  const CYL = (rt, rb, h, seg = 12) => (cache[`c${rt}|${rb}|${h}|${seg}`] ??= new T.CylinderGeometry(rt, rb, h, seg));

  // ---------------------------------------------------------------- 1. 작은 집
  /**
   * 동화 같은 작은 집 — 둥근 크림 벽, 통통한 지붕, 아치 문, 십자 창, 굴뚝.
   * @param {{ wall?: string, roof?: string, door?: string, trim?: string, w?: number, d?: number }} o
   */
  function house(o = {}) {
    const wall = o.wall ?? "#fff3dc";
    const roof = o.roof ?? "#f0907a";
    const roofDark = o.roofDark ?? "#d9735f";
    const door = o.door ?? "#c9835a";
    const trim = o.trim ?? "#ffffff";
    const glass = "#a9dcf2";
    const w = o.w ?? 2.4;
    const d = o.d ?? 2.0;
    const h = 1.55;
    const parts = [];
    // 받침 · 벽
    parts.push(P(rbox(w + 0.22, 0.18, d + 0.22, 0.07), "#e3d3bb", 0, 0.09, 0));
    parts.push(P(rbox(w, h, d, 0.14), wall, 0, 0.18 + h / 2, 0));
    // 지붕 — 앞뒤로 기운 두 장, 처마가 벽보다 넉넉히 나온다
    const roofW = w + 0.42;
    const half = d / 2 + 0.3;
    const pitch = 0.62;
    const len = half / Math.cos(pitch);
    const top = 0.18 + h;
    // 기와 세 단 — 비탈보다 살짝 덜 기운 판을 겹쳐, 단마다 아래 끝이 도톰하게 올라온다
    const roofLite = o.roofLite ?? "#f7a48e";
    for (const s of [1, -1]) {
      const th = s * pitch;
      const cy = top + Math.sin(pitch) * len * 0.5 + 0.02, cz = (s * half) / 2;
      const dir = [-Math.sin(th), Math.cos(th)];
      [-0.34, 0, 0.34].forEach((t, i) => {
        // t: 비탈을 따라 처마(+) ↔ 용마루(-). 앞면은 z 가 커질수록 처마
        const k = s * t;
        const col = i === 1 ? roofLite : s > 0 ? roof : roofDark;
        parts.push(shade(P(rbox(roofW - (i === 1 ? 0.03 : 0), 0.16, len / 3 + 0.16, 0.07, 2), col, 0, cy + dir[0] * k * len, cz + dir[1] * k * len, 1, 1, 1, s * (pitch - 0.1), 0, 0), 0.9, 1.04));
      });
    }
    // 박공 — 앞뒤로 기운 지붕 아래 세모 벽(양옆에서 보인다). 세모는 깊이 방향, 집 폭만큼 밀어낸다
    const gable = new T.Shape([new T.Vector2(-d / 2, 0), new T.Vector2(d / 2, 0), new T.Vector2(0, Math.tan(pitch) * (d / 2))]);
    const gg = new T.ExtrudeGeometry(gable, { depth: w - 0.06, bevelEnabled: false });
    gg.translate(0, 0, -(w - 0.06) / 2);
    parts.push(P(gg, wall, 0, top - 0.02, 0, 1, 1, 1, 0, Math.PI / 2, 0));
    // 박공의 동그란 다락 창
    for (const sx of [1, -1]) {
      parts.push(P(CYL(0.17, 0.17, 0.06, 10), glass, sx * (w / 2 - 0.01), top + 0.3, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    }
    // 용마루
    parts.push(P(CYL(0.09, 0.09, roofW + 0.04, 10), roofDark, 0, top + Math.tan(pitch) * (d / 2) + 0.12, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    // 굴뚝
    parts.push(P(rbox(0.32, 0.6, 0.32, 0.06), "#e7a07a", w * 0.27, top + 0.55, -d * 0.15));
    parts.push(P(rbox(0.4, 0.1, 0.4, 0.04), "#f3c2a0", w * 0.27, top + 0.88, -d * 0.15));
    // 아치 문 — 둥근 머리 + 몸통, 손잡이
    const fz = d / 2 + 0.005;
    // 흰 아치 문틀 + 문 — 벽에 붙은 판이라 외곽선을 따로 두지 않는다(겹친 데에 줄이 비친다)
    parts.push(noLine(shade(P(rbox(0.8, 0.96, 0.08, 0.05), trim, -w * 0.18, 0.18 + 0.48, fz - 0.01), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.4, 0.4, 0.08, 14), trim, -w * 0.18, 0.18 + 0.96, fz - 0.01, 1, 1, 1, Math.PI / 2, 0, 0), 1, 1)));
    parts.push(noLine(shade(P(rbox(0.62, 0.86, 0.1, 0.05), door, -w * 0.18, 0.18 + 0.43, fz + 0.02), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.31, 0.31, 0.1, 12), door, -w * 0.18, 0.18 + 0.86, fz + 0.02, 1, 1, 1, Math.PI / 2, 0, 0), 1, 1)));
    parts.push(noLine(P(SPH_TINY, "#ffd36b", -w * 0.18 + 0.2, 0.18 + 0.48, fz + 0.07, 0.05, 0.05, 0.05)));
    const dx0 = -w * 0.18;
    // 벽등 — 문 왼쪽, 노란 불빛
    const lx = dx0 - 0.56;
    parts.push(P(rbox(0.16, 0.22, 0.16, 0.04, 1), "#6b5a52", lx, 1.08, fz + 0.1));
    parts.push(noLine(P(rbox(0.11, 0.15, 0.17, 0.03, 1), "#ffe58a", lx, 1.08, fz + 0.1)));
    parts.push(P(CYL(0.02, 0.13, 0.08, 6), "#6b5a52", lx, 1.23, fz + 0.1));
    // 앞 모서리 흰 기둥 판
    for (const sx of [-1, 1]) parts.push(noLine(P(rbox(0.12, h - 0.1, 0.04, 0.02, 1), trim, sx * (w / 2 - 0.13), 0.18 + h / 2, fz + 0.005)));
    // 계단 양옆 화분
    for (const sx of [-1, 1]) {
      parts.push(P(CYL(0.13, 0.1, 0.2, 8), "#d98b62", dx0 + sx * 0.6, 0.1, d / 2 + 0.26));
      parts.push(P(SPH_TINY, "#4f9e34", dx0 + sx * 0.6, 0.3, d / 2 + 0.26, 0.17, 0.15, 0.17));
    }
    // 계단 한 칸
    parts.push(P(rbox(0.82, 0.12, 0.34, 0.05), "#e3d3bb", -w * 0.18, 0.06, d / 2 + 0.24));
    // 창 — 흰 틀 + 하늘빛 유리 + 십자 살, 아래 꽃 상자
    const wx = w * 0.22;
    const wy = 0.18 + 0.9;
    parts.push(P(rbox(0.62, 0.62, 0.08, 0.06), trim, wx, wy, fz));
    parts.push(noLine(P(rbox(0.48, 0.48, 0.06, 0.04), glass, wx, wy, fz + 0.03)));
    parts.push(noLine(P(rbox(0.05, 0.5, 0.05, 0.02), trim, wx, wy, fz + 0.06)));
    parts.push(noLine(P(rbox(0.5, 0.05, 0.05, 0.02), trim, wx, wy, fz + 0.06)));
    parts.push(P(rbox(0.7, 0.16, 0.2, 0.05), "#d98b62", wx, wy - 0.42, fz + 0.1));
    // 덧문(연한 하늘색) 둘
    for (const sx of [-1, 1]) parts.push(P(rbox(0.16, 0.6, 0.06, 0.04), "#8fc7dc", wx + sx * 0.42, wy, fz + 0.02));
    for (const [dx, c] of [[-0.2, "#ff9db4"], [0, "#ffd36b"], [0.2, "#ff9db4"]]) parts.push(noLine(P(SPH_TINY, c, wx + dx, wy - 0.3, fz + 0.12, 0.09, 0.08, 0.09)));
    // 옆 창(둥근)
    parts.push(P(CYL(0.24, 0.24, 0.08, 12), trim, w / 2 + 0.005, wy, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    parts.push(noLine(P(CYL(0.18, 0.18, 0.06, 12), glass, w / 2 + 0.035, wy, 0, 1, 1, 1, 0, 0, Math.PI / 2)));
    return build(parts, 0.022);
  }

  // ---------------------------------------------------------------- 2. 둥근 나무
  /** 몽글몽글한 둥근 나무 — 통통한 줄기, 공 다섯 개를 겹친 수관, 작은 열매. seed 로 모양이 조금씩 다르다 */
  function tree(o = {}) {
    // 잎 색은 월드 키트 나무(진한 초록)와 섞여도 튀지 않게
    const leaf = o.leaf ?? "#4f9e34";
    const leaf2 = o.leaf2 ?? "#63b140";
    const leaf3 = o.leaf3 ?? "#3e8a2b";
    const bark = o.bark ?? "#a8653d";
    const fruit = o.fruit ?? "#ff8c7a";
    let sd = o.seed ?? 7;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.32, 0], [0.26, 0.15], [0.19, 0.6], [0.17, 1.3], [0.2, 1.55], [0.001, 1.6]], 12), bark, 0, 0, 0));
    // 갈래 가지 하나
    parts.push(P(CYL(0.07, 0.1, 0.6, 8), bark, 0.22, 1.25, 0, 1, 1, 1, 0, 0, -0.8));
    // 수관 — 큰 공 하나 + 둘레 넷, 색을 세 가지로
    const blobs = [
      [0, 2.2, 0, 1.05, leaf],
      [0.72, 1.9, 0.2, 0.68, leaf2],
      [-0.7, 1.95, 0.15, 0.72, leaf3],
      [0.1, 1.85, 0.72, 0.66, leaf2],
      [-0.1, 2.05, -0.7, 0.7, leaf],
      [0.15, 2.85, -0.05, 0.62, leaf2],
    ];
    for (const [x, y, z, r, c] of blobs) {
      const k = 1 + (rnd() - 0.5) * 0.12;
      parts.push(shade(P(SPH, c, x, y, z, r * k, r * 0.92 * k, r * k), 0.72, 1.1));
    }
    // 햇빛 받은 잎 뭉치 — 위쪽에 작고 밝은 공 둘(선 없이)
    for (const [x, y, z, r] of [[0.35, 2.75, 0.55, 0.3], [-0.45, 2.72, 0.35, 0.26]]) parts.push(noLine(shade(P(SPH_TINY, o.leafLite ?? "#7cc24c", x, y, z, r, r * 0.8, r), 0.96, 1.04)));
    // 열매 — 수관 앞쪽 표면에 작게
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.4;
      const yy = 1.7 + rnd() * 1.0;
      const rr = 0.98 + rnd() * 0.12;
      parts.push(noLine(P(SPH_TINY, fruit, Math.cos(a) * rr, yy, Math.sin(a) * rr, 0.11, 0.11, 0.11)));
    }
    return build(parts, 0.028);
  }

  // ---------------------------------------------------------------- 3. 나무 의자
  /** 통통한 나무 의자 — 둥근 다리, 방석, 위가 둥근 등받이 */
  function chair(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const woodDark = o.woodDark ?? "#c98a56";
    const cushion = o.cushion ?? "#9fd8e8";
    const parts = [];
    const s = 0.5;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(P(CYL(0.05, 0.04, 0.48, 10), woodDark, x * s * 0.46, 0.23, z * s * 0.46, 1, 1, 1, z * 0.05, 0, -x * 0.05));
    parts.push(P(rbox(0.56, 0.09, 0.56, 0.04), wood, 0, 0.5, 0));
    parts.push(P(rbox(0.48, 0.07, 0.46, 0.035), cushion, 0, 0.575, 0.01));
    // 등받이 기둥 둘 + 위가 둥근 판
    for (const x of [-1, 1]) parts.push(P(CYL(0.04, 0.045, 0.5, 10), woodDark, x * 0.22, 0.78, -0.24));
    parts.push(P(rbox(0.54, 0.22, 0.07, 0.035), wood, 0, 1.02, -0.24));
    parts.push(P((cache.chairTop ??= new T.CylinderGeometry(0.27, 0.27, 0.07, 18, 1, false, -Math.PI / 2, Math.PI)), wood, 0, 1.12, -0.24, 1, 1, 0.42, Math.PI / 2, 0, 0));
    parts.push(noLine(P(SPH_LO, "#ff9db4", 0, 1.03, -0.2, 0.05, 0.05, 0.02)));
    return build(parts, 0.012);
  }

  /** 탈것 바퀴 — 어깨가 둥근 타이어 + 흰 휠 + 바퀴 위 흙받기(반 고리). xs: 바퀴 축 자리, W: 차 폭 */
  function wheels(parts, xs, W, fenderCol) {
    const tireG = (cache.tire ??= lathe([[0.001, -0.12], [0.2, -0.12], [0.29, -0.07], [0.31, 0], [0.29, 0.07], [0.2, 0.12], [0.001, 0.12]], 14));
    const fender = (cache.fender ??= new T.TorusGeometry(0.36, 0.075, 4, 8, Math.PI));
    for (const x of xs)
      for (const s of [1, -1]) {
        parts.push(P(tireG, "#4b4045", x, 0.31, (s * W) / 2, 1, 1, 1, Math.PI / 2, 0, 0));
        parts.push(noLine(P(CYL(0.16, 0.16, 0.05, 12), "#fff5e6", x, 0.31, (s * W) / 2 + s * 0.11, 1, 1, 1, Math.PI / 2, 0, 0)));
        if (fenderCol) parts.push(P(fender, fenderCol, x, 0.33, (s * W) / 2 - s * 0.02, 1, 1, 1.5));
      }
  }

  // ---------------------------------------------------------------- 4. 꼬마 자동차
  /** 장난감 같은 꼬마 자동차 — 둥근 몸통, 동그란 창, 큰 바퀴, 노란 앞불 */
  function car(o = {}) {
    const body = o.body ?? "#ff9a8b";
    const bodyDark = o.bodyDark ?? "#ee7f73";
    const glass = "#bfe7f7";
    const parts = [];
    const W = 1.16;
    // 몸통 — 앞뒤 끝이 둥글게 말린 빵 모양(단면은 둥근 네모)
    parts.push(
      shade(P(loft([[-1.16, 0.5, 0.5, 0.16, 2.4], [-1.1, 0.52, 0.86, 0.36, 3], [-0.92, 0.55, 1.06, 0.5, 3.6], [-0.4, 0.57, W, 0.58, 4], [0.3, 0.56, W, 0.56, 4], [0.74, 0.53, 1.1, 0.5, 3.6], [1.02, 0.5, 0.94, 0.4, 3], [1.14, 0.49, 0.56, 0.2, 2.4]], 12), body), 0.8, 1.06),
    );
    if (o.open) {
      // 지붕을 걷은 모양(타는 동안) — 앞 유리 · 운전대 · 등받이만 남겨 탄 사람이 보인다
      for (const s of [1, -1]) parts.push(P(rbox(0.06, 0.44, 0.06, 0.025, 1), body, 0.42, 1.03, s * 0.44, 1, 1, 1, 0, 0, 0.3)); // 앞 유리는 틀만 — 유리판을 두면 탄 사람 얼굴이 가린다
      parts.push(noLine(P(rbox(0.07, 0.06, 0.94, 0.02, 1), body, 0.36, 1.24, 0, 1, 1, 1, 0, 0, 0.3)));
      parts.push(P(rbox(0.16, 0.24, 0.88, 0.07, 2), bodyDark, -0.68, 0.92, 0, 1, 1, 1, 0, 0, -0.12)); // 등받이는 낮게 — 뒤에서 따라가며 볼 때 탄 사람이 가리지 않게
      parts.push(noLine(P((cache.wheelS ??= new T.TorusGeometry(0.13, 0.025, 4, 10)), "#4b4045", 0.22, 0.9, 0.2, 0.8, 0.8, 0.8, 0, Math.PI / 2 - 0.5, 0)));
    } else {
      // 유리 온실 — 몸통 위에 얹은 둥근 유리 덩어리(앞 유리가 비스듬하다)
      parts.push(noLine(shade(P(loft([[-0.84, 0.88, 0.7, 0.12, 3], [-0.78, 1.0, 0.9, 0.42, 4], [-0.5, 1.06, 0.96, 0.54, 5], [0.0, 1.06, 0.96, 0.54, 5], [0.3, 1.0, 0.92, 0.42, 4], [0.5, 0.88, 0.8, 0.12, 3]], 12), glass), 0.92, 1.06)));
      // 지붕 — 유리 위를 덮는 납작한 조약돌
      parts.push(P(loft([[-0.8, 1.2, 0.7, 0.05, 3], [-0.7, 1.25, 0.96, 0.16, 4], [-0.05, 1.28, 1.0, 0.18, 5], [0.24, 1.25, 0.95, 0.15, 4], [0.36, 1.19, 0.72, 0.05, 3]], 12), body));
      // 가운데 기둥 띠 — 유리를 한 바퀴 두른다(앞 창 · 뒤 창이 나뉜다)
      parts.push(noLine(P(loft([[-0.27, 1.05, 0.985, 0.56, 5], [-0.17, 1.05, 0.985, 0.56, 5]], 12), body)));
    }
    wheels(parts, [-0.68, 0.68], W, bodyDark);
    // 앞불 · 뒷불 — 납작한 단추
    for (const s of [1, -1]) {
      parts.push(noLine(shade(P(SPH_SM, "#ffe27a", 1.0, 0.6, s * 0.3, 0.1, 0.11, 0.11), 0.95, 1.05)));
      parts.push(noLine(P(CYL(0.065, 0.065, 0.06, 8), "#ff6b6b", -1.07, 0.62, s * 0.33, 1, 1, 1, 0, 0, Math.PI / 2 + 0.25)));
    }
    // 범퍼 · 웃는 입
    parts.push(P(rbox(0.12, 0.11, 0.9, 0.05, 2), "#fff5e6", 1.12, 0.37, 0));
    parts.push(P(rbox(0.12, 0.11, 0.86, 0.05, 2), "#fff5e6", -1.12, 0.38, 0));
    parts.push(noLine(P(rbox(0.05, 0.035, 0.26, 0.015, 1), "#c4594f", 1.135, 0.5, 0)));
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 5. 꼬마 트럭
  /** 짐칸에 호박을 실은 꼬마 트럭 — 둥근 운전칸 + 나무 짐칸 */
  function truck(o = {}) {
    const body = o.body ?? "#8fc7dc";
    const bodyDark = o.bodyDark ?? "#6fb0c9";
    const wood = "#d9a06a";
    const glass = "#e3f5fc";
    const parts = [];
    const W = 1.16;
    // 몸통 — 뒤는 낮은 짐칸 받침, 가운데는 문 높이까지 올라온 운전칸, 앞은 둥근 보닛
    parts.push(
      shade(P(loft([[-1.22, 0.5, 0.8, 0.22, 3], [-1.12, 0.52, 1.08, 0.36, 4], [-0.08, 0.52, 1.1, 0.38, 4], [0.0, 0.66, 1.1, 0.66, 4], [0.5, 0.67, 1.1, 0.68, 4], [0.64, 0.6, 1.08, 0.54, 4], [1.0, 0.57, 1.04, 0.46, 3.6], [1.16, 0.52, 0.9, 0.34, 3], [1.23, 0.5, 0.56, 0.18, 2.6]], 10), body), 0.8, 1.06),
    );
    if (o.open) {
      // 지붕을 걷은 모양(타는 동안) — 앞 유리 · 운전대 · 운전석 뒤 벽
      for (const s of [1, -1]) parts.push(P(rbox(0.06, 0.44, 0.06, 0.025, 1), body, 0.68, 1.16, s * 0.45, 1, 1, 1, 0, 0, 0.32));
      parts.push(noLine(P(rbox(0.07, 0.06, 0.96, 0.02, 1), body, 0.61, 1.38, 0, 1, 1, 1, 0, 0, 0.32)));
      parts.push(P(rbox(0.12, 0.28, 0.98, 0.05, 2), bodyDark, -0.04, 1.06, 0));
      parts.push(noLine(P((cache.wheelS ??= new T.TorusGeometry(0.13, 0.025, 4, 10)), "#4b4045", 0.5, 1.04, 0.2, 0.8, 0.8, 0.8, 0, Math.PI / 2 - 0.5, 0)));
    } else {
      // 유리 띠(앞 유리가 비스듬하다) + 조약돌 지붕 + 뒤 기둥
      parts.push(noLine(shade(P(loft([[-0.04, 1.0, 0.8, 0.1, 3], [0.02, 1.12, 0.98, 0.42, 5], [0.36, 1.13, 0.98, 0.44, 5], [0.58, 1.05, 0.94, 0.28, 4], [0.68, 0.98, 0.8, 0.08, 3]], 10), glass), 0.94, 1.05)));
      parts.push(P(loft([[-0.1, 1.29, 0.7, 0.05, 3], [0.0, 1.33, 1.02, 0.15, 5], [0.4, 1.33, 1.02, 0.15, 5], [0.54, 1.29, 0.8, 0.06, 3]], 10), body));
      parts.push(noLine(P(loft([[-0.06, 1.12, 1.0, 0.46, 5], [0.07, 1.12, 1.0, 0.46, 5]], 10), body)));
    }
    // 짐칸 — 바닥 + 낮은 나무 벽 셋
    parts.push(P(rbox(1.12, 0.1, 1.08, 0.04, 1), wood, -0.64, 0.74, 0));
    for (const s of [1, -1]) parts.push(P(rbox(1.12, 0.32, 0.08, 0.035, 1), wood, -0.64, 0.92, s * 0.5));
    parts.push(P(rbox(0.08, 0.32, 1.08, 0.035, 1), wood, -1.16, 0.92, 0));
    // 호박 둘
    for (const [x, z, r, c] of [[-0.85, 0.18, 0.2, "#f2a24a"], [-0.5, -0.15, 0.23, "#f6b25c"]]) {
      parts.push(P(SPH_TINY, c, x, 0.79 + r * 0.8, z, r, r * 0.8, r));
    }
    wheels(parts, [-0.74, 0.72], W, bodyDark);
    for (const s of [1, -1]) parts.push(noLine(P(SPH_SM, "#ffe27a", 1.13, 0.6, s * 0.31, 0.08, 0.1, 0.1)));
    parts.push(P(rbox(0.12, 0.11, 0.94, 0.05, 1), "#fff5e6", 1.22, 0.37, 0));
    parts.push(noLine(P(rbox(0.05, 0.035, 0.26, 0.015, 1), "#4f93ad", 1.225, 0.5, 0)));
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 6. 포장마차 수레
  /** 흰 천 지붕을 씌운 나무 수레 — 살 달린 큰 바퀴 넷, 앞에 끌채 */
  function wagon(o = {}) {
    const wood = o.wood ?? "#c98a56";
    const woodDark = o.woodDark ?? "#a36a3e";
    const cloth = o.cloth ?? "#fff3dc";
    const parts = [];
    const W = 1.05;
    parts.push(P(rbox(1.9, 0.36, W, 0.07, 2), wood, 0, 0.78, 0));
    for (const y of [0.7, 0.86]) for (const s of [1, -1]) parts.push(noLine(P(rbox(1.84, 0.03, 0.02, 0.01, 1), woodDark, 0, y, s * (W / 2 + 0.005))));
    // 천 지붕 — 아치 단면을 앞뒤로 이은 덩어리, 가운데가 살짝 꺼진다
    parts.push(shade(P(loft([[-0.98, 1.34, 0.9, 0.9, 2.2], [-0.9, 1.36, 1.08, 1.08, 2.4], [-0.3, 1.33, 1.02, 1.0, 2.4], [0.3, 1.33, 1.02, 1.0, 2.4], [0.9, 1.36, 1.08, 1.08, 2.4], [0.98, 1.34, 0.9, 0.9, 2.2]], 12), cloth), 0.86, 1.04));
    for (const x of [-0.6, 0, 0.6]) parts.push(noLine(P(loft([[x - 0.03, 1.34, 1.06, 1.05, 2.4], [x + 0.03, 1.34, 1.06, 1.05, 2.4]], 12), "#ecd9b8")));
    // 앞 · 뒤 트인 곳(어두운 타원)
    for (const s of [1, -1]) parts.push(noLine(shade(P(CYL(0.36, 0.36, 0.02, 12), "#8a5a3a", s * 0.985, 1.38, 0, 1, 1.15, 1, 0, 0, Math.PI / 2), 1, 1)));
    // 바퀴 — 나무 테 + 살 + 굴대
    const rim = (cache.rim ??= new T.TorusGeometry(0.4, 0.06, 5, 14));
    for (const x of [-0.62, 0.62])
      for (const s of [1, -1]) {
        const z = s * (W / 2 + 0.1);
        parts.push(P(rim, woodDark, x, 0.46, z));
        for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) parts.push(noLine(P(rbox(0.76, 0.05, 0.04, 0.015, 1), wood, x, 0.46, z, 1, 1, 1, 0, 0, a)));
        parts.push(noLine(P(CYL(0.09, 0.09, 0.1, 8), "#fff5e6", x, 0.46, z, 1, 1, 1, Math.PI / 2, 0, 0)));
      }
    // 끌채 + 손잡이
    parts.push(P(CYL(0.04, 0.04, 1.0, 6), woodDark, 1.4, 0.56, 0, 1, 1, 1, 0, 0, Math.PI / 2 + 0.28));
    parts.push(P(CYL(0.04, 0.04, 0.5, 6), woodDark, 1.88, 0.42, 0, 1, 1, 1, Math.PI / 2, 0, 0));
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 7. 뾰족 나무
  /** 세 단으로 쌓은 뾰족 나무 — 단마다 색이 조금씩 다르다 */
  function pine(o = {}) {
    const cols = o.leaves ?? ["#3e8a2b", "#4f9e34", "#63b140"];
    const parts = [];
    parts.push(P(CYL(0.14, 0.2, 0.7, 8), o.bark ?? "#a8653d", 0, 0.35, 0));
    const tier = (r, h) => lathe([[0.001, 0], [r * 0.8, 0], [r, 0.1], [r * 0.9, 0.24], [0.1, h], [0.001, h + 0.04]], 10);
    [[0.95, 1.0, 0.5], [0.76, 0.92, 1.1], [0.54, 0.86, 1.72]].forEach(([r, h, y], i) => parts.push(shade(P(tier(r, h), cols[i], 0, y, 0, 1, 1, 1, 0, i * 0.5, 0), 0.74, 1.08)));
    return build(parts, 0.028);
  }

  // ---------------------------------------------------------------- 8. 꽃 덤불
  /** 꽃이 핀 낮은 덤불 */
  function bush(o = {}) {
    const parts = [];
    for (const [x, y, z, r, c] of [[0, 0.34, 0, 0.44, "#4f9e34"], [0.38, 0.27, 0.1, 0.33, "#63b140"], [-0.36, 0.28, 0.06, 0.34, "#3e8a2b"], [0.05, 0.25, 0.34, 0.3, "#63b140"]]) parts.push(shade(P(SPH_LO, c, x, y, z, r, r * 0.86, r), 0.74, 1.08));
    const fl = o.flower ?? "#ff9db4";
    for (const [x, y, z] of [[0.1, 0.72, 0.18], [-0.25, 0.58, 0.28], [0.45, 0.5, 0.3], [-0.5, 0.48, -0.1], [0.3, 0.62, -0.2], [0.02, 0.42, 0.62]]) {
      parts.push(noLine(P(SPH_TINY, fl, x, y, z, 0.08, 0.06, 0.08)));
      parts.push(noLine(P(SPH_TINY, "#ffe27a", x, y + 0.035, z, 0.035, 0.03, 0.035)));
    }
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 9. 벤치
  /** 나무 살 벤치 — 등받이가 살짝 누웠다 */
  function bench(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const frame = o.frame ?? "#8fc7dc";
    const parts = [];
    for (const z of [-0.17, 0.02, 0.21]) parts.push(P(rbox(1.5, 0.06, 0.16, 0.025, 1), wood, 0, 0.47, z));
    for (const y of [0.72, 0.92]) parts.push(P(rbox(1.5, 0.15, 0.05, 0.02, 1), wood, 0, y, -0.3 - (y - 0.7) * 0.25, 1, 1, 1, -0.25, 0, 0));
    for (const s of [1, -1]) {
      parts.push(P(rbox(0.08, 0.46, 0.08, 0.03, 1), frame, s * 0.66, 0.23, 0.22));
      parts.push(P(rbox(0.08, 1.04, 0.08, 0.03, 1), frame, s * 0.66, 0.5, -0.3, 1, 1, 1, -0.2, 0, 0));
      parts.push(P(rbox(0.1, 0.07, 0.66, 0.03, 1), frame, s * 0.66, 0.66, -0.02));
    }
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 10. 가로등
  /** 노란 불빛 가로등 — 통통한 받침, 가는 기둥, 삿갓 쓴 등 */
  function lamp(o = {}) {
    const iron = o.iron ?? "#6b7a86";
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.24, 0], [0.22, 0.1], [0.1, 0.2], [0.07, 0.36], [0.001, 0.36]], 10), iron, 0, 0, 0));
    parts.push(P(CYL(0.045, 0.06, 2.0, 8), iron, 0, 1.3, 0));
    parts.push(P(CYL(0.16, 0.08, 0.1, 8), iron, 0, 2.32, 0));
    parts.push(noLine(shade(P(lathe([[0.001, 0], [0.14, 0], [0.2, 0.16], [0.17, 0.34], [0.001, 0.34]], 8), "#ffe58a", 0, 2.37, 0), 0.96, 1.06)));
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; parts.push(noLine(P(rbox(0.03, 0.36, 0.03, 0.01, 1), iron, Math.cos(a) * 0.185, 2.54, Math.sin(a) * 0.185))); }
    parts.push(P(lathe([[0.001, 0.2], [0.06, 0.18], [0.3, 0], [0.32, -0.04], [0.001, -0.04]].reverse(), 8), iron, 0, 2.75, 0));
    parts.push(P(SPH_TINY, iron, 0, 2.98, 0, 0.05, 0.05, 0.05));
    return build(parts, 0.016);
  }

  // ---------------------------------------------------------------- 11. 우체통
  /** 빨간 우체통 — 둥근 머리, 노란 깃발 */
  function mailbox(o = {}) {
    const red = o.color ?? "#f0796c";
    const parts = [];
    parts.push(P(CYL(0.05, 0.06, 0.8, 8), "#a8653d", 0, 0.4, 0));
    parts.push(shade(P(loft([[-0.3, 0.98, 0.3, 0.3, 2.6], [-0.27, 0.98, 0.38, 0.4, 3], [0.27, 0.98, 0.38, 0.4, 3], [0.3, 0.98, 0.3, 0.3, 2.6]], 10), red), 0.84, 1.06));
    parts.push(noLine(P(rbox(0.02, 0.05, 0.22, 0.01, 1), "#a84c44", 0.305, 1.03, 0)));
    parts.push(P(rbox(0.03, 0.26, 0.03, 0.01, 1), "#ffd36b", 0.05, 1.12, 0.2));
    parts.push(P(rbox(0.14, 0.1, 0.03, 0.01, 1), "#ffd36b", 0.1, 1.22, 0.2));
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 12. 우물
  /** 돌 우물 — 둥근 돌 테, 작은 지붕, 두레박 */
  function well(o = {}) {
    const stone = o.stone ?? "#c9c4bb";
    const roof = o.roof ?? "#f0907a";
    const wood = "#a8653d";
    const parts = [];
    // 돌 테 — 둥근 돌 블록을 두 단, 엇갈려 쌓는다. 안쪽은 어두운 속벽 + 물
    const tones = [stone, "#bdb7ad", "#d6d1c8"];
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 10; i++) {
        const a = ((i + row * 0.5) / 10) * Math.PI * 2;
        const k = 0.92 + ((i * 7 + row * 3) % 5) * 0.035; // 돌마다 크기가 조금씩 다르다
        parts.push(shade(P(rbox(0.46 * k, 0.31, 0.27, 0.08, 2), tones[(i + row) % 3], Math.sin(a) * 0.72, 0.16 + row * 0.3, Math.cos(a) * 0.72, 1, 1, 1, 0, a, 0), 0.86, 1.05));
      }
    parts.push(noLine(shade(P(CYL(0.64, 0.64, 0.5, 12), "#8f897f", 0, 0.25, 0), 0.9, 1)));
    parts.push(noLine(shade(P(CYL(0.6, 0.6, 0.03, 12), "#7cc4e8", 0, 0.51, 0), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.26, 0.26, 0.032, 10), "#a5dcf3", 0.12, 0.512, 0.1), 1, 1)));
    for (const s of [1, -1]) parts.push(P(rbox(0.11, 1.9, 0.11, 0.03, 1), wood, s * 0.74, 1.0, 0));
    parts.push(P(CYL(0.05, 0.05, 1.7, 6), wood, 0.06, 1.5, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    // 감는 손잡이
    parts.push(P(CYL(0.03, 0.03, 0.26, 5), "#6b5a52", 0.92, 1.38, 0));
    parts.push(P(CYL(0.03, 0.03, 0.2, 5), "#6b5a52", 1.0, 1.26, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    for (const s of [1, -1]) parts.push(shade(P(rbox(1.9, 0.12, 0.8, 0.05, 2), s > 0 ? roof : "#d9735f", 0, 2.12, s * 0.3, 1, 1, 1, s * 0.6, 0, 0), 0.9, 1.04));
    parts.push(P(CYL(0.06, 0.06, 1.94, 6), "#d9735f", 0, 2.36, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    // 줄 + 두레박
    parts.push(noLine(P(CYL(0.014, 0.014, 0.5, 4), "#ecd9b8", 0.1, 1.25, 0)));
    parts.push(P(CYL(0.14, 0.11, 0.22, 8), "#d9a06a", 0.1, 0.9, 0));
    parts.push(noLine(P(CYL(0.105, 0.105, 0.012, 8), "#7cc4e8", 0.1, 1.0, 0)));
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 13. 둥근 탁자
  /** 외다리 둥근 탁자 — 위에 찻잔 하나 */
  function table(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.34, 0], [0.32, 0.05], [0.09, 0.1], [0.07, 0.62], [0.14, 0.68], [0.001, 0.68]], 12), o.woodDark ?? "#c98a56", 0, 0, 0));
    parts.push(shade(P(lathe([[0.001, 0], [0.6, 0], [0.64, 0.04], [0.6, 0.08], [0.001, 0.08]], 16), wood, 0, 0.68, 0), 0.9, 1.05));
    parts.push(noLine(P(CYL(0.16, 0.16, 0.012, 10), "#fff5e6", 0.18, 0.766, 0.1)));
    parts.push(P(CYL(0.075, 0.055, 0.09, 8), "#9fd8e8", 0.18, 0.815, 0.1));
    parts.push(noLine(P(CYL(0.06, 0.06, 0.01, 8), "#c98a56", 0.18, 0.856, 0.1)));
    return build(parts, 0.012);
  }

  // ---------------------------------------------------------------- 14. 소파
  /** 폭신한 2인 소파 — 둥근 팔걸이, 방석 둘, 쿠션 하나 */
  function sofa(o = {}) {
    const fab = o.fabric ?? "#f4b6a6";
    const fabDark = o.fabricDark ?? "#e89a8a";
    const parts = [];
    for (const [x, z] of [[-0.7, -0.26], [0.7, -0.26], [-0.7, 0.26], [0.7, 0.26]]) parts.push(P(CYL(0.05, 0.035, 0.14, 6), "#a8653d", x, 0.07, z));
    parts.push(shade(P(rbox(1.7, 0.3, 0.78, 0.12, 2), fabDark, 0, 0.29, 0), 0.86, 1.04));
    parts.push(shade(P(rbox(1.7, 0.62, 0.26, 0.12, 3), fab, 0, 0.7, -0.28, 1, 1, 1, -0.1, 0, 0), 0.86, 1.06));
    for (const s of [1, -1]) {
      parts.push(shade(P(rbox(0.26, 0.5, 0.8, 0.12, 3), fab, s * 0.76, 0.5, 0), 0.86, 1.06));
      parts.push(shade(P(rbox(0.66, 0.16, 0.56, 0.07, 2), "#fff3dc", s * 0.33, 0.5, 0.06), 0.9, 1.04));
    }
    parts.push(P(rbox(0.3, 0.3, 0.12, 0.055, 2), "#9fd8e8", -0.36, 0.72, -0.08, 1, 1, 1, -0.35, 0.3, 0.2));
    return build(parts, 0.016);
  }

  // ---------------------------------------------------------------- 15. 꼬마 버스
  /** 노란 꼬마 버스 — 창 띠를 한 바퀴 두르고 기둥으로 나눈다 */
  function bus(o = {}) {
    const body = o.body ?? "#ffd36b";
    const bodyDark = o.bodyDark ?? "#f2b944";
    const glass = "#dff3fb";
    const parts = [];
    const W = 1.16;
    if (o.open) {
      // 지붕을 걷은 모양(타는 동안) — 창 아래까지만 남긴 몸통 · 앞 유리 · 운전대 · 의자 등받이 세 줄
      parts.push(shade(P(loft([[-1.42, 0.6, 0.9, 0.5, 3], [-1.32, 0.57, 1.14, 0.62, 4.5], [1.12, 0.57, 1.14, 0.62, 4.5], [1.34, 0.57, 1.08, 0.6, 4], [1.43, 0.55, 0.8, 0.4, 3]], 12), body), 0.82, 1.05));
      parts.push(noLine(P(loft([[-1.28, 0.6, 1.165, 0.08, 6], [1.14, 0.6, 1.165, 0.08, 6]], 10), "#f0796c")));
      for (const s of [1, -1]) parts.push(P(rbox(0.06, 0.46, 0.06, 0.025, 1), body, 1.22, 1.08, s * 0.47, 1, 1, 1, 0, 0, 0.25));
      parts.push(noLine(P(rbox(0.07, 0.06, 1.0, 0.02, 1), body, 1.17, 1.3, 0, 1, 1, 1, 0, 0, 0.25)));
      for (const x of [0.45, -0.2, -0.85]) parts.push(P(rbox(0.1, 0.2, 0.98, 0.045, 1), bodyDark, x, 0.95, 0));
      parts.push(P(rbox(0.1, 0.26, 1.02, 0.045, 1), body, -1.3, 0.98, 0));
      parts.push(noLine(P((cache.wheelS ??= new T.TorusGeometry(0.13, 0.025, 4, 10)), "#4b4045", 1.04, 0.94, 0.22, 0.8, 0.8, 0.8, 0, Math.PI / 2 - 0.5, 0)));
    } else {
      parts.push(shade(P(loft([[-1.42, 0.72, 0.9, 0.7, 3], [-1.32, 0.8, 1.14, 1.1, 4.5], [1.12, 0.8, 1.14, 1.1, 4.5], [1.34, 0.72, 1.08, 0.9, 4], [1.43, 0.62, 0.8, 0.5, 3]], 12), body), 0.82, 1.05));
      parts.push(noLine(shade(P(loft([[-1.22, 1.02, 1.165, 0.36, 6], [1.1, 1.02, 1.165, 0.36, 6]], 10), glass), 0.95, 1.04)));
      for (const x of [-0.78, -0.2, 0.38, 0.9]) parts.push(noLine(P(loft([[x - 0.045, 1.02, 1.175, 0.38, 6], [x + 0.045, 1.02, 1.175, 0.38, 6]], 10), body)));
      parts.push(noLine(P(loft([[-1.28, 0.6, 1.165, 0.08, 6], [1.14, 0.6, 1.165, 0.08, 6]], 10), "#f0796c")));
      parts.push(noLine(P(rbox(0.04, 0.34, 0.86, 0.05, 1), glass, 1.3, 1.0, 0, 1, 1, 1, 0, 0, 0.22)));
    }
    wheels(parts, [-0.86, 0.84], W, bodyDark);
    for (const s of [1, -1]) parts.push(noLine(P(SPH_SM, "#fff5e6", 1.39, 0.58, s * 0.3, 0.06, 0.09, 0.09)));
    parts.push(P(rbox(0.1, 0.11, 0.96, 0.05, 1), "#fff5e6", 1.42, 0.36, 0));
    parts.push(P(rbox(0.1, 0.11, 0.96, 0.05, 1), "#fff5e6", -1.42, 0.38, 0));
    return build(parts, 0.02);
  }

  // ---------------------------------------------------------------- 16. 자전거
  /** 바구니 달린 자전거 — 가는 대롱을 이어 만든 몸체 */
  function bicycle(o = {}) {
    const frame = o.frame ?? "#8fcf4f";
    const dark = "#4b4045";
    const parts = [];
    const tube = (col, [x1, y1], [x2, y2], r = 0.028, z = 0) => parts.push(P(CYL(r, r, Math.hypot(x2 - x1, y2 - y1), 6), col, (x1 + x2) / 2, (y1 + y2) / 2, z, 1, 1, 1, 0, 0, Math.atan2(-(x2 - x1), y2 - y1)));
    const rim = (cache.bikeRim ??= new T.TorusGeometry(0.31, 0.035, 5, 14));
    const A = [-0.5, 0.345], B = [0.52, 0.345], C = [-0.06, 0.36], D = [-0.2, 0.82], E = [0.36, 0.8];
    for (const [x, y] of [A, B]) {
      parts.push(P(rim, dark, x, y, 0));
      for (const a of [0, Math.PI / 2]) parts.push(noLine(P(rbox(0.6, 0.02, 0.015, 0.006, 1), "#c9c4bb", x, y, 0, 1, 1, 1, 0, 0, a + 0.4)));
      parts.push(noLine(P(CYL(0.045, 0.045, 0.07, 6), "#fff5e6", x, y, 0, 1, 1, 1, Math.PI / 2, 0, 0)));
    }
    tube(frame, A, C); tube(frame, C, D); tube(frame, D, E); tube(frame, C, E); tube(frame, A, D, 0.022); tube(frame, E, B, 0.026);
    tube(frame, E, [0.33, 0.98]);
    parts.push(P(CYL(0.022, 0.022, 0.5, 6), dark, 0.33, 0.98, 0, 1, 1, 1, Math.PI / 2, 0, 0));
    parts.push(P(rbox(0.26, 0.06, 0.13, 0.03, 1), "#a8653d", -0.22, 0.87, 0));
    // 바구니 · 발판
    parts.push(P(rbox(0.22, 0.18, 0.3, 0.04, 1), "#e2a873", 0.56, 0.84, 0));
    parts.push(noLine(P(SPH_TINY, "#ff9db4", 0.56, 0.95, 0.04, 0.07, 0.05, 0.07)));
    parts.push(noLine(P(rbox(0.12, 0.03, 0.26, 0.012, 1), dark, -0.06, 0.3, 0)));
    return build(parts, 0.012);
  }

  // ---------------------------------------------------------------- 17. 돛단배
  /** 흰 돛 두 장을 단 작은 배 */
  function boat(o = {}) {
    const hull = o.hull ?? "#f0796c";
    const parts = [];
    parts.push(shade(P(loft([[-1.12, 0.36, 0.3, 0.26, 2.6], [-0.92, 0.32, 0.8, 0.46, 3], [0, 0.28, 1.0, 0.54, 3], [0.7, 0.33, 0.8, 0.44, 3], [1.18, 0.46, 0.16, 0.16, 2.4]], 12), hull), 0.8, 1.05));
    parts.push(noLine(P(loft([[-0.95, 0.52, 0.72, 0.06, 3], [0, 0.52, 0.92, 0.06, 3], [0.72, 0.53, 0.7, 0.06, 3]], 10), "#fff5e6")));
    parts.push(P(CYL(0.035, 0.05, 1.9, 6), "#a8653d", 0.08, 1.45, 0));
    const sail = (w, h) => { const g = new T.ExtrudeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(w, 0), new T.Vector2(0, h)]), { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015); return g; };
    parts.push(shade(P((cache.sailA ??= sail(-0.95, 1.45)), "#fffdf4", 0.03, 0.78, 0), 0.9, 1.04));
    parts.push(shade(P((cache.sailB ??= sail(0.75, 1.15)), "#fff3dc", 0.14, 0.86, 0), 0.9, 1.04));
    parts.push(noLine(P(rbox(0.22, 0.12, 0.02, 0.01, 1), "#ffd36b", 0.2, 2.34, 0)));
    return build(parts, 0.018);
  }

  // ---------------------------------------------------------------- 18. 침대
  /** 폭신한 침대 — 둥근 머리판, 이불, 베개 */
  function bed(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const blanket = o.blanket ?? "#9fd8e8";
    const parts = [];
    for (const [x, z] of [[-0.5, -0.95], [0.5, -0.95], [-0.5, 0.95], [0.5, 0.95]]) parts.push(P(CYL(0.06, 0.05, 0.2, 6), "#c98a56", x, 0.1, z));
    parts.push(P(rbox(1.14, 0.2, 2.02, 0.07, 2), wood, 0, 0.28, 0));
    parts.push(shade(P(rbox(1.04, 0.22, 1.92, 0.1, 3), "#fff5e6", 0, 0.46, 0), 0.9, 1.03));
    parts.push(shade(P(rbox(1.1, 0.16, 1.22, 0.075, 3), blanket, 0, 0.54, 0.36), 0.88, 1.05));
    parts.push(noLine(P(rbox(1.1, 0.12, 0.22, 0.055, 2), "#ffffff", 0, 0.57, -0.3)));
    parts.push(P(rbox(0.62, 0.16, 0.38, 0.075, 3), "#ffffff", 0, 0.62, -0.68));
    parts.push(P(rbox(1.16, 0.7, 0.1, 0.045, 2), wood, 0, 0.55, -1.02));
    parts.push(P((cache.bedHead ??= new T.CylinderGeometry(0.58, 0.58, 0.1, 16, 1, false, -Math.PI / 2, Math.PI)), wood, 0, 0.88, -1.02, 1, 1, 0.55, Math.PI / 2, 0, 0));
    parts.push(noLine(P(SPH_TINY, "#ff9db4", 0, 0.98, -0.965, 0.07, 0.07, 0.02)));
    parts.push(P(rbox(1.16, 0.42, 0.1, 0.045, 2), wood, 0, 0.4, 1.02));
    return build(parts, 0.016);
  }

  // ---------------------------------------------------------------- 19. 책장
  /** 알록달록 책이 꽂힌 책장 — 맨 위에 화분 */
  function bookshelf(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const parts = [];
    parts.push(noLine(P(rbox(1.0, 1.62, 0.05, 0.02, 1), "#c98a56", 0, 0.81, -0.15)));
    for (const s of [1, -1]) parts.push(P(rbox(0.07, 1.66, 0.36, 0.03, 1), wood, s * 0.5, 0.83, 0));
    for (const y of [0.06, 0.58, 1.1, 1.63]) parts.push(P(rbox(1.0, 0.06, 0.36, 0.025, 1), wood, 0, y, 0));
    const cols = ["#f0796c", "#9fd8e8", "#ffd36b", "#8fcf4f", "#f4b6a6", "#8fc7dc", "#fff5e6"];
    let k = 3;
    for (const y of [0.09, 0.61, 1.13]) {
      let x = -0.42;
      while (x < 0.36) {
        k = (k * 7 + 5) % 11;
        const w = 0.07 + (k % 3) * 0.02, h = 0.3 + (k % 4) * 0.04, lean = k === 4 ? 0.22 : 0;
        parts.push(noLine(shade(P(rbox(w, h, 0.24, 0.015, 1), cols[k % cols.length], x + w / 2 + lean * 0.1, y + h / 2, 0.02, 1, 1, 1, 0, 0, -lean), 0.92, 1.04)));
        x += w + 0.012 + lean * 0.16;
      }
    }
    parts.push(P(CYL(0.11, 0.08, 0.16, 8), "#d98b62", 0.26, 1.74, 0));
    parts.push(P(SPH_TINY, "#4f9e34", 0.26, 1.92, 0, 0.15, 0.14, 0.15));
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 20. 스탠드 조명
  /** 갓 쓴 키 큰 스탠드 */
  function floorlamp(o = {}) {
    const shadeCol = o.shade ?? "#ffe9a8";
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.22, 0], [0.2, 0.05], [0.05, 0.09], [0.001, 0.09]], 10), "#c98a56", 0, 0, 0));
    parts.push(P(CYL(0.025, 0.03, 1.3, 6), "#c98a56", 0, 0.72, 0));
    parts.push(shade(P(lathe([[0.001, 0], [0.3, 0], [0.33, 0.04], [0.17, 0.4], [0.001, 0.4]], 12), shadeCol, 0, 1.3, 0), 0.92, 1.06));
    parts.push(noLine(P(CYL(0.26, 0.26, 0.01, 10), "#fff7d6", 0, 1.296, 0)));
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 21. 울타리 한 칸
  /** 흰 말뚝 울타리 한 칸 — 옆으로 이어 붙인다(폭 1.7) */
  function fence(o = {}) {
    const col = o.color ?? "#fff5e6";
    const parts = [];
    for (const y of [0.28, 0.6]) parts.push(noLine(P(rbox(1.7, 0.07, 0.04, 0.015, 1), "#ecd9b8", 0, y, -0.02)));
    for (let i = 0; i < 6; i++) {
      const x = -0.71 + i * 0.284, h = i % 5 === 0 ? 0.92 : 0.76;
      parts.push(P(rbox(i % 5 === 0 ? 0.15 : 0.13, h, i % 5 === 0 ? 0.1 : 0.05, 0.05, 2), col, x, h / 2, 0.02));
    }
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 22. 꽃밭
  /** 나무 테두리 안에 튤립이 핀 꽃밭 */
  function flowerbed(o = {}) {
    const parts = [];
    parts.push(P(rbox(1.5, 0.16, 0.86, 0.05, 1), "#c98a56", 0, 0.08, 0));
    parts.push(noLine(shade(P(rbox(1.36, 0.1, 0.72, 0.04, 1), "#8a5a3a", 0, 0.15, 0), 1, 1)));
    const cols = o.colors ?? ["#ff9db4", "#ffd36b", "#f0796c", "#fff5e6"];
    let k = 2;
    for (let i = 0; i < 9; i++) {
      k = (k * 5 + 3) % 13;
      const x = -0.54 + (i % 5) * 0.27 + (i > 4 ? 0.13 : 0), z = i > 4 ? 0.17 : -0.15, h = 0.3 + (k % 4) * 0.05;
      parts.push(noLine(P(CYL(0.014, 0.018, h, 4), "#4f9e34", x, 0.2 + h / 2, z)));
      parts.push(noLine(P(SPH_TINY, "#63b140", x + 0.06, 0.27, z, 0.07, 0.025, 0.04, 0, k, 0.5)));
      parts.push(P(SPH_TINY, cols[k % cols.length], x, 0.2 + h + 0.05, z, 0.075, 0.095, 0.075));
    }
    return build(parts, 0.012);
  }

  // ---------------------------------------------------------------- 23. 그네
  /** 나무 그네 — 세모 다리 둘, 줄 둘, 빨간 앉는 판 */
  function swing(o = {}) {
    const wood = o.wood ?? "#c98a56";
    const parts = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(P(CYL(0.05, 0.06, 2.14, 6), wood, sx * 0.95, 1.02, sz * 0.4, 1, 1, 1, -sz * 0.38, 0, 0));
    parts.push(P(CYL(0.055, 0.055, 2.1, 8), wood, 0, 2.02, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    for (const sx of [1, -1]) {
      parts.push(noLine(P(CYL(0.014, 0.014, 1.42, 4), "#ecd9b8", sx * 0.3, 1.3, 0.06, 1, 1, 1, 0.08, 0, 0)));
      parts.push(noLine(P(SPH_TINY, "#6b5a52", sx * 0.3, 2.02, 0, 0.05, 0.07, 0.07)));
    }
    parts.push(P(rbox(0.76, 0.07, 0.28, 0.03, 2), o.seat ?? "#f0796c", 0, 0.58, 0.12, 1, 1, 1, 0.08, 0, 0));
    return build(parts, 0.016);
  }

  // ---------------------------------------------------------------- 24. 이정표
  /** 화살표 판 둘이 달린 이정표 */
  function signpost(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const parts = [];
    const arrow = (cache.arrow ??= (() => { const g = new T.ExtrudeGeometry(new T.Shape([[-0.42, -0.11], [0.3, -0.11], [0.46, 0], [0.3, 0.11], [-0.42, 0.11]].map(([x, y]) => new T.Vector2(x, y))), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 }); g.translate(0, 0, -0.025); return g; })());
    parts.push(P(CYL(0.05, 0.065, 1.56, 8), "#a8653d", 0, 0.78, 0));
    parts.push(P(SPH_TINY, "#a8653d", 0, 1.58, 0, 0.075, 0.06, 0.075));
    parts.push(P(arrow, wood, 0.14, 1.3, 0.07, 1, 1, 1, 0, 0.12, 0.04));
    parts.push(P(arrow, "#f3c2a0", -0.12, 1.02, 0.07, 1, 1, 1, 0, Math.PI - 0.16, -0.05));
    for (const [x, y, w] of [[0.1, 1.32, 0.34], [0.12, 1.27, 0.24], [-0.1, 1.04, 0.3], [-0.06, 0.99, 0.2]]) parts.push(noLine(P(rbox(w, 0.022, 0.01, 0.004, 1), "#a8653d", x, y, 0.105)));
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 25~36. 마당 여덟 · 가구 넷(2026-11-15 추가)
  const tri = (w, h, d) => { const g = new T.ExtrudeGeometry(new T.Shape([new T.Vector2(-w / 2, 0), new T.Vector2(w / 2, 0), new T.Vector2(0, h)]), { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; };
  const flame = (r, h) => lathe([[0.001, 0], [r * 0.7, 0.02], [r, h * 0.28], [r * 0.55, h * 0.66], [0.001, h]], 7);

  /** 줄무늬 세모 텐트 */
  function tent(o = {}) {
    const cloth = o.cloth ?? "#fff3dc", stripe = o.stripe ?? "#f0907a";
    const parts = [];
    parts.push(shade(P((cache.tentA ??= tri(2.2, 1.6, 2.3)), cloth, 0, 0, 0), 0.86, 1.05));
    const sl = Math.atan2(1.6, 1.1), L = Math.hypot(1.6, 1.1);
    for (const s of [1, -1]) for (const t of [0.3, 0.62]) parts.push(noLine(P(rbox(0.16, 0.02, 2.32, 0.008, 1), stripe, s * (1.1 - Math.cos(sl) * L * t) + s * 0.012, Math.sin(sl) * L * t + 0.01, 0, 1, 1, 1, 0, 0, -s * sl)));
    parts.push(noLine(shade(P((cache.tentB ??= tri(1.0, 1.05, 0.02)), "#8a5a3a", 0, 0, 1.16), 1, 1)));
    parts.push(P(CYL(0.03, 0.03, 2.5, 5), "#a8653d", 0, 1.6, 0, 1, 1, 1, Math.PI / 2, 0, 0));
    parts.push(noLine(P(rbox(0.2, 0.13, 0.02, 0.008, 1), "#ffd36b", 0.1, 1.76, 1.24)));
    for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(P(CYL(0.03, 0.02, 0.16, 4), "#a8653d", sx * 1.2, 0.07, sz * 1.0, 1, 1, 1, 0, 0, sx * 0.4));
    return build(parts, 0.02);
  }

  /** 돌을 두른 모닥불 */
  function bonfire() {
    const parts = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(P(SPH_TINY, i % 2 ? "#c9c4bb" : "#b3ada2", Math.sin(a) * 0.62, 0.1, Math.cos(a) * 0.62, 0.17, 0.12, 0.15, 0, a, 0)); }
    for (const a of [0.2, 1.3, 2.4]) parts.push(P(CYL(0.07, 0.07, 0.9, 6), "#a8653d", 0, 0.16, 0, 1, 1, 1, Math.PI / 2 - 0.25, a, 0));
    parts.push(noLine(shade(P(flame(0.3, 0.9), "#f2a24a", 0, 0.14, 0), 0.95, 1.1)));
    parts.push(noLine(shade(P(flame(0.2, 0.62), "#ffd36b", 0.06, 0.16, 0.05), 1, 1.1)));
    parts.push(noLine(shade(P(flame(0.16, 0.5), "#f0796c", -0.16, 0.14, -0.08), 0.95, 1.08)));
    return build(parts, 0.016);
  }

  /** 캠프파이어(2026-11-19) — 통나무를 세워 쌓은 큰 불. 돌을 넓게 두르고, 불꽃이 사람 키를 넘는다 */
  function campfire() {
    const parts = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; parts.push(P(SPH_TINY, i % 2 ? "#c9c4bb" : "#b3ada2", Math.sin(a) * 1.42, 0.15, Math.cos(a) * 1.42, 0.27, 0.19, 0.23, 0, a, 0)); }
    // 바닥에 눕힌 통나무 셋, 그 위에 세워 기댄 통나무 일곱
    for (const a of [0.3, 1.35, 2.4]) parts.push(P(CYL(0.13, 0.13, 2.0, 7), "#8f5632", 0, 0.2, 0, 1, 1, 1, Math.PI / 2, a, 0));
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.2; parts.push(P(CYL(0.1, 0.13, 2.0, 7), i % 2 ? "#a8653d" : "#96592f", Math.sin(a) * 0.62, 0.95, Math.cos(a) * 0.62, 1, 1, 1, -0.5 * Math.cos(a), 0, 0.5 * Math.sin(a))); } // 위쪽이 가운데로 기울게
    // 불꽃 — 가운데 큰 것 하나, 둘레에 작은 것들
    parts.push(noLine(shade(P(flame(0.8, 2.7), "#f2a24a", 0, 0.5, 0), 0.95, 1.1)));
    parts.push(noLine(shade(P(flame(0.5, 2.0), "#ffd36b", 0.1, 0.6, 0.3), 1, 1.1)));
    for (const [x, z, r, h, c] of [[-0.42, -0.2, 0.3, 1.5, "#f0796c"], [0.4, -0.28, 0.28, 1.3, "#f2a24a"], [-0.2, 0.42, 0.26, 1.2, "#ffd36b"], [0.36, 0.34, 0.24, 1.1, "#f0796c"]]) parts.push(noLine(shade(P(flame(r, h), c, x, 0.45, z), 0.95, 1.08)));
    // 튀는 불티
    for (const [x, y, z] of [[0.3, 2.9, 0.1], [-0.25, 3.15, -0.1], [0.05, 3.4, 0.2], [-0.4, 2.6, 0.25], [0.45, 2.45, -0.2]]) parts.push(noLine(shade(P(SPH_TINY, "#ffe08a", x, y, z, 0.05, 0.05, 0.05), 1, 1.1)));
    return build(parts, 0.02);
  }

  /** 밀짚모자 쓴 허수아비 */
  function scarecrow(o = {}) {
    const shirt = o.shirt ?? "#f0796c";
    const parts = [];
    parts.push(P(CYL(0.05, 0.06, 1.7, 6), "#a8653d", 0, 0.85, 0));
    parts.push(P(CYL(0.045, 0.045, 1.5, 6), "#a8653d", 0, 1.42, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    parts.push(shade(P(rbox(0.62, 0.66, 0.34, 0.12, 2), shirt, 0, 1.22, 0), 0.86, 1.05));
    for (const s of [1, -1]) { parts.push(P(rbox(0.5, 0.2, 0.22, 0.07, 1), shirt, s * 0.52, 1.42, 0)); parts.push(noLine(P(SPH_TINY, "#ffd36b", s * 0.82, 1.42, 0, 0.1, 0.08, 0.08))); }
    parts.push(noLine(P(rbox(0.14, 0.14, 0.02, 0.02, 1), "#9fd8e8", -0.14, 1.16, 0.172)));
    parts.push(P(SPH_LO, "#f3d9a4", 0, 1.86, 0, 0.3, 0.3, 0.29));
    for (const s of [1, -1]) parts.push(noLine(P(SPH_TINY, "#4b4045", s * 0.1, 1.9, 0.27, 0.035, 0.04, 0.02)));
    parts.push(noLine(P(rbox(0.16, 0.03, 0.02, 0.01, 1), "#a8653d", 0, 1.78, 0.28)));
    parts.push(P(lathe([[0.001, 0.3], [0.2, 0.28], [0.24, 0.06], [0.48, 0.02], [0.5, -0.02], [0.001, -0.02]].reverse(), 10), "#ffd36b", 0, 2.08, 0, 1, 1, 1, 0.12, 0, 0.05));
    parts.push(noLine(P(CYL(0.25, 0.25, 0.05, 10), "#f0796c", 0, 2.17, 0, 1, 1, 1, 0.12, 0, 0.05)));
    return build(parts, 0.016);
  }

  /** 빨간 지붕 강아지 집 — 밥그릇 하나 */
  function doghouse(o = {}) {
    const roof = o.roof ?? "#f0796c";
    const parts = [];
    parts.push(P(rbox(1.1, 0.8, 1.2, 0.08, 2), "#fff3dc", 0, 0.4, 0));
    parts.push(shade(P((cache.dogG ??= tri(1.1, 0.5, 1.16)), "#fff3dc", 0, 0.78, 0), 1, 1));
    const sl = Math.atan2(0.5, 0.55), L = Math.hypot(0.5, 0.55) + 0.2;
    for (const s of [1, -1]) parts.push(shade(P(rbox(L, 0.09, 1.4, 0.04, 2), roof, s * 0.33, 1.07, 0, 1, 1, 1, 0, 0, -s * sl), 0.9, 1.04));
    parts.push(noLine(shade(P(rbox(0.46, 0.36, 0.03, 0.02, 1), "#6b5a52", 0, 0.2, 0.6), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.23, 0.23, 0.03, 12), "#6b5a52", 0, 0.38, 0.6, 1, 1, 1, Math.PI / 2, 0, 0), 1, 1)));
    parts.push(noLine(P(rbox(0.36, 0.11, 0.02, 0.02, 1), "#ffd36b", 0, 0.94, 0.59)));
    parts.push(P(CYL(0.16, 0.13, 0.1, 8), "#9fd8e8", 0.8, 0.05, 0.5));
    parts.push(noLine(P(CYL(0.12, 0.12, 0.02, 8), "#a8653d", 0.8, 0.1, 0.5)));
    return build(parts, 0.016);
  }

  /** 연잎 뜬 작은 연못 — 둘레에 돌, 한쪽에 부들 */
  function pond() {
    const parts = [];
    parts.push(noLine(shade(P(CYL(1.1, 1.16, 0.08, 16), "#7cc4e8", 0, 0.04, 0, 1, 1, 0.86), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.5, 0.5, 0.085, 12), "#a5dcf3", -0.2, 0.04, 0.1, 1, 1, 0.8), 1, 1)));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.2, k = 0.85 + ((i * 5) % 4) * 0.08; parts.push(P(SPH_TINY, i % 3 ? "#c9c4bb" : "#b3ada2", Math.sin(a) * 1.14, 0.08, Math.cos(a) * 0.98, 0.2 * k, 0.12, 0.17 * k, 0, a, 0)); }
    for (const [x, z, r] of [[0.35, -0.2, 0.2], [0.55, 0.25, 0.14], [-0.5, -0.3, 0.16]]) parts.push(noLine(P(CYL(r, r, 0.02, 9), "#63b140", x, 0.1, z)));
    parts.push(noLine(P(SPH_TINY, "#ff9db4", 0.35, 0.14, -0.2, 0.07, 0.05, 0.07)));
    for (const [x, z, h] of [[-0.85, 0.35, 0.8], [-0.95, 0.15, 0.62], [-0.72, 0.5, 0.55]]) { parts.push(noLine(P(CYL(0.012, 0.016, h, 4), "#4f9e34", x, h / 2, z))); parts.push(noLine(P(CYL(0.035, 0.035, 0.16, 6), "#8a5a3a", x, h, z))); }
    return build(parts, 0.014);
  }

  /** 목도리 두른 눈사람 */
  function snowman() {
    const parts = [];
    parts.push(shade(P(SPH, "#ffffff", 0, 0.45, 0, 0.5, 0.46, 0.5), 0.84, 1.02));
    parts.push(shade(P(SPH, "#ffffff", 0, 1.08, 0, 0.36, 0.34, 0.36), 0.86, 1.02));
    parts.push(shade(P(SPH_LO, "#ffffff", 0, 1.56, 0, 0.26, 0.25, 0.26), 0.88, 1.02));
    parts.push(noLine(P(CYL(0.3, 0.32, 0.1, 10), "#f0796c", 0, 1.35, 0)));
    parts.push(noLine(P(rbox(0.1, 0.34, 0.05, 0.02, 1), "#f0796c", 0.16, 1.2, 0.28, 1, 1, 1, 0, 0, -0.15)));
    parts.push(noLine(P(CYL(0.001, 0.045, 0.22, 6), "#f2a24a", 0, 1.56, 0.34, 1, 1, 1, Math.PI / 2, 0, 0)));
    for (const s of [1, -1]) parts.push(noLine(P(SPH_TINY, "#4b4045", s * 0.09, 1.64, 0.23, 0.03, 0.035, 0.02)));
    for (const y of [0.98, 1.14]) parts.push(noLine(P(SPH_TINY, "#4b4045", 0, y, 0.35, 0.03, 0.03, 0.02)));
    for (const s of [1, -1]) parts.push(P(CYL(0.02, 0.025, 0.5, 4), "#a8653d", s * 0.5, 1.2, 0, 1, 1, 1, 0, 0, -s * 1.0));
    parts.push(P(CYL(0.2, 0.2, 0.26, 10), "#4b4045", 0, 1.9, 0));
    parts.push(P(CYL(0.3, 0.3, 0.04, 10), "#4b4045", 0, 1.78, 0));
    return build(parts, 0.016);
  }

  /** 덩굴과 꽃을 감은 아치 문 */
  function flowerarch() {
    const parts = [];
    for (const s of [1, -1]) parts.push(P(rbox(0.12, 1.5, 0.12, 0.04, 1), "#fff5e6", s * 0.9, 0.75, 0));
    parts.push(P((cache.archT ??= new T.TorusGeometry(0.9, 0.07, 5, 14, Math.PI)), "#fff5e6", 0, 1.5, 0));
    const cols = ["#ff9db4", "#ffd36b", "#f0796c", "#fff5e6"];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI, x = Math.cos(a) * 0.9, y = 1.5 + Math.sin(a) * 0.9, k = 0.14 + (i % 3) * 0.025;
      parts.push(P(SPH_TINY, i % 2 ? "#4f9e34" : "#63b140", x, y, 0.02 * (i % 2 ? 1 : -1), k, k * 0.85, k));
      parts.push(noLine(P(SPH_TINY, cols[i % 4], x * 1.04, y + 0.04, 0.12, 0.06, 0.05, 0.05)));
    }
    for (const s of [1, -1]) for (const y of [0.5, 0.95]) parts.push(P(SPH_TINY, "#63b140", s * 0.9, y, 0.04, 0.13, 0.11, 0.13));
    return build(parts, 0.014);
  }

  /** 파라솔 탁자 — 의자 둘 */
  function parasol(o = {}) {
    const col = o.color ?? "#f0796c";
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.26, 0], [0.24, 0.05], [0.05, 0.08], [0.05, 0.62], [0.001, 0.62]], 10), "#fff5e6", 0, 0, 0));
    parts.push(shade(P(lathe([[0.001, 0], [0.52, 0], [0.55, 0.03], [0.52, 0.06], [0.001, 0.06]], 14), "#fff5e6", 0, 0.62, 0), 0.92, 1.04));
    parts.push(P(CYL(0.025, 0.025, 1.5, 6), "#c9c4bb", 0, 1.4, 0));
    parts.push(shade(P(lathe([[0.001, 0.42], [0.2, 0.36], [1.0, 0.02], [1.02, -0.02], [0.001, 0.06]].reverse(), 8), col, 0, 1.78, 0), 0.86, 1.06));
    parts.push(noLine(P(SPH_TINY, "#fff5e6", 0, 2.22, 0, 0.06, 0.06, 0.06)));
    for (const s of [1, -1]) { parts.push(P(CYL(0.2, 0.2, 0.06, 10), col, s * 0.85, 0.4, 0.1)); parts.push(P(CYL(0.035, 0.05, 0.4, 6), "#c9c4bb", s * 0.85, 0.2, 0.1)); }
    return build(parts, 0.016);
  }

  /** 세워 둔 피아노와 긴 의자 */
  function piano(o = {}) {
    const wood = o.wood ?? "#a8653d";
    const parts = [];
    parts.push(shade(P(rbox(1.5, 1.2, 0.46, 0.06, 2), wood, 0, 0.6, -0.1), 0.88, 1.05));
    parts.push(P(rbox(1.56, 0.07, 0.52, 0.03, 1), "#8a5a3a", 0, 1.22, -0.1));
    parts.push(P(rbox(1.5, 0.09, 0.3, 0.03, 1), wood, 0, 0.7, 0.24));
    parts.push(noLine(P(rbox(1.36, 0.03, 0.2, 0.01, 1), "#ffffff", 0, 0.76, 0.26)));
    for (let i = 0; i < 9; i++) if (i % 3 !== 2) parts.push(noLine(P(rbox(0.07, 0.03, 0.11, 0.008, 1), "#4b4045", -0.6 + i * 0.15, 0.785, 0.22)));
    parts.push(noLine(P(rbox(0.4, 0.3, 0.02, 0.01, 1), "#fff5e6", 0, 1.0, 0.14, 1, 1, 1, -0.2, 0, 0)));
    for (const s of [1, -1]) parts.push(P(rbox(0.09, 0.66, 0.09, 0.03, 1), "#8a5a3a", s * 0.68, 0.33, 0.3));
    parts.push(P(rbox(0.8, 0.08, 0.32, 0.035, 2), "#f0796c", 0, 0.46, 0.78));
    for (const s of [1, -1]) parts.push(P(rbox(0.07, 0.42, 0.26, 0.025, 1), "#8a5a3a", s * 0.34, 0.21, 0.78));
    return build(parts, 0.014);
  }

  /** 문 두 짝 옷장 */
  function wardrobe(o = {}) {
    const wood = o.wood ?? "#e2a873";
    const parts = [];
    for (const [x, z] of [[-0.5, -0.2], [0.5, -0.2], [-0.5, 0.2], [0.5, 0.2]]) parts.push(P(CYL(0.06, 0.045, 0.14, 6), "#c98a56", x, 0.07, z));
    parts.push(shade(P(rbox(1.24, 1.9, 0.6, 0.06, 2), wood, 0, 1.08, 0), 0.88, 1.05));
    parts.push(P(rbox(1.34, 0.1, 0.68, 0.04, 1), "#c98a56", 0, 2.06, 0));
    for (const s of [1, -1]) {
      parts.push(noLine(shade(P(rbox(0.54, 1.66, 0.03, 0.025, 1), "#f0c08e", s * 0.29, 1.1, 0.3), 0.94, 1.04)));
      parts.push(noLine(P(SPH_TINY, "#8a5a3a", s * 0.07, 1.1, 0.33, 0.035, 0.05, 0.03)));
    }
    return build(parts, 0.016);
  }

  /** 벽돌 벽난로 — 불이 타고 있다 */
  function fireplace() {
    const brick = "#e7a07a";
    const parts = [];
    parts.push(shade(P(rbox(1.6, 1.15, 0.5, 0.05, 2), brick, 0, 0.575, 0), 0.86, 1.05));
    parts.push(P(rbox(1.76, 0.1, 0.6, 0.04, 1), "#fff5e6", 0, 1.2, 0.02));
    parts.push(shade(P(rbox(0.9, 0.95, 0.38, 0.05, 2), brick, 0, 1.72, -0.05), 0.9, 1.04));
    parts.push(noLine(shade(P(rbox(0.9, 0.62, 0.03, 0.03, 1), "#5b4a42", 0, 0.4, 0.25), 1, 1)));
    parts.push(noLine(shade(P(CYL(0.45, 0.45, 0.03, 12), "#5b4a42", 0, 0.7, 0.25, 1, 0.55, 1, Math.PI / 2, 0, 0), 1, 1)));
    for (const a of [0.5, -0.5]) parts.push(noLine(P(CYL(0.06, 0.06, 0.6, 6), "#a8653d", 0, 0.16, 0.3, 1, 1, 1, Math.PI / 2, a, 0)));
    parts.push(noLine(shade(P(flame(0.2, 0.5), "#f2a24a", 0, 0.2, 0.3), 0.95, 1.1)));
    parts.push(noLine(shade(P(flame(0.12, 0.34), "#ffd36b", 0.08, 0.2, 0.34), 1, 1.1)));
    for (const [x, y] of [[-0.55, 0.9], [0.5, 0.3], [-0.6, 0.35], [0.56, 0.86], [0.2, 1.9], [-0.22, 1.56]]) parts.push(noLine(P(rbox(0.26, 0.1, 0.02, 0.01, 1), "#d98b62", x, y, y > 1.3 ? 0.145 : 0.255)));
    parts.push(P(rbox(0.3, 0.22, 0.03, 0.02, 1), "#9fd8e8", 0.45, 1.37, 0.1));
    return build(parts, 0.016);
  }

  /** 잎 넓은 큰 화분 */
  function bigplant() {
    const parts = [];
    parts.push(P(lathe([[0.001, 0], [0.22, 0], [0.3, 0.4], [0.32, 0.46], [0.26, 0.46], [0.001, 0.42]], 10), "#fff5e6", 0, 0, 0));
    parts.push(noLine(P(CYL(0.25, 0.25, 0.02, 10), "#8a5a3a", 0, 0.43, 0)));
    const L = [[0, 1.45, 0, 0.3, 0], [0.42, 1.1, 0.1, 0.26, -0.7], [-0.4, 1.15, 0.05, 0.27, 0.7], [0.12, 0.95, 0.4, 0.24, 0.3], [-0.15, 1.0, -0.38, 0.24, -0.3]];
    L.forEach(([x, y, z, r, tilt], i) => {
      parts.push(noLine(P(CYL(0.018, 0.022, Math.hypot(x, y - 0.44, z), 4), "#4f9e34", x / 2, (y + 0.44) / 2, z / 2, 1, 1, 1, Math.atan2(z, y - 0.44), 0, -Math.atan2(x, y - 0.44))));
      parts.push(shade(P(SPH_TINY, i % 2 ? "#63b140" : "#4f9e34", x, y, z, r, r * 0.28, r * 1.25, z * 0.8, i, tilt), 0.84, 1.08));
    });
    return build(parts, 0.014);
  }

  // ---------------------------------------------------------------- 37~48. 마당 여덟 · 가구 넷(2026-11-15 둘째 묶음)
  /** 빨간 고깔 풍차 — 날개 넷(돌지는 않는다) */
  function windmill() {
    const parts = [];
    parts.push(shade(P(lathe([[0.001, 0], [0.8, 0], [0.76, 0.1], [0.5, 2.2], [0.001, 2.2]], 12), "#fff3dc", 0, 0, 0), 0.84, 1.05));
    parts.push(shade(P(lathe([[0.001, 0.7], [0.12, 0.6], [0.6, 0.04], [0.62, -0.02], [0.001, -0.02]].reverse(), 10), "#f0796c", 0, 2.2, 0), 0.88, 1.05));
    parts.push(noLine(shade(P(rbox(0.4, 0.62, 0.03, 0.02, 1), "#c9835a", 0, 0.33, 0.77, 1, 1, 1, -0.12, 0, 0), 1, 1)));
    parts.push(noLine(P(CYL(0.15, 0.15, 0.03, 10), "#a9dcf2", 0, 1.3, 0.62, 1, 1, 1, Math.PI / 2 - 0.12, 0, 0)));
    parts.push(P(CYL(0.07, 0.07, 0.4, 8), "#a8653d", 0, 1.95, 0.62, 1, 1, 1, Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + (i * Math.PI) / 2, cx = Math.sin(a), cy = Math.cos(a);
      parts.push(P(rbox(0.06, 1.35, 0.04, 0.02, 1), "#a8653d", cx * 0.68, 1.95 + cy * 0.68, 0.82, 1, 1, 1, 0, 0, -a));
      parts.push(shade(P(rbox(0.36, 0.95, 0.02, 0.01, 1), "#fffdf4", cx * 0.86 + cy * 0.2, 1.95 + cy * 0.86 - cx * 0.2, 0.84, 1, 1, 1, 0, 0, -a), 0.94, 1.03));
    }
    parts.push(noLine(P(SPH_TINY, "#ffd36b", 0, 1.95, 0.86, 0.08, 0.08, 0.05)));
    return build(parts, 0.02);
  }

  /** 기둥 둘 사이에 건 해먹 */
  function hammock(o = {}) {
    const cloth = o.cloth ?? "#f0907a";
    const parts = [];
    for (const s of [1, -1]) { parts.push(P(CYL(0.05, 0.065, 1.3, 6), "#a8653d", s * 1.32, 0.62, 0, 1, 1, 1, 0, 0, -s * 0.22)); parts.push(noLine(P(CYL(0.012, 0.012, 0.36, 4), "#ecd9b8", s * 1.1, 1.02, 0, 1, 1, 1, 0, 0, s * 1.05))); }
    parts.push(shade(P(loft([[-0.98, 0.94, 0.12, 0.04, 2.2], [-0.7, 0.72, 0.66, 0.06, 2.4], [0, 0.56, 0.8, 0.08, 2.6], [0.7, 0.72, 0.66, 0.06, 2.4], [0.98, 0.94, 0.12, 0.04, 2.2]], 8), cloth), 0.9, 1.05));
    for (const x of [-0.42, 0.02, 0.46]) parts.push(noLine(P(loft([[x - 0.05, 0.6 + Math.abs(x) * 0.2, 0.83, 0.1, 2.6], [x + 0.05, 0.6 + Math.abs(x) * 0.2, 0.83, 0.1, 2.6]], 8), "#fff3dc")));
    parts.push(P(rbox(0.3, 0.1, 0.42, 0.05, 2), "#9fd8e8", -0.62, 0.82, 0, 1, 1, 1, 0, 0, -0.3));
    return build(parts, 0.016);
  }

  /** 통통 트램펄린 */
  function trampoline(o = {}) {
    const pad = o.pad ?? "#8fc7dc";
    const parts = [];
    parts.push(P((cache.trampR ??= new T.TorusGeometry(0.9, 0.1, 5, 16)), pad, 0, 0.5, 0, 1, 1, 1, Math.PI / 2, 0, 0));
    parts.push(noLine(shade(P(CYL(0.84, 0.84, 0.04, 16), "#4b4045", 0, 0.5, 0), 1, 1)));
    parts.push(noLine(P(CYL(0.3, 0.3, 0.045, 10), "#6b5a52", 0, 0.5, 0)));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(P(CYL(0.035, 0.035, 0.5, 5), "#c9c4bb", Math.sin(a) * 0.9, 0.25, Math.cos(a) * 0.9)); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; parts.push(noLine(P(rbox(0.16, 0.02, 0.08, 0.008, 1), "#fff5e6", Math.sin(a) * 0.9, 0.605, Math.cos(a) * 0.9, 1, 1, 1, 0, a, 0))); }
    return build(parts, 0.016);
  }

  /** 장대 위 새집 — 지붕에 작은 새 */
  function birdhouse() {
    const parts = [];
    parts.push(P(CYL(0.04, 0.055, 1.5, 6), "#a8653d", 0, 0.75, 0));
    parts.push(P(rbox(0.42, 0.38, 0.38, 0.05, 2), "#fff3dc", 0, 1.68, 0));
    for (const s of [1, -1]) parts.push(P(rbox(0.36, 0.06, 0.5, 0.025, 1), "#f0796c", s * 0.13, 1.96, 0, 1, 1, 1, 0, 0, -s * 0.7));
    parts.push(noLine(shade(P(CYL(0.08, 0.08, 0.02, 8), "#6b5a52", 0, 1.72, 0.195, 1, 1, 1, Math.PI / 2, 0, 0), 1, 1)));
    parts.push(P(CYL(0.015, 0.015, 0.14, 4), "#a8653d", 0, 1.58, 0.24, 1, 1, 1, Math.PI / 2, 0, 0));
    parts.push(P(SPH_TINY, "#ffd36b", 0.02, 2.14, 0.05, 0.08, 0.075, 0.1));
    parts.push(noLine(P(CYL(0.001, 0.022, 0.06, 4), "#f2a24a", 0.02, 2.15, 0.16, 1, 1, 1, Math.PI / 2, 0, 0)));
    parts.push(noLine(P(SPH_TINY, "#4b4045", 0.06, 2.17, 0.12, 0.014, 0.016, 0.012)));
    return build(parts, 0.012);
  }

  /** 꽃을 가득 실은 손수레 */
  function flowercart() {
    const parts = [];
    parts.push(P(rbox(1.2, 0.3, 0.72, 0.05, 2), "#e2a873", 0, 0.62, 0));
    parts.push(noLine(P(rbox(1.14, 0.03, 0.02, 0.01, 1), "#c98a56", 0, 0.62, 0.365)));
    parts.push(noLine(shade(P(rbox(1.08, 0.12, 0.6, 0.05, 1), "#4f9e34", 0, 0.8, 0), 1, 1)));
    const cols = ["#ff9db4", "#ffd36b", "#f0796c", "#fff5e6", "#c9a6f0"];
    let k = 4;
    for (let i = 0; i < 14; i++) { k = (k * 7 + 3) % 17; const x = -0.46 + (i % 7) * 0.153, z = i < 7 ? -0.14 : 0.16; parts.push(noLine(P(SPH_TINY, cols[k % 5], x, 0.9 + (k % 3) * 0.035, z + (k % 2) * 0.05, 0.085, 0.075, 0.085))); }
    const rim = (cache.cartRim ??= new T.TorusGeometry(0.3, 0.045, 5, 12));
    for (const s of [1, -1]) { parts.push(P(rim, "#a36a3e", -0.2, 0.32, s * 0.44)); parts.push(noLine(P(rbox(0.56, 0.04, 0.03, 0.012, 1), "#c98a56", -0.2, 0.32, s * 0.44, 1, 1, 1, 0, 0, 0.5))); parts.push(noLine(P(rbox(0.56, 0.04, 0.03, 0.012, 1), "#c98a56", -0.2, 0.32, s * 0.44, 1, 1, 1, 0, 0, -1.07))); }
    for (const s of [1, -1]) parts.push(P(CYL(0.03, 0.03, 0.7, 5), "#a36a3e", 0.86, 0.66, s * 0.3, 1, 1, 1, 0, 0, Math.PI / 2 - 0.2));
    parts.push(P(CYL(0.035, 0.04, 0.46, 5), "#a36a3e", 0.5, 0.24, 0));
    return build(parts, 0.016);
  }

  /** 줄무늬 차양을 친 과일 가게 */
  function fruitstall() {
    const parts = [];
    parts.push(shade(P(rbox(1.7, 0.75, 0.75, 0.06, 2), "#e2a873", 0, 0.375, 0), 0.88, 1.05));
    for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(P(rbox(0.07, 1.9, 0.07, 0.025, 1), "#a8653d", sx * 0.82, 0.95, sz * 0.33));
    for (let i = 0; i < 6; i++) parts.push(shade(P(rbox(0.32, 0.05, 1.1, 0.02, 1), i % 2 ? "#fff5e6" : "#f0796c", -0.8 + i * 0.32, 1.98, 0.1, 1, 1, 1, 0.28, 0, 0), 0.92, 1.04));
    const fruit = [["#f0796c", -0.52], ["#f2a24a", 0], ["#8fcf4f", 0.52]];
    for (const [c, x] of fruit) {
      parts.push(P(rbox(0.46, 0.14, 0.5, 0.03, 1), "#c98a56", x, 0.8, 0.08, 1, 1, 1, 0.18, 0, 0));
      for (const [dx, dz, dy] of [[-0.12, -0.1, 0], [0.12, -0.1, 0], [-0.12, 0.12, -0.03], [0.12, 0.12, -0.03], [0, 0, 0.1]]) parts.push(noLine(P(SPH_TINY, c, x + dx, 0.93 + dy, 0.08 + dz, 0.105, 0.1, 0.105)));
    }
    parts.push(noLine(P(rbox(0.7, 0.2, 0.03, 0.02, 1), "#fff5e6", 0, 0.42, 0.385)));
    return build(parts, 0.016);
  }

  /** 빨간 갓 버섯 셋 */
  function mushrooms() {
    const parts = [];
    for (const [x, z, k, c] of [[0, 0, 1, "#f0796c"], [0.5, 0.25, 0.62, "#f2a24a"], [-0.42, 0.3, 0.5, "#f0796c"]]) {
      parts.push(P(lathe([[0.001, 0], [0.2, 0], [0.15, 0.3], [0.13, 0.6], [0.001, 0.6]], 8), "#fff3dc", x, 0, z, k, k, k));
      parts.push(shade(P(lathe([[0.001, 0.4], [0.2, 0.36], [0.44, 0.12], [0.46, 0.02], [0.3, -0.03], [0.001, 0]].reverse(), 10), c, x, 0.55 * k, z, k, k, k), 0.84, 1.06));
      for (const [a, r, y] of [[0.4, 0.26, 0.26], [2.2, 0.3, 0.2], [4.2, 0.24, 0.28], [5.4, 0.36, 0.12]]) parts.push(noLine(P(SPH_TINY, "#fff5e6", x + Math.sin(a) * r * k, (0.55 + y) * k, z + Math.cos(a) * r * k, 0.05 * k, 0.03 * k, 0.05 * k)));
    }
    return build(parts, 0.016);
  }

  /** 땅에 내려앉은 열기구 */
  function airballoon(o = {}) {
    const col = o.color ?? "#f0907a";
    const parts = [];
    parts.push(shade(P(rbox(0.7, 0.5, 0.7, 0.07, 2), "#d9a06a", 0, 0.25, 0), 0.88, 1.05));
    parts.push(noLine(P(rbox(0.74, 0.07, 0.74, 0.03, 1), "#a36a3e", 0, 0.5, 0)));
    for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(noLine(P(CYL(0.012, 0.012, 1.0, 4), "#ecd9b8", sx * 0.33, 0.98, sz * 0.33, 1, 1, 1, -sz * 0.06, 0, sx * 0.06)));
    parts.push(shade(P(lathe([[0.001, 0], [0.34, 0], [0.48, 0.3], [0.8, 0.8], [1.02, 1.25], [1.12, 1.7], [1.06, 2.1], [0.86, 2.44], [0.5, 2.68], [0.001, 2.76]], 16), col, 0, 1.42, 0), 0.82, 1.06));
    for (const [y, r, r2] of [[2.6, 1.0, 0.94], [3.2, 1.135, 1.115]]) parts.push(noLine(P(CYL(r, r2, 0.16, 16), "#fff3dc", 0, y, 0)));
    parts.push(noLine(P(SPH_TINY, "#ffd36b", 0, 4.18, 0, 0.1, 0.07, 0.1)));
    return build(parts, 0.02);
  }

  /** 받침대 위 텔레비전 */
  function tvset() {
    const parts = [];
    for (const [x, z] of [[-0.55, -0.15], [0.55, -0.15], [-0.55, 0.15], [0.55, 0.15]]) parts.push(P(CYL(0.045, 0.035, 0.14, 6), "#c98a56", x, 0.07, z));
    parts.push(shade(P(rbox(1.4, 0.42, 0.46, 0.05, 2), "#e2a873", 0, 0.35, 0), 0.9, 1.05));
    for (const s of [1, -1]) { parts.push(noLine(P(rbox(0.6, 0.3, 0.02, 0.02, 1), "#f0c08e", s * 0.33, 0.35, 0.235))); parts.push(noLine(P(SPH_TINY, "#8a5a3a", s * 0.1, 0.35, 0.25, 0.03, 0.03, 0.02))); }
    parts.push(P(rbox(0.3, 0.06, 0.2, 0.02, 1), "#4b4045", 0, 0.59, 0));
    parts.push(P(rbox(1.16, 0.7, 0.08, 0.035, 2), "#4b4045", 0, 0.98, 0));
    parts.push(noLine(shade(P(rbox(1.04, 0.58, 0.02, 0.02, 1), "#9fd8e8", 0, 0.98, 0.04), 0.9, 1.08)));
    parts.push(noLine(P(rbox(0.5, 0.2, 0.01, 0.02, 1), "#8fcf4f", -0.2, 0.8, 0.052)));
    parts.push(noLine(P(SPH_TINY, "#ffd36b", 0.3, 1.12, 0.05, 0.08, 0.08, 0.01)));
    return build(parts, 0.014);
  }

  /** 서랍 달린 책상 — 스탠드 · 책 · 컵 */
  function desk() {
    const parts = [];
    parts.push(P(rbox(1.4, 0.07, 0.66, 0.03, 1), "#e2a873", 0, 0.76, 0));
    parts.push(P(rbox(0.44, 0.7, 0.6, 0.04, 2), "#e2a873", 0.46, 0.37, 0));
    for (const y of [0.56, 0.3]) { parts.push(noLine(P(rbox(0.36, 0.2, 0.02, 0.02, 1), "#f0c08e", 0.46, y, 0.305))); parts.push(noLine(P(SPH_TINY, "#8a5a3a", 0.46, y, 0.32, 0.03, 0.03, 0.02))); }
    parts.push(P(rbox(0.07, 0.72, 0.58, 0.03, 1), "#c98a56", -0.64, 0.36, 0));
    parts.push(P(lathe([[0.001, 0], [0.1, 0], [0.09, 0.02], [0.02, 0.04], [0.02, 0.3], [0.001, 0.3]], 8), "#6b7a86", -0.45, 0.795, -0.14));
    parts.push(P(lathe([[0.001, 0.16], [0.07, 0.15], [0.14, 0], [0.001, 0.02]].reverse(), 8), "#f0796c", -0.45, 1.06, -0.1, 1, 1, 1, 0.3, 0, 0));
    for (const [c, y, w] of [["#9fd8e8", 0.82, 0.36], ["#ffd36b", 0.87, 0.32], ["#f0796c", 0.915, 0.3]]) parts.push(noLine(P(rbox(w, 0.05, 0.24, 0.012, 1), c, 0.02, y, -0.08, 1, 1, 1, 0, (y - 0.8) * 3, 0)));
    parts.push(P(CYL(0.05, 0.04, 0.09, 8), "#fff5e6", 0.44, 0.84, 0.12));
    return build(parts, 0.014);
  }

  /** 받침대 위 어항 — 금붕어 둘 */
  function fishtank() {
    const parts = [];
    parts.push(shade(P(rbox(1.06, 0.6, 0.46, 0.05, 2), "#e2a873", 0, 0.3, 0), 0.9, 1.05));
    parts.push(noLine(P(rbox(0.92, 0.44, 0.02, 0.02, 1), "#f0c08e", 0, 0.3, 0.235)));
    parts.push(shade(P(rbox(1.0, 0.62, 0.42, 0.04, 2), "#a5dcf3", 0, 0.93, 0), 0.92, 1.06));
    parts.push(P(rbox(1.04, 0.06, 0.46, 0.02, 1), "#4b4045", 0, 1.26, 0));
    parts.push(noLine(P(rbox(0.94, 0.08, 0.01, 0.02, 1), "#ecd9b8", 0, 0.68, 0.212)));
    for (const [x, y, s] of [[-0.2, 0.98, 1], [0.24, 0.86, -1]]) { parts.push(noLine(P(SPH_TINY, "#f2a24a", x, y, 0.2, 0.09, 0.055, 0.03))); parts.push(noLine(P(rbox(0.07, 0.08, 0.01, 0.01, 1), "#f2a24a", x - s * 0.1, y, 0.212, 1, 1, 1, 0, 0, 0.78))); parts.push(noLine(P(SPH_TINY, "#4b4045", x + s * 0.05, y + 0.012, 0.228, 0.012, 0.012, 0.006))); }
    for (const [x, h] of [[-0.38, 0.3], [-0.32, 0.22], [0.4, 0.26]]) parts.push(noLine(P(rbox(0.035, h, 0.01, 0.012, 1), "#4f9e34", x, 0.72 + h / 2, 0.212, 1, 1, 1, 0, 0, x > 0 ? 0.12 : -0.1)));
    for (const [x, y] of [[0.05, 1.1], [0.1, 1.0], [-0.02, 0.92]]) parts.push(noLine(P(SPH_TINY, "#ffffff", x, y, 0.212, 0.018, 0.018, 0.006)));
    return build(parts, 0.014);
  }

  /** 추가 달린 키 큰 괘종시계 */
  function tallclock() {
    const wood = "#a8653d";
    const parts = [];
    parts.push(P(rbox(0.62, 0.14, 0.42, 0.04, 1), "#8a5a3a", 0, 0.07, 0));
    parts.push(shade(P(rbox(0.5, 1.3, 0.34, 0.05, 2), wood, 0, 0.78, 0), 0.88, 1.05));
    parts.push(P(rbox(0.62, 0.6, 0.4, 0.06, 2), wood, 0, 1.72, 0));
    parts.push(P(rbox(0.7, 0.09, 0.46, 0.035, 1), "#8a5a3a", 0, 2.05, 0));
    parts.push(noLine(P(CYL(0.22, 0.22, 0.02, 14), "#fff5e6", 0, 1.72, 0.205, 1, 1, 1, Math.PI / 2, 0, 0)));
    parts.push(noLine(P(rbox(0.025, 0.16, 0.01, 0.008, 1), "#4b4045", 0, 1.79, 0.22)));
    parts.push(noLine(P(rbox(0.025, 0.12, 0.01, 0.008, 1), "#4b4045", 0.045, 1.7, 0.22, 1, 1, 1, 0, 0, -1.1)));
    parts.push(noLine(shade(P(rbox(0.3, 0.8, 0.02, 0.03, 1), "#5b4a42", 0, 0.82, 0.172), 1, 1)));
    parts.push(noLine(P(rbox(0.02, 0.5, 0.01, 0.006, 1), "#ffd36b", 0.03, 0.92, 0.186, 1, 1, 1, 0, 0, 0.08)));
    parts.push(noLine(P(CYL(0.08, 0.08, 0.02, 10), "#ffd36b", 0.05, 0.62, 0.186, 1, 1, 1, Math.PI / 2, 0, 0)));
    return build(parts, 0.014);
  }

  /** 전체 목록 — [이름, 한글 이름, 바깥선 굵기] */
  const LIST = [["house", "작은 집", 0.022], ["tree", "둥근 나무", 0.028], ["pine", "뾰족 나무", 0.028], ["bush", "꽃 덤불", 0.02], ["car", "꼬마 자동차", 0.02], ["truck", "꼬마 트럭", 0.02], ["wagon", "포장 수레", 0.02], ["well", "우물", 0.02], ["bench", "벤치", 0.014], ["lamp", "가로등", 0.016], ["mailbox", "우체통", 0.014], ["chair", "나무 의자", 0.012], ["table", "둥근 탁자", 0.012], ["sofa", "소파", 0.016], ["bus", "꼬마 버스", 0.02], ["bicycle", "자전거", 0.012], ["boat", "돛단배", 0.018], ["swing", "그네", 0.016], ["fence", "울타리", 0.014], ["flowerbed", "꽃밭", 0.012], ["signpost", "이정표", 0.014], ["bed", "침대", 0.016], ["bookshelf", "책장", 0.014], ["floorlamp", "스탠드", 0.014], ["tent", "텐트", 0.02], ["bonfire", "모닥불", 0.016], ["campfire", "캠프파이어", 0.02], ["scarecrow", "허수아비", 0.016], ["doghouse", "강아지 집", 0.016], ["pond", "연못", 0.014], ["snowman", "눈사람", 0.016], ["flowerarch", "꽃 아치", 0.014], ["parasol", "파라솔 탁자", 0.016], ["piano", "피아노", 0.014], ["wardrobe", "옷장", 0.016], ["fireplace", "벽난로", 0.016], ["bigplant", "큰 화분", 0.014], ["windmill", "풍차", 0.02], ["hammock", "해먹", 0.016], ["trampoline", "트램펄린", 0.016], ["birdhouse", "새집", 0.012], ["flowercart", "꽃수레", 0.016], ["fruitstall", "과일 가게", 0.016], ["mushrooms", "버섯", 0.016], ["airballoon", "열기구", 0.02], ["tvset", "텔레비전", 0.014], ["desk", "책상", 0.014], ["fishtank", "어항", 0.014], ["tallclock", "괘종시계", 0.014]];
  window.RodemProps = { campfire, house, tree, pine, bush, car, truck, wagon, well, bench, lamp, mailbox, chair, table, sofa, bus, bicycle, boat, swing, fence, flowerbed, signpost, bed, bookshelf, floorlamp, tent, bonfire, scarecrow, doghouse, pond, snowman, flowerarch, parasol, piano, wardrobe, fireplace, bigplant, windmill, hammock, trampoline, birdhouse, flowercart, fruitstall, mushrooms, airballoon, tvset, desk, fishtank, tallclock, LIST, TOON, outlineMat };
})();
