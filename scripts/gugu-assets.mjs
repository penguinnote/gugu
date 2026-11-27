#!/usr/bin/env node
/**
 * 구구 그림 파일 만들기 — src/components/gugu.tsx 를 그대로 그려서(한 군데에서만 그린다)
 *   public/gugu/*.svg            표정 · 방향별 정적 그림(인사 · 날기는 움직임까지 담는다)
 *   public/icon-192.png · icon-512.png · icon-maskable-512.png · apple-touch-icon.png
 *   src/app/favicon.ico          32 · 16 칸 두 장
 *   public/splash/*.png          아이폰 홈 화면 앱의 첫 화면(apple-touch-startup-image) — 흰 바탕 가운데 구구(시작 페이지와 같은 자리 · 크기)
 *   public/launch.html           앱 시작 페이지의 구구(인라인 SVG, <!-- gugu:start --> ~ <!-- gugu:end --> 사이) — 날개에 lw · rw 이름을 붙여 흔든다
 *   public/launch-icon.svg       둥근 앱 아이콘 그림(예전 시작 페이지 아이콘 — 지금은 쓰지 않지만 남겨 둔다)
 * 를 만든다. 구구 모양을 고치면 다시 돌린다:  node scripts/gugu-assets.mjs
 *
 * TSX 는 vite(vitest 와 같이 깔려 있다)로 읽고 react-dom/server 로 SVG 글자를 뽑아 sharp 로 PNG 를 굽는다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => path.join(root, ...p);

const vite = await createServer({ root, logLevel: "error", appType: "custom", server: { middlewareMode: true }, esbuild: { jsx: "automatic" } });
const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Gugu } = await vite.ssrLoadModule("/src/components/gugu.tsx");
const { SPLASH } = await vite.ssrLoadModule("/src/components/splash-devices.ts");

/** 구구 한 마리의 <svg> 글자 — 바깥 svg 의 크기 속성은 쓰는 쪽이 정한다 */
function guguSvg(props) {
  return renderToStaticMarkup(React.createElement(Gugu, { size: 156, ...props })).replace(' aria-hidden="true"', "");
}
/** 앱 아이콘용 구구(2026-11-10) — 옅은 하늘빛 회색 테두리(#C8D1E4, 굵기 3)를 짙은 회색(굵기 3.2)으로. 흰 바탕에서 모양이 보이게
 *  (처음엔 얇은 검정 2.5 — 사용자가 '살짝 두껍게, 회색으로') */
const ICON_INK = "#6b7280";
const inkOutline = (svg) => svg.replaceAll("#C8D1E4", ICON_INK).replace(/stroke-width="3"/g, 'stroke-width="3.2"');
/** 바깥 svg 안에 구구를 (cx, cy) 가운데 · 높이 h 로 놓는다 */
function place(props, cx, cy, h, ink = false) {
  const inner = ink ? inkOutline(guguSvg(props)) : guguSvg(props);
  const vb = inner.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const w = (h * vb[2]) / vb[3];
  return inner.replace(/<svg [^>]*?>/, `<svg x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" viewBox="${vb.join(" ")}">`);
}

const ANIM = `<style>
.gg-wave{transform-box:view-box;transform-origin:46px 10px;animation:gg-wave 2.6s ease-in-out infinite}
@keyframes gg-wave{0%,68%,100%{transform:rotate(0)}17%,51%{transform:rotate(-45deg)}34%{transform:rotate(0)}}
.gg-flap{transform-box:view-box;transform-origin:8px 4px;animation:gg-flap .42s ease-in-out infinite}
.gg-flap-back{transform-origin:14px 2px;animation-delay:-.06s}
@keyframes gg-flap{0%,100%{transform:rotate(0)}50%{transform:rotate(70deg)}}
@media (prefers-reduced-motion:reduce){.gg-wave,.gg-flap{animation:none}}
</style>`;

// 1) 정적 SVG
await mkdir(out("public/gugu"), { recursive: true });
const files = [
  ["front", { view: "front", mood: "base" }],
  ["front-smile", { view: "front", mood: "smile" }],
  ["front-wave", { view: "front", mood: "wave" }],
  ["front-sparkle", { view: "front", mood: "sparkle" }],
  ["front-sleepy", { view: "front", mood: "sleepy" }],
  ["side", { view: "side", mood: "base" }],
  ["side-fly", { view: "fly", mood: "base" }],
];
for (const [name, props] of files) {
  let svg = guguSvg(props).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  if (props.mood === "wave" || props.view === "fly") svg = svg.replace(/(<svg [^>]*>)/, `$1${ANIM}`);
  await writeFile(out("public/gugu", `${name}.svg`), svg + "\n");
}

