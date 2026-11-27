import { mkdirSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { callClaude, DIGEST_MODELS, estimateCostUsd, resolveDigestEffort, resolveDigestModel, type DigestModel } from "../../src/lib/ai/digest-call";
import { countDrops, fillNames, pseudonymize, validateDigest, type DropReason, type DroppedItem, type Pseudonymized, type StoredItem } from "../../src/lib/ai/digest-core";
import { excludedNameLeaks, hasNameAt } from "../../src/lib/ai/names";


/**
 * AI 주간 정리 평가(2026-11-07, 모델 비교 2026-11-06) — 가짜 자료 네 주를 실제 Claude 에 보내고 검사한다. 돈이 든다.
 *   npm run eval:digest                                              DIGEST_MODEL(없으면 소넷) 하나
 *   EVAL_MODELS=claude-sonnet-5-5,claude-haiku-5-5 npm run eval:digest  모델마다 같은 자료
 *   effort 는 DIGEST_EFFORT(기본 medium) — 모델이 지원하지 않는 값이면 medium
 *   EVAL_FIXTURE=large 면 큰 자료(fixtures-large.ts — 목장 12 · 85명 · 6주), 아니면 fixtures.ts
 * ANTHROPIC_API_KEY 가 있을 때만 돈다. 결과는 eval/digest/out/ — JSON 하나 + 주차마다 모델을 나란히 놓은 마크다운(커밋하지 않는다).
 * 본다: 검사 통과 · 버린 항목 수 · 금지어 · 실명(가짜 이름) 새지 않음 · 뺀 사람 글이 나오지 않음 · 토큰 · 시간 · 예상 비용
 *       AI 에서 뺀 사람의 이름(성 없이도 · 두 글자 이름은 한 글자 + 호칭 등) — 보내는 글에 남으면 실패
 *         (names.ts excludedNameLeaks — 가리기와 같은 규칙. 흔한 낱말 이름은 낱말과 구별할 수 없어 빼고 본다)
 *       나머지 사람의 이름만 나온 것(GIVEN_ONLY) — 보내는 글 · 결과에 남았는지 적기만 한다(앞이 한글이 아닐 때만 센다 — names.ts 와 같은 경계)
 *       버린 항목 — 까닭별 개수(상한 넘음 · 근거 없음 · 모르는 기호 · 그 밖)와 원문(기호는 가짜 이름으로 바꿔 읽기 쉽게). 결과 파일에만 남는다
 */
const fixtureName = process.env.EVAL_FIXTURE === "large" ? "large" : "default";
const fx = fixtureName === "large" ? await import("./fixtures-large") : await import("./fixtures");
const { FORBIDDEN, EXCLUDED_TEXT, GIVEN_ONLY, groups, persons, weeks } = fx;
const fixtureFile = fixtureName === "large" ? "eval/digest/fixtures-large.ts" : "eval/digest/fixtures.ts";
const run = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;
const people = new Map(persons.map((p) => [p.id, p.name]));
const groupNames = new Map(groups.map((g) => [g.id, g.name]));

/** EVAL_MODELS — 쉼표로 구분, 모르는 값은 버린다. 없거나 다 버려지면 DIGEST_MODEL 하나 */
function evalModels(): DigestModel[] {
  const picked = (process.env.EVAL_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DigestModel => (DIGEST_MODELS as readonly string[]).includes(s));
  return picked.length ? [...new Set(picked)] : [resolveDigestModel()];
}

type Shown = { highlights: string[]; thanks: string[]; groups: string[]; intercession: string[] };
type Drops = { dropReasons: Record<DropReason, number>; droppedItems: DroppedItem[] };
type ModelResult =
  | ({ ok: true; effort: string; ms: number; tokens: { in: number; out: number }; costUsd: number; dropped: number; forbidden: string[]; leakedExcluded: boolean; leakedNames: boolean; givenSent: string[]; givenOut: string[]; shown: Shown } & Drops)
  | ({ ok: false; effort: string; ms: number; reason: string } & Partial<Drops>);

const DROP_LABEL: Record<DropReason, string> = { over_limit: "상한 넘음", no_source: "근거 없음", unknown_token: "모르는 기호", person_mismatch: "근거와 사람 불일치", other: "그 밖" };

/** 버린 항목 — 기호를 가짜 이름으로 바꿔 읽기 쉽게(모르는 기호는 그대로) */
function dropsOf(list: DroppedItem[], ps: Pseudonymized): Drops {
  const name = (t: string) => {
    const pid = ps.person.get(t);
    const gid = ps.group.get(t);
    return pid ? (people.get(pid) ?? t) : gid ? `${groupNames.get(gid) ?? t} 목장` : t;
  };
  return { dropReasons: countDrops(list), droppedItems: list.map((d) => ({ ...d, text: d.text.replace(/\b[PG]\d{2,3}\b/g, name) })) };
}
type WeekResult = { week: string; skipped?: string; models: Partial<Record<DigestModel, ModelResult>> };

const models = evalModels();
const results: WeekResult[] = weeks.map((w) => ({ week: w.weekKey, models: {} }));

run(`AI 주간 정리 평가 · ${models.join(" vs ")}`, () => {
  for (const [wi, week] of weeks.entries()) {
    for (const model of models) {
      it(`${week.weekKey} · ${model}`, { timeout: 180_000 }, async () => {
        const slot = results[wi];
        const ps = pseudonymize(week);
        if (!ps) {
          slot.skipped = "보낼 글 없음";
          return;
        }
        // 보내는 글에 이름이 없다
        for (const p of persons) expect(ps.body, `보내는 글에 ${p.name}`).not.toContain(p.name);
        const effort = resolveDigestEffort(model);
        // AI 에서 뺀 사람 이름(성 없이도)이 남으면 부르지 않고 실패
        const leakedExcludedGiven = excludedNameLeaks(persons, ps.body);
        if (leakedExcludedGiven.length) {
          slot.models[model] = { ok: false, effort, ms: 0, reason: `보내는 글에 AI 에서 뺀 사람 이름: ${leakedExcludedGiven.join(", ")}` };
          throw new Error(slot.models[model].reason);
        }

        const started = Date.now();
        const r = await callClaude(ps.body, { model, effort });
        const ms = Date.now() - started;
        if (!r.ok) {
          slot.models[model] = { ok: false, effort, ms, reason: r.reason };
          throw new Error(`호출 실패: ${r.reason}`);
        }
        const v = validateDigest(r.out, ps);
        if (!v.ok) {
          slot.models[model] = { ok: false, effort, ms, reason: v.reason, ...dropsOf(v.drops, ps) };
          throw new Error(`검사 실패: ${v.reason}`);
        }

        const raw = JSON.stringify(r.out);
        const fill = (list: StoredItem[]) => list.map((it) => fillNames(it.text, people, groupNames));
        const shown: Shown = {
          highlights: fill(v.digest.highlights),
          thanks: fill(v.digest.thanks),
          groups: v.digest.groups.map((g) => `${groupNames.get(g.g) ?? "?"} — ${fillNames(g.text, people, groupNames)}`),
          intercession: fill(v.digest.intercession),
        };
        const result: ModelResult = {
          ok: true,
          effort,
          ms,
          tokens: { in: r.inputTokens, out: r.outputTokens },
          costUsd: estimateCostUsd(model, r.inputTokens, r.outputTokens),
          dropped: v.digest.dropped,
          forbidden: FORBIDDEN.filter((w) => raw.includes(w)),
          leakedExcluded: EXCLUDED_TEXT.some((t) => raw.includes(t)),
          leakedNames: persons.some((p) => raw.includes(p.name)),
          givenSent: GIVEN_ONLY.filter((n) => hasNameAt(ps.body, n)),
          givenOut: GIVEN_ONLY.filter((n) => hasNameAt(raw, n)),
          shown,
          ...dropsOf(v.drops, ps),
        };
        slot.models[model] = result;
        expect(result.forbidden, "금지어").toEqual([]);
        expect(result.leakedExcluded, "AI 에서 뺀 사람의 글").toBe(false);
        expect(result.leakedNames, "응답에 실명").toBe(false);
      });
    }
  }

  afterAll(() => {
    mkdirSync("eval/digest/out", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const totals = Object.fromEntries(models.map((m) => [m, totalOf(m)]));
    const base = `eval/digest/out/${stamp}${fixtureName === "large" ? "-large" : ""}`;
    const json = `${base}.json`;
    writeFileSync(json, JSON.stringify({ fixture: fixtureName, models, totals, weeks: results }, null, 2));
    const md = `${base}.md`;
    writeFileSync(md, markdown(totals));
    console.log(`평가 결과: ${json}\n나란히 보기: ${md}`);
  });
});

function totalOf(m: DigestModel) {
  let costUsd = 0, ms = 0, inTok = 0, outTok = 0, ok = 0, failed = 0, dropped = 0;
  const dropReasons: Record<DropReason, number> = { over_limit: 0, no_source: 0, unknown_token: 0, person_mismatch: 0, other: 0 };
  for (const w of results) {
    const r = w.models[m];
    if (!r) continue;
    ms += r.ms;
    for (const k of Object.keys(dropReasons) as DropReason[]) dropReasons[k] += r.dropReasons?.[k] ?? 0;
    if (r.ok) {
      ok++;
      costUsd += r.costUsd;
      inTok += r.tokens.in;
      outTok += r.tokens.out;
      dropped += r.dropped;
    } else failed++;
  }
  return { ok, failed, dropped, dropReasons, tokens: { in: inTok, out: outTok }, ms, costUsd };
}

// ---------------------------------------------------------------------------- 마크다운

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const usd = (n: number) => `$${n.toFixed(4)}`;
const reasons = (c: Record<DropReason, number> | undefined) =>
  c ? (Object.keys(DROP_LABEL) as DropReason[]).filter((k) => c[k]).map((k) => `${DROP_LABEL[k]} ${c[k]}`).join(" · ") || "없음" : "—";
const SECTIONS: [keyof Shown, string][] = [
  ["highlights", "눈여겨볼 것"],
  ["thanks", "감사 제목"],
  ["groups", "목장별 한 줄"],
  ["intercession", "함께 기도할 제목"],
];

function markdown(totals: Record<string, ReturnType<typeof totalOf>>): string {
  const head = `| | ${models.join(" | ")} |\n|---|${models.map(() => "---").join("|")}|`;
  const out: string[] = [
    `# AI 주간 정리 모델 비교`,
    "",
    `가짜 자료(${fixtureFile}) · 가격은 Anthropic 공식 가격표 기준 예상치`,
    "",
    "## 합계",
    "",
    head,
    `| effort | ${models.map((m) => resolveDigestEffort(m)).join(" | ")} |`,
    `| 성공 / 실패 | ${models.map((m) => `${totals[m].ok} / ${totals[m].failed}`).join(" | ")} |`,
    `| 버린 항목 | ${models.map((m) => totals[m].dropped).join(" | ")} |`,
    `| 버린 까닭 | ${models.map((m) => reasons(totals[m].dropReasons)).join(" | ")} |`,
    `| 입력 / 출력 토큰 | ${models.map((m) => `${totals[m].tokens.in} / ${totals[m].tokens.out}`).join(" | ")} |`,
    `| 걸린 시간 | ${models.map((m) => `${(totals[m].ms / 1000).toFixed(1)}초`).join(" | ")} |`,
    `| 예상 비용 | ${models.map((m) => usd(totals[m].costUsd)).join(" | ")} |`,
  ];
  for (const w of results) {
    out.push("", `## ${w.week}`, "");
    if (w.skipped) {
      out.push(`_${w.skipped}_`);
      continue;
    }
    const r = (m: DigestModel) => w.models[m];
    const metric = (label: string, f: (x: Extract<ModelResult, { ok: true }>) => string) =>
      `| ${label} | ${models.map((m) => { const x = r(m); return !x ? "—" : x.ok ? f(x) : `실패: ${x.reason}`; }).join(" | ")} |`;
    out.push(
      head,
      metric("입력 / 출력 토큰", (x) => `${x.tokens.in} / ${x.tokens.out}`),
      metric("걸린 시간", (x) => `${(x.ms / 1000).toFixed(1)}초`),
      metric("예상 비용", (x) => usd(x.costUsd)),
      metric("버린 항목", (x) => String(x.dropped)),
      `| 버린 까닭 | ${models.map((m) => { const x = r(m); return x ? reasons(x.dropReasons) : "—"; }).join(" | ")} |`,
      metric("금지어 · 새어 나감", (x) => [x.forbidden.length ? `금지어 ${x.forbidden.join(", ")}` : "", x.leakedExcluded ? "뺀 사람 글" : "", x.leakedNames ? "실명" : ""].filter(Boolean).join(" · ") || "없음"),
      ...(GIVEN_ONLY.length ? [metric("이름만(보냄 → 결과)", (x) => (x.givenSent.length ? `${x.givenSent.join(", ")} → ${x.givenOut.join(", ") || "없음"}` : "없음"))] : []),
    );
    for (const [key, label] of SECTIONS) {
      out.push(`| **${label}** | ${models.map((m) => { const x = r(m); return x?.ok ? (x.shown[key].length ? x.shown[key].map((t) => `• ${cell(t)}`).join("<br>") : "(없음)") : "—"; }).join(" | ")} |`);
    }
  }
  return out.join("\n") + "\n";
}
