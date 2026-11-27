/**
 * 명단 도입의 순수 부분 — 파일·DB 를 만지지 않는다. 그래서 테스트할 수 있다(tests/rls/roster-needs-check.test.mjs).
 *
 *   normalizeRows(rows, overrides)  엑셀 행 → 사람·목장 (검증·정규화·상태 태그·needs_check)
 *   buildImportSql(plan)            한 트랜잭션짜리 SQL 문자열
 *
 * 실명은 여기서도 출력에 나오지 않는다 — errors/notes 는 행 번호와 범주값만 담는다.
 *
 * 상태 태그(care_status)와 needs_check (2026-09-30, 사각지대 사전 작업)
 *   · 명단의 '청년대학부 회원'(O/빈칸)은 8주 연속 출석의 결과다. 사각지대의 **첫 기준점**으로 딱 한 번만
 *     쓴다. DB 에 회원 개념을 넣지 않는다 — import 시점에 needs_check 로 바꾸고 컬럼은 버린다.
 *   · care_status 는 비고를 자동 파싱하지 않는다. data/roster.config.json(gitignore) 의 overrides 로
 *     이름을 직접 지정한다. 기본값 active.
 *   · needs_check = (care_status ∈ {active, long_absent}) ∧ 회원 빈칸. **처음 한 번만** 세팅한다 —
 *     upsert 는 needs_check 가 null(아직 판정 안 함)인 행에만 쓴다. 리더가 확인해 false 로 바꾼 것을
 *     재도입이 되돌리지 않는다.
 */

import { createHash } from "node:crypto";

export const CARE_STATUSES = ["active", "military", "remote", "weekend_work", "other_church", "long_absent"];

