// バランス確認：決まった乱数でシナリオごとに同じ行動方針を回し、試験・最終戦の勝率と能力の伸びを出す。
// 乱数を固定しているので、ロジックが同じなら出力は毎回まったく同じになる（最後の行のハッシュで比べられる）。
// 使い方: node tests/balance_sim.js [1方針あたりの人数（既定200）]
const loadCore = require('./load_core');
const G = loadCore(20261001);
const N = +process.argv[2] || 200;
const tot = s => s.stats.hp / 3 + s.stats.atk + s.stats.int + s.stats.def + s.stats.acc;
function run(scn, target) {
  G.setScenario(scn);
  const r = { mid: 0, sel: 0, champ: 0, runaway: 0, power: [], ritualShare: [0, 0] };
  const finals = [];
  for (let g = 0; g < N; g++) {
    const s = G.newStudent('t');
    for (let t = 1; t <= G.TOTAL; t++) {
      s.turn = t;
      for (const e of G.turnEvents(s)) if (e && e.choices) G.resolveChoice(s, e, 0);
      const pre = tot(s); let o, rit = false;
      const e = s.erosion || 0, m = G.SC.ritual ? G.ritualMul(s) : 1, mul = G.SC.ritual ? G.getErosionMul(s, true) : 1;
      const reach = k => G.RITUALS[k].erosion[1] * m * mul;
      if (s.fatigue >= 55) o = G.doRest(s);
      else if (G.SC.ritual && target > 0 && e < target - 15 && e + reach('big') < G.erosionLimit(s)) { o = G.doRitual(s, 'big'); rit = true; }
      else if (G.SC.ritual && target > 0 && e < target && e + reach('small') < G.erosionLimit(s)) { o = G.doRitual(s, 'small'); rit = true; }
      else if (Math.random() < 0.2) { const tg = G.socialTargets(s); o = G.doSocial(s, G.pick(tg)); }
      else if (Math.random() < 0.15) o = G.doResearch(s);
      else o = G.doTrain(s, G.pick(['atk', 'atk', 'hp', 'def', 'int', 'acc']));
      if (o.events && o.events.some(x => x.title === '暴走')) r.runaway++;
      for (const x of o.events || []) if (x && x.choices) G.resolveChoice(s, x, 0);
      if (o.offer) G.learnChoice(s, o.offer[0]);
      const d = tot(s) - pre; if (d > 0) { r.ritualShare[1] += d; if (rit) r.ritualShare[0] += d; }
      s.equip = G.recommendEquip(s);
      const ex = G.SC.exams.find(x => x.week === t);
      if (ex && !ex.tournament) { const op = G.getOpponent(s, ex.key); const pf = G.playerFighter(s, ex.key); const won = G.battle(pf, G.oppFighter(op)).winner === pf; if (won) r[ex.key]++; G.examReward(s, ex.key, won); }
      if (ex && ex.tournament) { let ok = true; for (const k of G.cupRounds(s)) { const op = G.getOpponent(s, k); const pf = G.playerFighter(s, k); if (G.battle(pf, G.oppFighter(op)).winner !== pf) { ok = false; break; } } if (ok) r.champ++; }
    }
    r.power.push(Math.round(tot(s)));
    finals.push(JSON.stringify([s.stats, s.erosion, s.passives, s.spells, s.results]));
  }
  r.power.sort((a, b) => a - b);
  return { r, finals };
}
const rows = [['星見の魔法学院', 'main', 0], ['禁術の魔法学院 侵食30', 'forbidden', 30], ['禁術の魔法学院 侵食60', 'forbidden', 60], ['禁術の魔法学院 侵食90', 'forbidden', 90], ['禁術の魔法学院 侵食99', 'forbidden', 99]];
const all = [];
const pct = v => (v / N * 100).toFixed(1).padStart(5) + '%';
console.log(`各${N}人・乱数固定`);
console.log('シナリオ・方針'.padEnd(24) + '試験1   試験2   最終戦  暴走/人  能力合計(中央/上位10%)  儀式由来');
for (const [label, scn, tg] of rows) {
  const { r, finals } = run(scn, tg); all.push(...finals);
  const q = p => r.power[Math.floor(p * (r.power.length - 1))];
  console.log(label.padEnd(20) + `${pct(r.mid)} ${pct(r.sel)} ${pct(r.champ)}  ${(r.runaway / N).toFixed(2).padStart(5)}    ${q(0.5)} / ${q(0.9)}             ${r.ritualShare[1] ? (r.ritualShare[0] / r.ritualShare[1] * 100).toFixed(0) + '%' : '-'}`);
}
console.log('結果のハッシュ:', require('crypto').createHash('sha256').update(all.join('|')).digest('hex').slice(0, 16));
