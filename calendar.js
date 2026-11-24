/* Meloncino: pure calendar cycles and saved baseline validation. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeloncinoCalendar = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var OWN = Object.prototype.hasOwnProperty;
  var WORK_SHIFTS = ['0', '1', '2', '3'];
  var CYCLE_SHIFTS = WORK_SHIFTS.concat(['R']);
  var BASELINE_SHIFTS = CYCLE_SHIFTS.concat(['', 'C', 'F', 'H', 'P', 'L', 'M']);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function validYear(year) {
    return Number.isInteger(year) && year >= 1 && year <= 9999;
  }
  function yearStart(year) {
    var date = new Date(0);
    date.setUTCFullYear(year, 0, 1);
    return date.getTime();
  }
  function dateTime(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
    var year = Number(iso.slice(0, 4));
    if (!validYear(year)) return NaN;
    var date = new Date(0);
    date.setUTCFullYear(year, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    return date.toISOString().slice(0, 10) === iso ? date.getTime() : NaN;
  }
  function isoDate(time) { return new Date(time).toISOString().slice(0, 10); }
  function yearLength(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
  }
  function modulo(value, length) { return ((value % length) + length) % length; }

  function validateSchedule(schedule) {
    if (!isRecord(schedule)) return ['Il ciclo deve essere un oggetto.'];
    var errors = [];
    if (!Number.isFinite(dateTime(schedule.anchor))) errors.push('La data iniziale del ciclo deve essere una data ISO valida (AAAA-MM-GG).');
    if (!Array.isArray(schedule.pattern) || schedule.pattern.length < 1 || schedule.pattern.length > 366) {
      errors.push('Il ciclo deve contenere da 1 a 366 giorni.');
    } else {
      for (var i = 0; i < schedule.pattern.length; i++) {
        if (CYCLE_SHIFTS.indexOf(schedule.pattern[i]) === -1) {
          errors.push('Il ciclo può contenere solo le sigle 0, 1, 2, 3 e R.');
          break;
        }
      }
    }
    return errors;
  }

  function createSchedule(options) {
    if (!isRecord(options)) throw new TypeError('Specificare giorni di lavoro, riposi, turni e data iniziale.');
    var workDays = options.workDays;
    var restDays = options.restDays;
    var shifts = options.shifts;
    if (!Number.isInteger(workDays) || workDays < 1 || workDays > 31) throw new RangeError('I giorni di lavoro devono essere un intero da 1 a 31.');
    if (!Number.isInteger(restDays) || restDays < 1 || restDays > 14) throw new RangeError('I giorni di riposo devono essere un intero da 1 a 14.');
    if (!Array.isArray(shifts) || shifts.length === 0 || shifts.some(function (shift) { return WORK_SHIFTS.indexOf(shift) === -1; })) {
      throw new TypeError('Specificare un ordine esplicito di turni tra 0, 1, 2 e 3.');
    }
    if ((workDays + restDays) * shifts.length > 366) throw new RangeError('Il ciclo non può superare 366 giorni.');
    var pattern = [];
    for (var i = 0; i < shifts.length; i++) {
      for (var work = 0; work < workDays; work++) pattern.push(shifts[i]);
      for (var rest = 0; rest < restDays; rest++) pattern.push('R');
    }
    var schedule = { anchor: options.anchor, pattern: pattern };
    var errors = validateSchedule(schedule);
    if (errors.length) throw new TypeError(errors.join(' '));
    return schedule;
  }

  function generateYear(year, schedule) {
    if (!validYear(year)) throw new RangeError('L’anno deve essere un intero da 1 a 9999.');
    var errors = validateSchedule(schedule);
    if (errors.length) throw new TypeError(errors.join(' '));
    var days = {};
    var start = yearStart(year);
    var offset = (start - dateTime(schedule.anchor)) / DAY_MS;
    var count = yearLength(year);
    for (var i = 0; i < count; i++) {
      var shift = schedule.pattern[modulo(offset + i, schedule.pattern.length)];
      days[isoDate(start + i * DAY_MS)] = { shift: shift, hours: shift === 'R' ? 0 : 8 };
    }
    return days;
  }

  function inferSchedule(days, year) {
    if (!validYear(year) || !isRecord(days)) return null;
    var start = yearStart(year);
    var end = yearLength(year) - 1;
    // Only a contiguous, unambiguous recent suffix is evidence. Never replace an absence.
    while (end >= 0 && !OWN.call(days, isoDate(start + end * DAY_MS))) end--;
    if (end < 0) return null;
    var suffix = [];
    for (var i = end; i >= 0; i--) {
      var iso = isoDate(start + i * DAY_MS);
      if (!OWN.call(days, iso) || !isRecord(days[iso]) || CYCLE_SHIFTS.indexOf(days[iso].shift) === -1) break;
      suffix.push(days[iso].shift);
    }
    suffix.reverse();
    for (var period = 2; period * 2 <= suffix.length; period++) {
      var from = suffix.length - period * 2;
      var matches = true;
      var hasWork = false;
      var hasRest = false;
      for (var j = 0; j < period; j++) {
        var shift = suffix[from + j];
        if (shift !== suffix[from + period + j]) { matches = false; break; }
        if (shift === 'R') hasRest = true;
        else hasWork = true;
      }
      if (matches && hasWork && hasRest) {
        return {
          anchor: isoDate(start + (end - period + 1) * DAY_MS),
          pattern: suffix.slice(suffix.length - period)
        };
      }
    }
    return null;
  }

  function validateBaseline(baseline, year) {
    if (!validYear(year)) return ['L’anno deve essere un intero da 1 a 9999.'];
    if (!isRecord(baseline)) return ['Il riferimento deve essere un calendario completo.'];
    var errors = [];
    var start = yearStart(year);
    var count = yearLength(year);
    var keys = Object.keys(baseline);
    for (var i = 0; i < keys.length; i++) {
      var time = dateTime(keys[i]);
      if (!Number.isFinite(time) || time < start || time >= start + count * DAY_MS) errors.push('Data non valida per il riferimento: ' + keys[i] + '.');
    }
    for (var day = 0; day < count; day++) {
      var iso = isoDate(start + day * DAY_MS);
      if (!OWN.call(baseline, iso)) {
        errors.push('Giorno mancante nel riferimento: ' + iso + '.');
        continue;
      }
      var entry = baseline[iso];
      if (!isRecord(entry)) {
        errors.push('Giorno non valido nel riferimento: ' + iso + '.');
        continue;
      }
      if (BASELINE_SHIFTS.indexOf(entry.shift) === -1) errors.push('Sigla non valida nel riferimento: ' + iso + '.');
      if (typeof entry.hours !== 'number' || !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 8) errors.push('Le ore devono essere comprese tra 0 e 8: ' + iso + '.');
    }
    return errors;
  }

  return Object.freeze({
    validateSchedule: validateSchedule,
    createSchedule: createSchedule,
    generateYear: generateYear,
    inferSchedule: inferSchedule,
    validateBaseline: validateBaseline
  });
}));
