/**
 * 프로필 사진(2026-11-11) — 공통 조각. 저장은 DB 함수(set_profile_photo)가 판정한다(WebP · JPEG, 200B~300KB, 본인 칸).
 * bytea 는 PostgREST 로 '\x' + 16진 글자로 온다 — 그림 응답으로 돌려준다(형식은 첫 바이트로 안다).
 */
export const PHOTO_PREFIXES = ["data:image/webp;base64,", "data:image/jpeg;base64,"] as const;

export function photoResponse(hexValue: unknown): Response {
  const hex = typeof hexValue === "string" && hexValue.startsWith("\\x") ? hexValue.slice(2) : null;
  if (!hex) return new Response("Not Found", { status: 404 });
  const buf = Buffer.from(hex, "hex");
  const type = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/webp";
  return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" } });
}

/** 사진이 없을 때 동그라미 색 — 사람마다 늘 같은 색(id 로 고른다) */
const DOT = ["#5aa9e6", "#7fb11c", "#f0975a", "#ef7c8e", "#8a6cc9", "#3fb6a8", "#e0a312"];
export function dotColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOT[h % DOT.length];
}

/**
 * 목장 사람의 기본 동그라미 색(2026-11-14 사용자 요청 — 역할로 통일): 목장장 갈색 · 리더 연두 · 양은 노랑 · 주황 중 하나(사람마다 늘 같은 색).
 * 목장 페이지 · 보고서 이름 앞 동그라미가 같이 쓴다. 사진이 있으면 사진.
 */
export const ROLE_DOT = { head: "#a8784f", leader: "#7fb11c", member: ["#e8b52f", "#f0975a"] } as const;
export function roleDotColor(p: { id: string; groupRole: "leader" | "member"; isHead?: boolean }): string {
  if (p.isHead) return ROLE_DOT.head;
  if (p.groupRole === "leader") return ROLE_DOT.leader;
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  return ROLE_DOT.member[h % ROLE_DOT.member.length];
}

/** 동그라미 안 글자 — 이름 둘째 글자(성 다음), 한 글자 이름이면 그 글자 */
export const initialOf = (name: string): string => (name.length >= 2 ? name[1] : name[0] ?? "");
