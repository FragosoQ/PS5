const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateProgress, parsePercentage } = require('../ps5-priority-progress.js');

function makeTable(priority, start, duration, startHeader = `T${priority}`, durationHeader = `TP${priority}`) {
  return {
    cols: [
      { id: 'DX', label: startHeader },
      { id: 'EX', label: durationHeader },
    ],
    rows: [{ c: [{ v: start }, { v: duration }] }],
  };
}

test('calculates each of the six expected progress levels, capped at five until completion', () => {
  const levels = [
    ['2026-09-21T08:00:00', 0],
    ['2026-09-21T09:30:00', 16.7],
    ['2026-09-21T11:00:00', 33.3],
    ['2026-09-21T12:30:00', 50],
    ['2026-09-21T15:00:00', 66.7],
    ['2026-09-21T16:30:00', 83.3],
  ];
  const table = makeTable('0,1', 'Date(2026,8,21,8,0,0)', 'Date(1899,11,30,9,0,0)');

  for (const [now, expected] of levels) {
    assert.equal(calculateProgress(table, table.rows[0], 'P0_1', 0, new Date(now)), expected);
  }
});

test('matches the real PS5 T0,1 and TP0,1 headers and Google Sheets date encodings', () => {
  const table = makeTable(
    '0,1',
    'Date(2026,9,22,7,45,42)',
    'Date(1899,11,30,9,0,0)',
    'T0,1',
    'TP0,1'
  );
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P0_1',
    0,
    new Date(2026, 9, 22, 9, 30, 42)
  ), 16.7);
});

test('matches the supplied same-day example and excludes the lunch break', () => {
  const table = makeTable(
    '0,2',
    'Date(2026,9,22,11,49,52)',
    'Date(1899,11,30,9,0,0)',
    'T0,2',
    'TP0,2'
  );
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P0_2',
    0,
    new Date(2026, 9, 22, 14, 42)
  ), 16.7);
});

test('parses Portuguese date/time strings and clock-formatted durations', () => {
  const table = makeTable('0,1', '22/10/2026 08:00:00', '09:00:00');
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P0_1',
    0,
    new Date(2026, 9, 22, 9, 30)
  ), 16.7);
});

test('resolves headers with decimal commas and periods by priority suffix', () => {
  const table = makeTable(
    '11,2',
    'Date(2026,8,21,8,0,0)',
    'Date(1899,11,30,1,30,0)',
    'T11.2',
    'TP11,2'
  );
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P11_2',
    0,
    new Date(2026, 8, 21, 8, 15)
  ), 16.7);
});

test('uses the specified order when the API omits headers in a full-width sheet', () => {
  const cols = Array.from({ length: 179 }, (_, index) => ({ id: String.fromCharCode(65 + (index % 26)), label: '' }));
  const cells = [];
  cells[127] = { v: 'Date(2026,8,21,8,0,0)' };
  cells[153] = { v: 'Date(1899,11,30,9,0,0)' };
  const table = { cols, rows: [{ c: cells }] };
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P0,1',
    0,
    new Date(2026, 8, 21, 9, 30)
  ), 16.7);
});

test('returns zero for missing start, duration, priority, or unusable headers', () => {
  const table = makeTable('0,1', null, null);
  assert.equal(calculateProgress(table, table.rows[0], 'P0_1', 0, new Date()), 0);
  assert.equal(calculateProgress(makeTable('0,1', 'Date(2026,8,21,8,0,0)', null), table.rows[0], 'P0_1', 0), 0);
  assert.equal(calculateProgress(table, table.rows[0], null, 0), 0);
  assert.equal(calculateProgress({ cols: [], rows: [] }, { c: [] }, 'P0_1', 0), 0);
});

test('excludes Friday afternoon and weekend time from work elapsed', () => {
  const table = makeTable('0,1', 'Date(2026,9,23,12,0,0)', 'Date(1899,11,30,9,0,0)');
  assert.equal(calculateProgress(
    table,
    table.rows[0],
    'P0_1',
    0,
    new Date(2026, 9, 26, 8, 30)
  ), 16.7);
});

test('only an exact 100% completion flag grants the sixth part', () => {
  const table = makeTable('0,1', null, null);
  assert.equal(calculateProgress(table, table.rows[0], 'P0_1', 100), 100);
  assert.equal(calculateProgress(table, table.rows[0], 'P0_1', '100%'), 100);
  assert.equal(calculateProgress(table, table.rows[0], 'P0_1', 0.9999, new Date()), 0);
});

test('parses the sheet percentage value without losing decimal precision', () => {
  assert.equal(parsePercentage(0.256), 25.6);
  assert.equal(parsePercentage('25,6%'), 25.6);
  assert.equal(parsePercentage('25,6'), 25.6);
  assert.equal(parsePercentage(null), null);
});