export function uuidFromMd5(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function lit(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * overrides 의 이름 항목은 "이름" 또는 "목장/이름". 동명이인이면 목장을 붙여야 한다.
 * 반환: Map<"목장\0이름", {careStatus?, demote?, optOut?}> 와 못 찾은 항목(위치만).
 */
function resolveOverrides(people, overrides) {
  const byName = new Map();
  for (const p of people) {
    (byName.get(p.name) ?? byName.set(p.name, []).get(p.name)).push(p);
  }
  const result = new Map();
  const problems = [];
  const apply = (label, entry, idx, patch) => {
    let target = null;
    const [g, n] = entry.includes("/") ? entry.split("/", 2) : [null, entry];
    const cands = (byName.get(n.trim()) ?? []).filter((p) => (g ? p.group === g.trim() : true));
    if (cands.length === 1) target = cands[0];
    else if (cands.length === 0) problems.push(`overrides.${label}[${idx}]: 명단에 없는 이름`);
    else problems.push(`overrides.${label}[${idx}]: 동명이인 — "목장/이름" 으로 적는다`);
    if (target) {
      const k = `${target.group}\u0000${target.name}`;
      result.set(k, { ...(result.get(k) ?? {}), ...patch });
    }
  };
  for (const st of CARE_STATUSES) {
    if (st === "active") continue;
    (overrides?.care_status?.[st] ?? []).forEach((e, i) => apply(`care_status.${st}`, e, i, { careStatus: st }));
  }
  (overrides?.demote_leaders ?? []).forEach((e, i) => apply("demote_leaders", e, i, { demote: true }));
  (overrides?.opt_out ?? []).forEach((e, i) => apply("opt_out", e, i, { optOut: true }));
  return { result, problems };
}

/**
 * rows: [{ r, group, name, kind, stage, birth, gender, member }] — 이미 trim 된 문자열.
 * member: '청년대학부 회원' 셀 (O 또는 빈칸). 저장하지 않고 needs_check 계산에만 쓴다.
 */
export function normalizeRows(rows, overrides = {}) {
  const errors = [];
  const notes = [];
  const groups = [];
  const people = [];
  const seen = new Map();

  for (const x of rows) {
    const missing = [!x.group && "목장", !x.name && "이름", !x.kind && "구분"].filter(Boolean);
    if (missing.length) {
      errors.push(`row ${x.r}: 필수 결측 (${missing.join("·")})`);
      continue;
    }
    let groupRole;
    if (x.kind === "리더") groupRole = "leader";
    else if (x.kind === "양") groupRole = "member";
    else {
      errors.push(`row ${x.r}: 구분 값 불명 (리더/양 아님)`);
      continue;
    }
    const stage = x.stage === "" || x.stage === "-" ? null : x.stage;
    let birthYear = null;
    if (/^\d{4}$/.test(x.birth)) birthYear = Number(x.birth);
    else if (x.birth !== "") notes.push(`row ${x.r}: 출생년도 형식 이상 → null`);
    else notes.push(`row ${x.r}: 출생년도 결측 → null`);
    let gender = null;
    if (x.gender === "남") gender = "male";
    else if (x.gender === "여") gender = "female";
    else if (x.gender !== "") errors.push(`row ${x.r}: 성별 값 불명`);
    else notes.push(`row ${x.r}: 성별 결측 → null`);

    if (!groups.includes(x.group)) groups.push(x.group);
    const k = `${x.group}\u0000${x.name}`;
    if (seen.has(k)) {
      errors.push(`같은 목장 동명이인 (거부): rows ${seen.get(k)}, ${x.r}`);
      continue;
    }
    seen.set(k, x.r);

    const idSource = birthYear === null ? `person:${x.group}:${x.name}` : `person:${x.group}:${x.name}:${birthYear}`;
    const id = uuidFromMd5(createHash("md5").update(idSource, "utf8").digest("hex"));
    people.push({
      r: x.r, id, group: x.group, name: x.name, groupRole, stage, birthYear, gender,
      isMember: (x.member ?? "").trim().toUpperCase() === "O",
      careStatus: "active", optOut: false,
    });
  }

  // 상태 태그 · 리더 해제 · 기록 제외 — 설정으로만
  const { result, problems } = resolveOverrides(people, overrides);
  errors.push(...problems);
  for (const p of people) {
    const o = result.get(`${p.group}\u0000${p.name}`);
    if (!o) continue;
    if (o.careStatus) p.careStatus = o.careStatus;
    if (o.demote && p.groupRole === "leader") {
      p.groupRole = "member";
      notes.push(`row ${p.r}: 리더 역할 해제 (설정)`);
    }
    if (o.optOut) p.optOut = true;
  }
  for (const p of people) {
    p.needsCheck = (p.careStatus === "active" || p.careStatus === "long_absent") && !p.isMember;
  }

  return { people, groups, errors, notes };
}

/** 목장별 needs_check 수와 상태 태그 수 — 이름 없이 */
export function summarize(people) {
  const perGroup = {};
  const byStatus = {};
  for (const p of people) {
    if (p.needsCheck) perGroup[p.group] = (perGroup[p.group] ?? 0) + 1;
    byStatus[p.careStatus] = (byStatus[p.careStatus] ?? 0) + 1;
  }
  return { needsCheckTotal: people.filter((p) => p.needsCheck).length, needsCheckByGroup: perGroup, byStatus };
}

/**
 * plan: { people, groups, rekeys, firstImport, realAccounts, expectNeedsCheck? }
 * 첫 도입(가명 시드 위)만 기록·가짜 계정을 지운다. 재도입은 명단만 갱신한다.
 */
export function buildImportSql({ people, groups, rekeys, firstImport, realAccounts, expectNeedsCheck = null }) {
  const leaders = people.filter((p) => p.groupRole === "leader").length;
  const members = people.length - leaders;
  const optOuts = people.filter((p) => p.optOut).length;
  const sql = [];
  sql.push("begin;");
  sql.push(`create temporary table roster_groups (number int, name text) on commit drop;`);
  sql.push(`insert into roster_groups values ${groups.map((g, i) => `(${i + 1}, ${lit(g)})`).join(", ")};`);
  sql.push(`create temporary table roster_people (id uuid, group_name text, name text, group_role public.group_role, training_stage text, birth_year int, gender public.gender, care_status public.care_status, needs_check boolean, opt_out boolean) on commit drop;`);
  sql.push(
    `insert into roster_people values ${people
      .map((p) => `(${lit(p.id)}::uuid, ${lit(p.group)}, ${lit(p.name)}, ${lit(p.groupRole)}::public.group_role, ${p.stage === null ? "null" : lit(p.stage)}, ${p.birthYear ?? "null"}, ${p.gender === null ? "null" : lit(p.gender) + "::public.gender"}, ${lit(p.careStatus)}::public.care_status, ${p.needsCheck ? "true" : "false"}, ${p.optOut ? "true" : "false"})`)
      .join(",\n")};`,
  );

  if (firstImport) {
    sql.push(`truncate public.report_presence, public.comments, public.events, public.export_logs, public.weekly_records, public.reports, public.applications;`);
    sql.push(`delete from public.users where auth_user_id is null;`);
  }
  sql.push(`update public.groups set number = number + 1000;`);
  sql.push(`insert into public.groups (number, name, status) select number, name, 'active' from roster_groups
  on conflict (name) do update set number = excluded.number, status = 'active';`);
  for (const k of rekeys ?? []) sql.push(`update public.persons set id = ${lit(k.to)}::uuid where id = ${lit(k.from)}::uuid;`);
  sql.push(`insert into public.persons (id, group_id, name, gender, group_role, is_group_head, status, dormancy_request, joined_at, birth_date, birth_year, training_stage, phone, user_id, care_status, needs_check)
  select rp.id, g.id, rp.name, rp.gender, rp.group_role, false,
         case when rp.opt_out then 'opted_out'::public.person_status else 'active'::public.person_status end,
         'none', current_date, null, rp.birth_year, rp.training_stage, null, null, rp.care_status, rp.needs_check
    from roster_people rp join public.groups g on g.name = rp.group_name
  on conflict (id) do update set
    group_id = excluded.group_id, name = excluded.name, gender = excluded.gender,
    group_role = excluded.group_role,
    -- 기록 제외는 본인 요청(기존) 또는 설정(opt_out). 그 외 휴면·이탈은 활동으로 돌아온다(명단에 있으니까).
    status = case when public.persons.status = 'opted_out' or (select rp2.opt_out from roster_people rp2 where rp2.id = excluded.id)
                  then 'opted_out'::public.person_status else 'active'::public.person_status end,
    birth_year = excluded.birth_year, training_stage = excluded.training_stage,
    care_status = excluded.care_status,
    -- needs_check 는 처음 한 번만. 이미 값이 있으면(리더가 확인했을 수 있다) 건드리지 않는다.
    needs_check = coalesce(public.persons.needs_check, excluded.needs_check);`);
  if (firstImport) {
    sql.push(`delete from public.persons where id not in (select id from roster_people);`);
    sql.push(`delete from public.group_profiles where group_id not in (select id from public.groups where name in (select name from roster_groups));`);
    sql.push(`delete from public.groups where name not in (select name from roster_groups);`);
  } else {
    sql.push(`update public.persons set status = 'left' where id not in (select id from roster_people) and status <> 'left';`);
    sql.push(`update public.groups set status = 'disbanded' where name not in (select name from roster_groups) and status <> 'disbanded';`);
  }
  sql.push(`insert into public.app_meta (key, value) values ('roster_source', 'real'), ('roster_imported_at', now()::text), ('demo_records', 'false')
  on conflict (key) do update set value = excluded.value, updated_at = now();`);
  sql.push(`do $$
declare g int; p int; l int; m int; u int; bad int; nc int; oo int;
begin
  select count(*) into g from public.groups where status = 'active';
  select count(*) into p from public.persons where status <> 'left';
  select count(*) into l from public.persons where group_role = 'leader' and status <> 'left';
  select count(*) into m from public.persons where group_role = 'member' and status <> 'left';
  select count(*) into u from public.users where auth_user_id is not null;
  select count(*) into bad from public.users where auth_user_id is null;
  select count(*) into oo from public.persons where status = 'opted_out';
  if (g, p, l, m) <> (${groups.length}, ${people.length}, ${leaders}, ${members}) then
    raise exception '행 수 불일치: groups=% persons=% leaders=% members=% (기대 ${groups.length}/${people.length}/${leaders}/${members})', g, p, l, m;
  end if;
  if u <> ${realAccounts} then raise exception '실계정 수가 바뀌었다: % (기대 ${realAccounts})', u; end if;
  if ${firstImport ? "true" : "false"} and bad <> 0 then raise exception '가짜 계정이 남았다: %', bad; end if;
  if oo < ${optOuts} then raise exception '기록 제외 수가 설정보다 적다: % (설정 ${optOuts})', oo; end if;
  ${expectNeedsCheck === null ? "" : `select count(*) into nc from public.persons where needs_check and status <> 'left';
  if nc <> ${expectNeedsCheck} then raise exception 'needs_check 수 불일치: % (기대 ${expectNeedsCheck}) — 멈춘다', nc; end if;`}
end $$;`);
  sql.push("commit;");
  return sql.join("\n");
}
