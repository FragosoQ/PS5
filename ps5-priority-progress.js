(function (root) {
  const PRIORITY_SUFFIXES = [
    '0,1', '0,2', '0,3', '1', '2', '3', '4', '5', '6',
    '7.1', '7.2', '8', '9', '10', '11,1', '11,2', '11,3',
    '12,1', '12,2', '12,3', '13,1', '13,2', '13,3', '14', '15', '16',
  ];
  function normalizeSuffix(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/^[A-Z]+/i, '')
      .replace(/[,_]/g, '.');
  }

  function columnLetterToIndex(letter) {
    let index = 0;
    for (const char of String(letter || '').toUpperCase()) {
      if (char < 'A' || char > 'Z') return -1;
      index = index * 26 + char.charCodeAt(0) - 64;
    }
    return index - 1;
  }

  function resolveHeaderIndex(table, prefix, suffix, blockStart) {
    if (!table || !Array.isArray(table.cols)) return -1;
    const expected = `${prefix}${suffix}`.toUpperCase().replace(/[,_]/g, '.');
    const byHeader = table.cols.findIndex(col => {
      const label = String((col && (col.label || col.id)) || '').trim();
      return label.toUpperCase().replace(/[,_]/g, '.') === expected;
    });
    if (byHeader >= 0) return byHeader;

    const suffixIndex = PRIORITY_SUFFIXES.findIndex(item => normalizeSuffix(item) === normalizeSuffix(suffix));
    if (suffixIndex < 0) return -1;

    const startById = table.cols.findIndex(col =>
      String((col && col.id) || '').toUpperCase() === blockStart
    );
    if (startById >= 0) return startById + suffixIndex;

    const absoluteStart = columnLetterToIndex(blockStart);
    if (table.cols.length > absoluteStart + suffixIndex) return absoluteStart + suffixIndex;
    if (table.cols.length >= PRIORITY_SUFFIXES.length) return suffixIndex;
    return -1;
  }

  function getRowValue(row, index) {
    if (!row || !Array.isArray(row.c) || index < 0) return null;
    const cell = row.c[index];
    return cell && cell.v != null ? cell.v : (cell && cell.f != null ? cell.f : null);
  }

  function parseDateTime(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (value == null || String(value).trim() === '') return null;

    const text = String(value).trim();
    const googleDate = text.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
    if (googleDate) {
      return new Date(
        Number(googleDate[1]),
        Number(googleDate[2]),
        Number(googleDate[3]),
        Number(googleDate[4] || 0),
        Number(googleDate[5] || 0),
        Number(googleDate[6] || 0)
      );
    }

    const isoDateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnly) {
      return new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]));
    }

    const portugueseDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (portugueseDate) {
      return new Date(
        Number(portugueseDate[3]),
        Number(portugueseDate[2]) - 1,
        Number(portugueseDate[1]),
        Number(portugueseDate[4] || 0),
        Number(portugueseDate[5] || 0),
        Number(portugueseDate[6] || 0)
      );
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseDurationSeconds(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value * 24 * 60 * 60 : null;
    }
    if (value == null || String(value).trim() === '') return null;

    const text = String(value).trim();
    const googleDate = text.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
    if (googleDate) {
      const seconds = Number(googleDate[4] || 0) * 3600
        + Number(googleDate[5] || 0) * 60
        + Number(googleDate[6] || 0);
      return seconds > 0 ? seconds : null;
    }

    const clock = text.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d+))?)?$/);
    if (clock) {
      const seconds = Number(clock[1]) * 3600
        + Number(clock[2]) * 60
        + Number(clock[3] || 0)
        + Number(clock[4] ? `0.${clock[4]}` : 0);
      return seconds > 0 ? seconds : null;
    }

    const numeric = Number(text.replace(',', '.'));
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 24 * 60 * 60 : null;
  }

  function isExactlyComplete(value) {
    if (value == null || String(value).trim() === '') return false;
    const text = String(value).trim();
    const hasPercent = text.endsWith('%');
    const numeric = Number(text.replace(/%$/, '').replace(',', '.'));
    if (!Number.isFinite(numeric)) return false;
    return (hasPercent || Math.abs(numeric) > 1 ? numeric : numeric * 100) === 100;
  }

  function parsePercentage(value) {
    if (value == null || String(value).trim() === '') return null;
    const text = String(value).trim();
    const hasPercent = text.endsWith('%');
    const numeric = Number(text.replace(/%$/, '').replace(',', '.'));
    if (!Number.isFinite(numeric)) return null;
    return hasPercent || Math.abs(numeric) > 1 ? numeric : numeric * 100;
  }

  function getWorkingSecondsBetween(start, end) {
    if (end <= start) return 0;
    let totalSeconds = 0;
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (day <= lastDay) {
      const weekday = day.getDay();
      if (weekday >= 1 && weekday <= 5) {
        const windows = weekday === 5
          ? [[8, 13]]
          : [[8, 13], [14, 18]];
        windows.forEach(([fromHour, toHour]) => {
          const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), fromHour);
          const windowEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), toHour);
          const overlapStart = Math.max(start.getTime(), windowStart.getTime());
          const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
          if (overlapEnd > overlapStart) totalSeconds += (overlapEnd - overlapStart) / 1000;
        });
      }
      day.setDate(day.getDate() + 1);
    }
    return totalSeconds;
  }

  function calculateProgress(table, row, priority, completionFlag, now = new Date()) {
    if (!priority) return 0;
    if (isExactlyComplete(completionFlag)) return 100;

    const suffix = normalizeSuffix(priority);
    const startIndex = resolveHeaderIndex(table, 'T', suffix, 'DX');
    const durationIndex = resolveHeaderIndex(table, 'TP', suffix, 'EX');
    const start = parseDateTime(getRowValue(row, startIndex));
    const durationSeconds = parseDurationSeconds(getRowValue(row, durationIndex));
    const current = now instanceof Date ? now : parseDateTime(now);
    if (!start || !durationSeconds || !current || Number.isNaN(current.getTime())) return 0;

    const completedParts = Math.min(
      5,
      Math.floor(getWorkingSecondsBetween(start, current) / (durationSeconds / 6))
    );
    return Math.round(completedParts * (100 / 6) * 10) / 10;
  }

  const api = { calculateProgress, getWorkingSecondsBetween, isExactlyComplete, parsePercentage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PS5PriorityProgress = api;
})(typeof window !== 'undefined' ? window : globalThis);
