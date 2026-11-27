/**
 * 구구 — 앱 마스코트, 새하얀 비둘기(2026-10-12). 구구 = 99(Ninetynine)이자 비둘기 소리.
 * 머리가 몸통만큼 큰 동글동글한 아기 비둘기. 정면(front)과 옆모습(side)의 머리 위 · 목 · 발 높이가 같다.
 *
 *   mood    base 기본 · smile 웃음(보고서를 냈을 때) · wave 인사(날개를 45° 두 번 흔든다) · sparkle 반짝(보상) · sleepy 졸림(휴주 · 마감 지남)
 *   view    front 정면 · side 옆모습(왼쪽을 본다) · fly 옆모습으로 날기(날개를 퍼덕인다)
 *
 * 좌표는 (0,0) 이 몸 가운데, 머리 위 -64 · 발 아래 61 — viewBox 는 정면 -70 -88 140 156, 옆모습 -74 -88 160 156.
 * 색은 모양에 붙은 고정 값이다 — 테두리(옅은 하늘빛 회색)가 어느 바탕에서나 모양을 지킨다.
 * 움직임(인사 · 날기)은 globals.css 의 gg-wave · gg-flap 이 맡고, 움직임을 줄인 기기에서는 멈춘다.
 * public/gugu/*.svg 는 같은 그림을 정적 파일로 굳힌 것(scripts/gugu-assets.mjs 가 이 좌표로 만든다).
 */

export type GuguMood = "base" | "smile" | "wave" | "sparkle" | "sleepy";
export type GuguView = "front" | "side" | "fly";

const LINE = "#C8D1E4";
const WING = "#EEF2FA";
const BELLY = "#F3F6FB";
const BLUSH = "#FFBFC8";
const INK = "#232B3A";
const BEAK = "#FFB37A";
const BEAK_LINE = "#F0975A";
const FOOT = "#FF9F96";
const STAR = "#FFCF5C";
const ZZ = "#8EA3C0";

/** 정면 몸통 — 큰 머리와 몸이 목에서 살짝 들어간다 */
const FRONT_BODY =
  "M0 -64 C30 -64 50 -48 50 -28 C50 -18 48 -11 45 -7 C51 -2 55 10 55 24 C55 45 33 55 0 55 C-33 55 -55 45 -55 24 C-55 10 -51 -2 -45 -7 C-48 -11 -50 -18 -50 -28 C-50 -48 -30 -64 0 -64 Z";
/** 옆모습 몸통 — 머리와 몸을 한 선으로, 뒤로 짧고 뾰족한 꼬리 */
const SIDE_BODY =
  "M-54 -18 C-58 -48 -32 -66 -6 -62 C16 -59 28 -44 28 -30 C28 -24 27 -20 26 -18 C48 -16 62 -6 64 6 L80 0 C84 10 80 20 70 24 C64 42 40 54 10 54 C-24 54 -50 40 -54 16 C-56 4 -56 -8 -54 -18 Z";
const STAR_PATH = "M0 -8 Q1.2 -1.2 8 0 Q1.2 1.2 0 8 Q-1.2 1.2 -8 0 Q-1.2 -1.2 0 -8 Z";

const stroke = { stroke: LINE, strokeWidth: 3, strokeLinejoin: "round" as const };

function Tuft({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) {
  return (
    <g transform={dx || dy ? `translate(${dx} ${dy})` : undefined}>
      <path d="M-5 -61 Q-12 -83 2 -80 Q5 -69 2 -61 Z" fill="#FFFFFF" {...stroke} />
      <path d="M1 -61 Q6 -78 17 -73 Q11 -65 7 -60 Z" fill="#FFFFFF" {...stroke} />
    </g>
  );
}

function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <path d={STAR_PATH} fill={STAR} transform={`translate(${x} ${y}) scale(${s})`} />;
}

