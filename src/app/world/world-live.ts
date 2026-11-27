"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * 로뎀 월드 함께 걷기 1단계(2026-10-14) — 월드에 있는 사람끼리 서로의 캐릭터를 실시간으로 본다.
 * Supabase Realtime 사설 채널 'world:lobby' 하나. 권한은 realtime.messages 정책(앱 사용자만, 마이그레이션 world_live).
 *   presence   누가 들어와 있나 — 키는 내 계정 id, 실어 보내는 것은 생김새 · 목장 자리 · 역할 · 이름표에 쓸 명단 이름(2026-11-18 사용자 — 연락처는 없다. 채널은 앱 사용자만)
 *   broadcast  'pos' — 자리 · 방향 · 속도 · 동작 · 집 안(움직이는 동안 1초에 두 번, 근처에 아무도 없으면 3초에 한 번 — 월드 index.html liveTell)
 * 월드(iframe)와는 메시지로만 — 채널 소식을 post 로 넘기고, 월드가 보낸 내 생김새 · 자리를 채널에 싣는다.
 * DB 에 아무것도 쓰지 않는다. 채널에 못 들어가면(권한 · 연결) 조용히 아무도 안 보일 뿐이다.
 */

export type LiveRole = "leader" | "pastor" | "admin";
export type LiveSelf = { userId: string; role: LiveRole; g: number; name?: string | null };
export type LivePos = { x: number; y: number; z: number; f: number; s: number; a: string; r: string | null; pi: number; v?: string; vg?: number; vs?: number };
export type LiveAct = "five" | "wave" | "play";
type Post = (msg: Record<string, unknown>) => void;
type Meta = { look: unknown; g: number; role: LiveRole; n?: string | null };

export const LIVE_TOPIC = "world:lobby";

/** 월드가 보낸 내 자리 — 모양이 맞는 것만 채널에 싣는다 */
export function toLivePos(m: Record<string, unknown>): LivePos | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const x = n(m.x), y = n(m.y), z = n(m.z), f = n(m.f), s = n(m.s);
  if (x === null || y === null || z === null || f === null || s === null) return null;
  const a = typeof m.a === "string" && ["w", "s", "j", "f", "p"].includes(m.a) ? m.a : "w";
  const r = typeof m.r === "string" && m.r.length < 40 ? m.r : null;
  const pi = Number.isInteger(m.pi) && (m.pi as number) >= 0 && (m.pi as number) < 100 ? (m.pi as number) : -1; // 타고 있는 조랑말 번호(없으면 -1)
  // 타고 있는 탈것(자전거 · 장난감 차 …) — 종류 · 어느 마을 · 몇 번 자리. 월드가 아는 것인지는 받는 월드가 다시 본다
  const int = (v: unknown, hi: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < hi ? (v as number) : -1);
  if (typeof m.v === "string" && /^[a-z0-9_]{1,24}$/.test(m.v)) return { x, y, z, f, s, a, r, pi, v: m.v, vg: int(m.vg, 100), vs: int(m.vs, 100) };
  return { x, y, z, f, s, a, r, pi };
}

/** presence 상태 → 월드에 넘길 사람 목록(나는 뺀다). 한 사람이 여러 기기로 들어오면 마지막 것 */
export function peersOf(state: Record<string, Meta[]>, self: string) {
  return Object.entries(state)
    .filter(([id, metas]) => id !== self && metas.length > 0)
    .map(([id, metas]) => {
      const m = metas[metas.length - 1];
      return { id, look: m.look ?? null, g: Number.isInteger(m.g) ? m.g : -1, role: m.role, n: typeof m.n === "string" ? m.n.slice(0, 12) : null };
    });
}

export function startWorldLive(self: LiveSelf, post: Post) {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let look: unknown = null;
  let joined = false;
  let stopped = false;
  const meta = (): Meta => ({ look, g: self.g, role: self.role, n: self.name ?? null });

  void (async () => {
    // 사설 채널은 로그인 토큰으로 들어간다 — 쿠키 세션의 토큰을 실시간 연결에도 건넨다
    const { data } = await supabase.auth.getSession();
    if (stopped) return;
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
    if (stopped) return;
    const ch = supabase.channel(LIVE_TOPIC, { config: { private: true, broadcast: { self: false }, presence: { key: self.userId, enabled: true } } });
    channel = ch;
    ch.on("presence", { event: "sync" }, () => post({ event: "peers", list: peersOf(ch.presenceState<Meta>(), self.userId) }))
      .on("broadcast", { event: "act" }, ({ payload }) => {
        // 몸짓(하이파이브) — 나에게 한 것인지 표시해 월드에 넘긴다(월드는 내 계정 id 를 모른다)
        const a = payload as { id?: unknown; k?: unknown; to?: unknown; i?: unknown } | null;
        if (!a || typeof a.id !== "string") return;
        if (a.k === "five" || a.k === "wave") post({ event: "peerAct", id: a.id, k: a.k, toMe: a.to === self.userId });
        else if (a.k === "play" && Number.isInteger(a.i)) post({ event: "peerAct", id: a.id, k: "play", i: a.i });
      })
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        if (payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string") post({ event: "peer", ...(payload as object) });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          joined = true;
          if (look) void ch.track(meta());
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          joined = false;
        }
      });
  })();

  return {
    /** 생김새가 바뀌면(처음 한 번 포함) presence 를 다시 싣는다 */
    setLook(l: unknown) {
      look = l;
      if (joined && channel) void channel.track(meta());
    },
    send(p: LivePos) {
      if (joined && channel) void channel.send({ type: "broadcast", event: "pos", payload: { id: self.userId, ...p } });
    },
    /** 몸짓 — 하이파이브('five') · 손 흔들기('wave')는 받는 사람(to, 계정 id), 놀아 주기('play')는 동물 번호(i) */
    act(k: LiveAct, to: string | null, i?: number) {
      if (joined && channel) void channel.send({ type: "broadcast", event: "act", payload: { id: self.userId, k, to, i } });
    },
    stop() {
      stopped = true;
      joined = false;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      post({ event: "liveState", on: false });
    },
  };
}
export type WorldLive = ReturnType<typeof startWorldLive>;
