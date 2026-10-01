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

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
