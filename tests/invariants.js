// 不変条件のテスト：ゲームロジックが壊れていないことを確かめる。失敗があれば終了コード1。
// 使い方: node tests/invariants.js
const loadCore = require('./load_core');
const G = loadCore(12345);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('  NG:', name, detail || ''); } }
function section(name, fn) { const f0 = fail; fn(); console.log((fail === f0 ? 'OK ' : 'NG ') + name); }

// ---- データの整合 ----
section('特性・魔法のデータ', () => {
  for (const [id, p] of Object.entries(G.PASSIVES)) check(`特性 ${id} の type`, p.type === 'growth' || p.type === 'combat', p.type);
  for (const id of G.COMMON_PASSIVES) check(`共通特性 ${id} が存在`, !!G.PASSIVES[id]);
  for (const sp of G.SPELLS) check(`魔法 ${sp.id} の CT`, sp.ct >= 1);
});

// ---- 通しプレイ：全シナリオで3年間回して、状態が範囲内に収まる ----
section('通しプレイの状態', () => {
  for (const scn of Object.keys(G.SCENARIOS)) {
    G.setScenario(scn);
    for (let g = 0; g < 40; g++) {
      const s = G.newStudent('t');
      for (let t = 1; t <= G.TOTAL; t++) {
        s.turn = t;
        for (const e of G.turnEvents(s)) if (e && e.choices) G.resolveChoice(s, e, Math.floor(Math.random() * e.choices.length));
        const r = Math.random(); let o;
        if (G.SC.ritual && r < 0.25) o = G.doRitual(s, r < 0.08 ? 'big' : 'small');
        else if (r < 0.45) o = G.doSocial(s, G.pick(G.socialTargets(s)));
        else if (r < 0.6) o = G.doResearch(s); else if (r < 0.8) o = G.doTrain(s, G.pick(G.STATS)); else o = G.doRest(s);
        for (const e of o.events || []) if (e && e.choices) G.resolveChoice(s, e, 0);
        if (o.offer) G.learnChoice(s, o.offer[0]);
      }
      check(`${scn} 能力が正`, G.STATS.every(k => s.stats[k] >= 1));
      check(`${scn} 疲労0〜100`, s.fatigue >= 0 && s.fatigue <= 100);
      check(`${scn} 装備数≦枠`, s.equip.length <= G.slots(s));
      check(`${scn} 戦闘特性の装備≦${G.PASSIVE_SLOTS}`, (s.equipPassives || []).length <= G.PASSIVE_SLOTS);
      check(`${scn} 絆0〜100`, Object.values(s.bonds).every(b => b >= 0 && b <= 100));
      if (G.SC.erosion) check(`${scn} 侵食0〜暴走ライン`, s.erosion >= 0 && s.erosion <= G.erosionLimit(s), s.erosion);
    }
  }
});

// ---- 戦闘：決着がつき、HPが範囲内 ----
section('戦闘', () => {
  G.setScenario('main');
  for (let i = 0; i < 50; i++) {
    const s = G.newStudent('t'); const o = G.makeOpponent('mid');
    const pf = G.playerFighter(s), of = G.oppFighter(o); const r = G.battle(pf, of);
    check('勝者がいる', r.winner === pf || r.winner === of);
    check('HPが最大以下', pf.hp <= pf.maxHp && of.hp <= of.maxHp);
  }
});

// ---- 特性のレベル ----
// Lv1 の値（レベル制より前に処理へ直接書かれていた値）
const LV1 = { hard: { mul: 1.15 }, tough: { mul: 0.75 }, scholar: { rare: 0.9 }, bookworm: { mul: 1.2 }, calm_mind: { cut: 5 }, charm: { mul: 1.5 },
  friendly: { mul: 1.2 }, sleep: { rest: 15, up: 0.8 }, focus: { acc: 15 }, flow: { ct: 0.1 }, sniper: { crit: 0.1 }, spell_crafter: { crit: 0.08 },
  adversity: { mul: 1.35 }, finisher: { mul: 1.2 }, wall: { mul: 0.9 }, mana_shell: { coef: 0.5, flat: 15 } };
