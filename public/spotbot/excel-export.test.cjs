// Excel export: the dependency-free .xlsx writer (src/lib/xlsx.ts) and the club workbook (src/lib/clubExport.ts)
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { crc32, colName, sheetNames, workbook, clubExportSheets, clubExportXlsx, exportFileName, toInsightMatches } = require('./club-insights.cjs');

// Read a stored zip back: name -> text
function unzip(buf) {
  const files = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
    const data = buf.slice(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    assert.equal(method, 0);
    assert.equal(crc32(data), buf.readUInt32LE(p + 14) >>> 0, `crc of ${name}`);
    files[name] = data.toString('utf8');
    p += 30 + nameLen + extra + size;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'end of central directory');
  return files;
}

test('crc32, column names and sheet names follow the spec', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.from('hello')), zlib.crc32 ? zlib.crc32('hello') : 0x3610a686);
  assert.deepEqual([0, 25, 26, 701, 702].map(colName), ['A', 'Z', 'AA', 'ZZ', 'AAA']);
  assert.deepEqual(sheetNames(['Players', 'players', 'a/b:c', '', 'x'.repeat(40)]), ['Players', 'players 2', 'a b c', 'Sheet4', 'x'.repeat(31)]);
});

test('a workbook is a valid package with escaped text and numbers', () => {
  const files = unzip(Buffer.from(workbook([{ name: 'Test', header: ['Name', 'Goals'], rows: [['A & <B>', 3], ['"Q"', null], ['bad\u0001char', 1.5]] }])));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[f], f);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /A &amp; &lt;B&gt;/);
  assert.match(sheet, /<c r="B2"><v>3<\/v><\/c>/);
  assert.doesNotMatch(sheet, /r="B3"/, 'null cells are left out');
  assert.match(sheet, /badchar/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:B4"\/>/);
  assert.match(files['xl/workbook.xml'], /<sheet name="Test"/);
});

const agg = (counts) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',');
function row(i) {
  const ts = Math.floor((Date.UTC(2026, 10, 1, 19) - Math.floor(i / 3) * 2 * 86400000 + (i % 3) * 30 * 60000) / 1000);
  const win = i % 2 === 0;
  const side = { p0: { playername: 'Nine', pos: 'forward', rating: 8, match_event_aggregate_0: agg({ 13: 3, 217: 4, 215: 12, 216: 3, 106: 1 }) }, p1: { playername: 'Five', pos: 'defender', rating: 7, match_event_aggregate_0: agg({ 215: 30, 216: 2, 106: 4, 0: 3 }) } };
  return {
    id: `m${i}`, result: win ? 'win' : 'loss', score_for: win ? 2 : 0, score_against: win ? 1 : 1, match_type: 'leagueMatch', created_at: new Date(ts * 1000).toISOString(), opponent_club_name: `Opp ${i}`,
    match_data: { timestamp: ts, players: { 1: side, 2: { x: { playername: 'Them', pos: 'forward', rating: 6.5, match_event_aggregate_0: agg({ 13: 1, 217: 2 }) } } } },
    player_stats: [{ ea_username: 'Nine', position: 'forward', rating: 8, goals: win ? 2 : 0, assists: 0, motm: true }, { ea_username: 'Five', position: 'defender', rating: 7, goals: 0, assists: win ? 1 : 0 }],
  };
}

test('the club workbook has matches, players, a match log and nights', () => {
  const matches = toInsightMatches(Array.from({ length: 9 }, (_, i) => row(i)));
  const sheets = clubExportSheets(matches);
  assert.deepEqual(sheets.map((s) => s.name), ['Matches', 'Players', 'Player match log', 'Nights']);
  const [m, p, log, nights] = sheets;
  assert.equal(m.rows.length, 9);
  assert.equal(m.rows[0][4], 'W');
  assert.ok(typeof m.rows[0][7] === 'number', 'modelled goals');
  const nine = p.rows.find((r) => r[0] === 'Nine');
  assert.equal(nine[1], 'FWD');
  assert.equal(nine[2], 9);
  assert.equal(nine[6], 10);
  assert.equal(log.rows.length, 18);
  assert.equal(log.rows.find((r) => r[3] === 'Nine')[9], 4, 'shots on target from events');
  assert.equal(nights.rows.length, 3);
  assert.equal(nights.rows[0][1], 3);
  const files = unzip(Buffer.from(clubExportXlsx(matches)));
  assert.ok(files['xl/worksheets/sheet4.xml']);
  assert.equal(exportFileName('Real Ünited F.C.', new Date(Date.UTC(2026, 10, 15))), 'Real-nited-F-C-gafferbot-2026-11-15.xlsx');
});
