// magic_academy_game.html の最初の <script>（画面に依存しないゲームロジック）を Node で読み込む。
// seed を渡すと Math.random を決まった乱数列に差し替えてから読み込む（結果を再現できるようにするため）。
const fs = require('fs'), path = require('path'), Module = require('module');
module.exports = function loadCore(seed) {
  if (seed != null) { let x = seed >>> 0 || 1; Math.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; }; }
  const file = path.join(__dirname, '..', 'magic_academy_game.html');
  const html = fs.readFileSync(file, 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(code, file);
  return m.exports;
};
