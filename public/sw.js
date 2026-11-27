/*
 * 구구(Ninetynine) 서비스 워커 — 웹 푸시(Step 7)와 앱 시작 페이지(2026-11-01).
 *
 * 오프라인 캐시는 하지 않는다(05 §1.2). 화면은 늘 서버 값이다. 기기에 담아 두는 것은 시작 페이지(public/launch.html)와
 * 그 아이콘 그림뿐이다 — 앱을 켜면 서버가 첫 화면을 만드는 동안 흰 백지가 오래 보여서(사용자 요청), 바깥에서 들어온 '/' 열기
 * (홈 화면 아이콘 · 알림 · 주소창 — 앞 페이지가 없다)에만 담아 둔 시작 페이지를 곧바로 내준다. 시작 페이지는 곧장 '/' 로
 * 다시 가는데, 그때는 앞 페이지(시작 페이지)가 있으므로 서버로 그대로 간다. 시작 페이지는 내줄 때마다 뒤에서 새로 받아 둔다.
 * 시작 페이지는 최소 1.4초 떠 있으므로(2026-11-02 · 11-04) 그동안 '/' 를 미리 받아 두었다가, 시작 페이지가 '/' 로 갈 때 그것을 내준다.
 * 끝까지 다 받은 뒤에 내준다(2026-11-03) — 조금씩 흘려보내면 홈의 '잠깐만요'(tabs/loading.tsx)가 먼저 그려졌다가 바뀐다.
 * 다 받았는지는 시작 페이지가 묻는다(message 'gg-warm', 2026-11-04) — 그때까지 막대가 3/5 에서 기다리고, 다 오면 끝까지 차고 넘어간다.
 *
 * 서버가 보내는 payload: { title, body, url, tag }. url 은 같은 출처의 경로만 연다.
 */

// v5(2026-11-10) — 시작 페이지를 구구만 크게 · 콩콩 뛰고 날개 흔들기 · 먹색 둥근 막대로. 이름을 바꿔야 기기에 담긴 옛 페이지를 새로 받는다
// v6(2026-11-10) — 막대를 구구 부리 주황으로
// v7(2026-11-10) — 막대를 다시 초록으로(진하게)
const LAUNCH_CACHE = "gg-launch-v7";
const LAUNCH_PAGE = "/launch.html";
const LAUNCH_ICON = "/launch-icon.svg";
// 방금 시작 페이지를 내줬으면 잠깐은 '/' 를 서버로 보낸다 — 앞 페이지 정보가 빠지는 기기에서도 끝없이 돌지 않게
let launchedAt = 0;
// 시작 페이지를 띄우며 미리 받기 시작한 '/' — 한 번만 쓰고, 10초가 지나면 버린다(시작 페이지는 길어야 8초 기다린다)
let warm = null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(LAUNCH_CACHE)
      .then((c) => c.addAll([LAUNCH_PAGE, LAUNCH_ICON].map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gg-launch-") && k !== LAUNCH_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === LAUNCH_ICON) {
    event.respondWith(caches.match(LAUNCH_ICON).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode !== "navigate" || url.pathname !== "/" || url.search) return;
  if (warm) {
    const w = warm;
    warm = null;
    if (Date.now() - w.at < 10000) {
      event.respondWith(w.res.catch(() => fetch(req)));
      return;
    }
  }
  if (req.referrer) return;
  if (Date.now() - launchedAt < 4000) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(LAUNCH_CACHE);
      const hit = await cache.match(LAUNCH_PAGE);
      const fresh = fetch(LAUNCH_PAGE, { cache: "no-cache" }).then((res) => {
        if (res.ok) return cache.put(LAUNCH_PAGE, res);
      });
      if (!hit) {
        event.waitUntil(fresh.catch(() => {}));
        return fetch(req);
      }
      event.waitUntil(fresh.catch(() => {}));
      launchedAt = Date.now();
      // 로그인 안 했으면 /login 으로 넘기는 응답이 온다 — 따라가지 않고 그대로 내줘야 브라우저가 주소를 바꾼다
      const res = fetch("/", { redirect: "manual", cache: "no-store" }).then(async (r) =>
        r.type === "opaqueredirect" || !r.body ? r : new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }),
      );
      warm = { at: launchedAt, res };
      event.waitUntil(res.catch(() => {}));
      return hit;
    })(),
  );
});

self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (event.data !== "gg-warm" || !port) return;
  const w = warm;
  if (!w) return port.postMessage("none");
  port.postMessage("wait");
  event.waitUntil(w.res.then(() => port.postMessage("ready"), () => port.postMessage("fail")));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "구구";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