// Lv2・Lv3 の仮の値（指示どおり：tough・wall・calm_mind は個別、それ以外は効果量×1.3・×1.6）
const LV23 = { tough: { mul: [0.68, 0.62] }, wall: { mul: [0.87, 0.85] }, calm_mind: { cut: [7, 9] } };
const BINARY = ['guts', 'second_wind'];
const near = (a, b) => Math.abs(a - b) < 1e-9;
section('特性のレベル：効果表', () => {
  check('PASSIVE_LV_MAX は3', G.PASSIVE_LV_MAX === 3);
  for (const id of G.COMMON_PASSIVES) {
    if (BINARY.includes(id)) { check(`${id} は効果表に載らない`, !G.PASSIVE_FX[id]); continue; }
    check(`${id} が効果表にある`, !!G.PASSIVE_FX[id]);
  }
  for (const id of Object.keys(G.PASSIVE_FX)) check(`${id} は共通特性`, G.COMMON_PASSIVES.includes(id));
  for (const [id, keys] of Object.entries(LV1)) for (const [k, v1] of Object.entries(keys)) {
    check(`${id}.${k} の Lv1 が変更前と同じ`, G.fxAt(id, k, 1) === v1, G.fxAt(id, k, 1));
    const e = G.PASSIVE_FX[id][k];
    // 増える向き／減る向き（Lv1 が基準値より下＝軽減）ごとに、レベルが上がるほど効果が強まる
    const exp = LV23[id] && LV23[id][k];
    for (const lv of [2, 3]) {
      const got = G.fxAt(id, k, lv);
      if (exp) check(`${id}.${k} Lv${lv} が指示どおり`, near(got, exp[lv - 2]), got);
      else {
        const base = { mul: 1, rare: 0.35, up: 0.55 }[k] ?? 0;
        const want = base + (v1 - base) * (lv === 2 ? 1.3 : 1.6);
        check(`${id}.${k} Lv${lv} が×${lv === 2 ? 1.3 : 1.6}（整数の値は四捨五入）`, near(got, want) || (Number.isInteger(v1) && got === Math.round(want)), `${got} / ${want}`);
      }
      if (e.max != null) check(`${id}.${k} Lv${lv} が上限以下`, got <= e.max);
      if (e.min != null) check(`${id}.${k} Lv${lv} が下限以上`, got >= e.min);
    }
    const ratio = !Number.isInteger(v1) || k === 'cut';
    if (ratio) check(`${id}.${k} は割合なので上限（下限）を持つ`, e.max != null || e.min != null);
  }
});

section('特性のレベル：passiveLv', () => {
  G.setScenario('main');
  const s = G.newStudent('t');
  check('持っていなければ0', G.passiveLv(s, 'tough') === 0);
  G.addPassive(s, 'tough');
  check('新しく覚えたら Lv1', G.passiveLv(s, 'tough') === 1);
  s.passiveLv.tough = 3; check('直接 Lv3', G.passiveLv(s, 'tough') === 3);
  s.passiveLv.tough = 9; check('上限で止まる', G.passiveLv(s, 'tough') === 3);
  s.passiveLv.tough = 0; check('最低 Lv1', G.passiveLv(s, 'tough') === 1);
  delete s.passiveLv; check('レベルの記録がない旧データでも Lv1', G.passiveLv(s, 'tough') === 1);
  G.addPassive(s, 'guts'); check('二値の特性は Lv1', G.passiveLv(s, 'guts') === 1);
});