function FrontEyes({ mood }: { mood: GuguMood }) {
  if (mood === "smile") {
    return (
      <g fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round">
        <path d="M-28 -28 Q-19 -41 -10 -28" />
        <path d="M10 -28 Q19 -41 28 -28" />
      </g>
    );
  }
  if (mood === "sleepy") {
    return (
      <g fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round">
        <path d="M-27 -31 Q-19 -23 -11 -31" />
        <path d="M11 -31 Q19 -23 27 -31" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={-19} cy={-32} rx={8.5} ry={10} fill={INK} />
      <ellipse cx={19} cy={-32} rx={8.5} ry={10} fill={INK} />
      {mood === "sparkle" ? (
        <>
          <path d={STAR_PATH} fill={STAR} transform="translate(-19 -32) scale(1.02 1.22)" />
          <path d={STAR_PATH} fill={STAR} transform="translate(19 -32) scale(1.02 1.22)" />
        </>
      ) : (
        <g fill="#FFFFFF">
          <circle cx={-16} cy={-36} r={3.5} />
          <circle cx={22} cy={-36} r={3.5} />
          <circle cx={-21.5} cy={-27} r={1.6} />
          <circle cx={16.5} cy={-27} r={1.6} />
        </g>
      )}
    </g>
  );
}

function Front({ mood }: { mood: GuguMood }) {
  const smile = mood === "smile";
  return (
    <g>
      <ellipse cx={-17} cy={56} rx={9} ry={5.5} fill={FOOT} />
      <ellipse cx={17} cy={56} rx={9} ry={5.5} fill={FOOT} />
      <ellipse cx={-53} cy={27} rx={11} ry={19} transform="rotate(24 -53 27)" fill={WING} {...stroke} />
      {/* 오른 날개 — 인사할 때 어깨(46,10)를 축으로 45° 올라갔다 내려오기를 두 번 */}
      <g className={mood === "wave" ? "gg-wave" : undefined}>
        <ellipse cx={53} cy={27} rx={11} ry={19} transform="rotate(-24 53 27)" fill={WING} {...stroke} />
      </g>
      <Tuft dy={0} />
      <path d={FRONT_BODY} fill="#FFFFFF" {...stroke} />
      <ellipse cx={0} cy={34} rx={32} ry={14} fill={BELLY} />
      <ellipse cx={-33} cy={smile ? -17 : -18} rx={smile ? 12 : 10} ry={smile ? 7 : 6} fill={smile ? "#FFB0BC" : BLUSH} />
      <ellipse cx={33} cy={smile ? -17 : -18} rx={smile ? 12 : 10} ry={smile ? 7 : 6} fill={smile ? "#FFB0BC" : BLUSH} />
      <FrontEyes mood={mood} />
      {smile ? (
        // 웃는 부리 — 아래 붉은 입(혀)은 뺐다(2026-11-10 사용자 — 무엇인지 알아보기 어렵다)
        <path d="M-7 -24 Q0 -29 7 -24 Q4 -18 0 -18 Q-4 -18 -7 -24 Z" fill={BEAK} stroke={BEAK_LINE} strokeWidth={1.5} strokeLinejoin="round" />
      ) : (
        <path d="M-6 -24 Q0 -28 6 -24 Q2 -15 0 -15 Q-2 -15 -6 -24 Z" fill={BEAK} stroke={BEAK_LINE} strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {mood === "sparkle" ? (
        <>
          <Star x={-62} y={-56} />
          <Star x={60} y={-62} s={0.8} />
          <Star x={68} y={-30} s={0.55} />
        </>
      ) : null}
      {mood === "sleepy" ? (
        <g fill="none" stroke={ZZ} strokeLinecap="round" strokeLinejoin="round">
          <path d="M38 -70 H50 L38 -58 H50" strokeWidth={3.5} />
          <path d="M56 -85 H64 L56 -77 H64" strokeWidth={3} />
        </g>
      ) : null}
    </g>
  );
}

function SideEye({ mood }: { mood: GuguMood }) {
  if (mood === "smile") return <path d="M-37 -28 Q-30 -38 -23 -28" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />;
  if (mood === "sleepy") return <path d="M-36 -32 Q-30 -25 -24 -32" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />;
  return (
    <g>
      <ellipse cx={-30} cy={-31} rx={7.5} ry={10} fill={INK} />
      {mood === "sparkle" ? (
        <path d={STAR_PATH} fill={STAR} transform="translate(-30 -31) scale(.9 1.22)" />
      ) : (
        <>
          <circle cx={-27.5} cy={-35} r={3.2} fill="#FFFFFF" />
          <circle cx={-32} cy={-26} r={1.5} fill="#FFFFFF" />
        </>
      )}
    </g>
  );
}

function Side({ mood, fly }: { mood: GuguMood; fly: boolean }) {
  return (
    <g>
      {fly ? (
        // 나는 동안 발은 몸 밑에 접고, 뒷날개 하나가 몸 뒤에서 같이 퍼덕인다
        <>
          <ellipse cx={0} cy={50} rx={7} ry={4.5} fill={FOOT} />
          <g className="gg-flap gg-flap-back">
            <ellipse cx={30} cy={-24} rx={13} ry={30} transform="rotate(25 30 -24)" fill="#E3E9F4" {...stroke} />
          </g>
        </>
      ) : (
        <>
          <ellipse cx={-6} cy={55} rx={8} ry={5} fill={FOOT} />
          <ellipse cx={14} cy={55} rx={8} ry={5} fill={FOOT} />
        </>
      )}
      <Tuft dx={-16} dy={1} />
      <path d={SIDE_BODY} fill="#FFFFFF" {...stroke} />
      <ellipse cx={-6} cy={37} rx={32} ry={11} fill={BELLY} />
      {fly ? (
        <g className="gg-flap">
          <ellipse cx={24} cy={-23} rx={15} ry={32} transform="rotate(31 24 -23)" fill={WING} {...stroke} />
        </g>
      ) : (
        <ellipse cx={28} cy={15} rx={24} ry={15} transform="rotate(10 28 15)" fill={WING} {...stroke} />
      )}
      <ellipse cx={-40} cy={-14} rx={9} ry={5.5} fill={BLUSH} />
      <SideEye mood={mood} />
      <path d="M-52 -28 Q-65 -26 -67 -21 Q-60 -16 -52 -17 Z" fill={BEAK} stroke={BEAK_LINE} strokeWidth={1.5} strokeLinejoin="round" />
      {mood === "sparkle" ? (
        <>
          <Star x={-64} y={-58} s={0.9} />
          <Star x={40} y={-58} s={0.7} />
        </>
      ) : null}
    </g>
  );
}

/** 구구 한 마리. size 는 높이(px) — 너비는 모양 비율대로 */
export function Gugu({
  mood = "base",
  view = "front",
  size = 96,
  className,
  title,
}: {
  mood?: GuguMood;
  view?: GuguView;
  size?: number;
  className?: string;
  /** 있으면 그림에 이름을 붙인다(스크린 리더). 없으면 꾸밈으로 숨긴다 */
  title?: string;
}) {
  const front = view === "front";
  const vb = front ? "-70 -88 140 156" : "-74 -88 160 156";
  const w = Math.round((size * (front ? 140 : 160)) / 156);
  return (
    <svg
      viewBox={vb}
      width={w}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-gugu={`${view}-${mood}`}
      // 인사하며 든 날개 · 반짝이 별이 그림 칸 밖으로 나가도 잘리지 않게
      style={{ overflow: "visible" }}
    >
      {front ? <Front mood={mood} /> : <Side mood={mood} fly={view === "fly"} />}
    </svg>
  );
}