// 2) 앱 아이콘 — 흰 바탕에 회색 테두리 구구 한 마리(2026-11-10 사용자 선택. 그 전엔 로뎀 월드 하늘 · 동산 바탕에 흰 구구).
//    마스크용은 가운데 80% 원 안에 들어오게 작게. 둥근 판(시작 페이지 · 첫 화면 · favicon)은 흰 바탕 위라 옅은 회색 테두리를 한 줄 두른다
function iconSvg(size, { scale = 0.74, rounded = false } = {}) {
  const h = size * scale;
  const r = rounded ? size * 0.22 : 0;
  const edge = rounded ? `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${r}" fill="none" stroke="#e5e7eb" stroke-width="${Math.max(1, size / 180)}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${r}" fill="#ffffff"/>
${edge}
${place({ view: "front", mood: "base" }, size / 2, size * 0.53, h, true)}
</svg>`;
}
const png = (svg, file) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out(file));
await png(iconSvg(512), "public/icon-512.png");
await png(iconSvg(192), "public/icon-192.png");
await png(iconSvg(180), "public/apple-touch-icon.png");
await png(iconSvg(512, { scale: 0.56 }), "public/icon-maskable-512.png");

// 3) favicon.ico — PNG 두 장을 ICO 상자에 담는다(16 · 32)
const icoPngs = await Promise.all([32, 16].map((s) => sharp(Buffer.from(iconSvg(s, { scale: 0.86, rounded: true }))).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoPngs.length, 4);
let offset = 6 + 16 * icoPngs.length;
const dirs = icoPngs.map((buf, i) => {
  const s = [32, 16][i];
  const d = Buffer.alloc(16);
  d.writeUInt8(s, 0);
  d.writeUInt8(s, 1);
  d.writeUInt8(0, 2);
  d.writeUInt8(0, 3);
  d.writeUInt16LE(1, 4);
  d.writeUInt16LE(32, 6);
  d.writeUInt32LE(buf.length, 8);
  d.writeUInt32LE(offset, 12);
  offset += buf.length;
  return d;
});
await writeFile(out("src/app/favicon.ico"), Buffer.concat([header, ...dirs, ...icoPngs]));

// 4) 앱 시작 페이지(public/launch.html) — 흰 바탕 가운데 구구만 크게(폭 170px, 2026-11-10 — 아이콘 판을 뺐다). 아이폰 첫 화면 그림도 같은 자리 · 같은 크기라
//    아이콘을 누른 순간부터 시작 페이지까지 그림이 이어진다(첫 화면 그림은 밝은 화면 한 가지). 테두리는 앱 아이콘과 같은 회색
const LAUNCH_GUGU = 170;
await writeFile(out("public/launch-icon.svg"), iconSvg(512, { rounded: true }) + "\n");
{
  const inline = inkOutline(guguSvg({ view: "front", mood: "base" }))
    .replace(/<svg [^>]*?>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -88 140 156" aria-hidden="true">')
    .replace(/(<ellipse cx="-53" cy="27"[^>]*><\/ellipse>)/, '<g class="lw">$1</g>')
    .replace('<g><ellipse cx="53" cy="27"', '<g class="rw"><ellipse cx="53" cy="27"');
  if (!inline.includes('class="lw"') || !inline.includes('class="rw"')) throw new Error("구구 날개를 찾지 못했다 — gugu.tsx 날개 모양이 바뀌었나?");
  const page = await readFile(out("public/launch.html"), "utf8");
  const next = page.replace(/(<!-- gugu:start[^>]*-->)[\s\S]*?(<!-- gugu:end -->)/, `$1\n${inline}\n$2`);
  if (next === page && !page.includes(inline)) throw new Error("launch.html 의 gugu:start · gugu:end 표시를 찾지 못했다");
  await writeFile(out("public/launch.html"), next);
}
await mkdir(out("public/splash"), { recursive: true });
for (const d of SPLASH) {
  const W = d.w * d.dpr;
  const H = d.h * d.dpr;
  const gw = LAUNCH_GUGU * d.dpr, gh = (gw * 156) / 140;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${place({ view: "front", mood: "base" }, W / 2, H / 2, gh, true)}
</svg>`;
  await png(svg, `public/splash/${d.w}x${d.h}@${d.dpr}x.png`);
}

await vite.close();
console.log(`구구 그림 ${files.length}장 · 아이콘 4장 · favicon · 시작 아이콘 · 첫 화면 ${SPLASH.length}장`);