// 同じ乱数で、特性のレベルだけを変えて結果を比べる
function withSeed(seed, fn) {
  const save = [Math.random, G.RNG.r]; let x = seed;
  Math.random = G.RNG.r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; };
  try { return fn(); } finally { [Math.random, G.RNG.r] = save; }
}
function student(ids, lv, legacy) {
  const s = G.newStudent('t'); s.fatigue = 60;
  for (const id of ids) { G.addPassive(s, id); if (lv) s.passiveLv[id] = lv; }
  s.equipPassives = ids.filter(id => G.PASSIVES[id].type === 'combat');
  if (legacy) delete s.passiveLv;   // レベル制より前の状態
  return s;
}
section('特性のレベル：処理に効く', () => {
  G.setScenario('main');
  // 失敗率：calm_mind は Lv1 で-5、Lv2 で-7、Lv3 で-9
  const fr = (lv, legacy) => G.failRate(student(['calm_mind'], lv, legacy));
  const fr0 = G.failRate(student([]));
  check('calm_mind Lv1 は変更前と同じ（-5）', fr0 - fr(1) === 5);
  check('calm_mind Lv2 は-7', fr0 - fr(2) === 7);
  check('calm_mind Lv3 は-9', fr0 - fr(3) === 9);
  check('旧データの calm_mind は Lv1', fr(0, true) === fr(1));
  // 鍛錬の疲労：tough
  const fat = (lv, legacy) => withSeed(7, () => { const s = student(['tough'], lv, legacy); s.fatigue = 0; G.doTrain(s, 'atk'); return s.fatigue; });
  const fat0 = withSeed(7, () => { const s = student([]); s.fatigue = 0; G.doTrain(s, 'atk'); return s.fatigue; });
  check('tough Lv1 は疲労×0.75', near(fat(1), fat0 * 0.75), `${fat(1)} / ${fat0}`);
  check('tough Lv2 は疲労×0.68', near(fat(2), fat0 * 0.68));
  check('tough Lv3 は疲労×0.62', near(fat(3), fat0 * 0.62));
  check('旧データの tough は Lv1', fat(0, true) === fat(1));
  // 休養：sleep の回復量
  const rest = (lv, legacy) => withSeed(9, () => { const s = student(['sleep'], lv, legacy); s.fatigue = 100; G.doRest(s); return 100 - s.fatigue; });
  check('sleep Lv1 は変更前と同じ（45+15）', rest(1) === 60, rest(1));
  check('sleep Lv3 は 45+24', rest(3) === 69, rest(3));
  check('旧データの sleep は Lv1', rest(0, true) === rest(1));
  // 戦闘：魔力障壁のバリア量と、命中（focus）
  const opp = G.makeOpponent('mid');
  const shield = (lv, legacy) => withSeed(3, () => { const s = student(['mana_shell', 'wall', 'focus'], lv, legacy); const f = G.playerFighter(s); G.battle(f, G.oppFighter(opp)); return f; });
  for (const lv of [1, 2, 3]) {
    const s = student(['mana_shell'], lv); const f = G.playerFighter(s);
    check(`mana_shell Lv${lv} の係数`, f.PV('mana_shell', 'coef') === [0.5, 0.65, 0.8][lv - 1]);
    check(`focus Lv${lv} の命中`, G.playerFighter(student(['focus'], lv)).PV('focus', 'acc', 0) === [15, 20, 24][lv - 1]);
  }
  check('旧データの戦闘は Lv1 と同じ結果', shield(0, true).hp === shield(1).hp);
  check('Lv3 の戦闘は結果が変わる', shield(3).hp !== shield(1).hp);
  check('相手（レベル指定なし）は Lv1', G.oppFighter({ ...opp, passives: ['wall'] }).PV('wall', 'mul') === 0.9);
  // 通しプレイ：全特性を Lv1 と明示しても、記録なし（旧データ）と結果が完全に同じ
  for (const scn of Object.keys(G.SCENARIOS)) {
    G.setScenario(scn);
    const play = (mode) => withSeed(4242, () => {
      const s = G.newStudent('t');
      for (const id of G.COMMON_PASSIVES) G.addPassive(s, id);
      if (mode === 'legacy') delete s.passiveLv; else for (const id of G.COMMON_PASSIVES) s.passiveLv[id] = mode;
      for (let t = 1; t <= G.TOTAL; t++) {
        s.turn = t;
        for (const e of G.turnEvents(s)) if (e && e.choices) G.resolveChoice(s, e, 0);
        const o = [G.doTrain(s, G.STATS[t % 5]), G.doResearch(s), G.doRest(s)][t % 3];
        for (const e of o.events || []) if (e && e.choices) G.resolveChoice(s, e, 0);
        if (o.offer) G.learnChoice(s, o.offer[0]);
      }
      return JSON.stringify([s.stats, s.results, s.fatigue, s.research]);
    });
    check(`${scn} 旧データの通しプレイが Lv1 と同じ`, play('legacy') === play(1));
    check(`${scn} Lv3 では結果が変わる`, play(3) !== play(1));
  }
});

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
