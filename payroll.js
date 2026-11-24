/* Meloncino: pure payroll simulation, without network or browser dependencies. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeloncinoEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SHIFT_LABELS = Object.freeze({
    '': 'Da compilare', '0': 'Giornata', '1': 'Mattina',
    '2': 'Pomeriggio', '3': 'Notte', R: 'Riposo',
    C: 'Compensativo / riposo turno', F: 'Ferie', H: 'Festività non goduta',
    P: 'Festività goduta', L: 'ROL', M: 'Malattia'
  });
  var DEFAULT_SETTINGS = Object.freeze({
    baseRate: 11.68638, presenceBonus: 51.67,
    dayBonus: 2, nightBonus: 4, weekendDayBonus: 30, weekendNightBonus: 35,
    contributionRate: 9.34, nightStartHour: 22,
    secondRate: 33, monthlyDeduction: 166, annualIncomeEstimate: 30000,
    regionalRate: 0, municipalRate: 0, deductionMode: 'fixed',
    taxMode: 'law2026'
  });
  var PREMIUM_PERCENTAGES = Object.freeze({
    premiumRate: 25, standardRate: 10, eveningRate: 20, nightRate: 35,
    saturdayRate: 45, sundayRate: 50, holidayNightRate: 60
  });
  var OWN = Object.prototype.hasOwnProperty;
  var TOTAL_FIELDS = ['paidHours', 'workedHours', 'gross', 'contributions', 'fiscal',
    'ordinaryTaxable', 'irpefGross', 'deduction',
    'irpef', 'addizionali', 'otherTax', 'net'];
  var RATE_KEYS = ['baseRate', 'contributionRate', 'secondRate', 'regionalRate', 'municipalRate'];
  var MONEY_KEYS = ['presenceBonus', 'dayBonus', 'nightBonus', 'weekendDayBonus',
    'weekendNightBonus', 'monthlyDeduction', 'annualIncomeEstimate'];
  // Cash earnings; welfare, tickets and TFR remain outside this model.
  var EARNING_RULES = Object.freeze({
    AA245: ['Retribuzione ordinaria', 'baseRate', true],
    D10465: ['Festività non goduta', 'baseRate', true],
    D10466: ['Festività goduta', 'baseRate', true],
    D10455: ['Patrono non lavorato', 'baseRate', true],
    F1100: ['Ferie', 'baseRate', true], F1300: ['ROL', 'baseRate', true],
    MAL: ['Malattia (stima alla base)', 'baseRate', true],
    X10628: ['Assemblea sindacale', 'baseRate', true],
    X10879: ['Ore riposo turno', 'baseRate', true],
    MD0251: ['Turnazione continua 25%', 'premiumRate'],
    MD0252: ['Rettifica turnazione 25%', 'premiumRate'],
    S16310: ['Avvicendamento 10%', 'standardRate'],
    S16320: ['Serale 20%', 'eveningRate'],
    S16335: ['Notte 35%', 'nightRate'],
    S16345: ['Sabato 45%', 'saturdayRate'],
    S16350: ['Domenica / festivo 50%', 'sundayRate'],
    S16360: ['Notte domenica 60%', 'holidayNightRate'],
    S17115: ['Rettifica notte 35%', 'nightRate'],
    S17260: ['Rettifica avvicendamento 10%', 'standardRate'],
    I16906: ['Premio presenza / produzione', 'presenceBonus'],
    I20327: ['Gettone weekend diurno', 'weekendDayBonus'],
    I20329: ['Gettone diurno feriale', 'dayBonus'],
    I20330: ['Gettone weekend notturno', 'weekendNightBonus'],
    I20331: ['Gettone notturno feriale', 'nightBonus']
  });

  function round2(value) {
    var magnitude = Math.abs(value);
    var rounded = Math.round((magnitude + Number.EPSILON * Math.max(1, magnitude)) * 100) / 100;
    return value < 0 && rounded !== 0 ? -rounded : rounded;
  }
  function quantity(value) { return Math.round(value * 1e8) / 1e8; }
  function own(object, key) { return OWN.call(object, key); }
  function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function finite(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  }
  function dateFromISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var date = new Date(iso + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date : null;
  }
  function easterISO(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = (h + l - 7 * m + 114) % 31 + 1;
    return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  function nextISO(iso) {
    var date = dateFromISO(iso);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  function holidayName(iso) {
    var date = dateFromISO(iso);
    if (!date) return '';
    // Law 151/2025 restores 4 October as a public holiday from 2026.
    if (iso.slice(5) === '10-04' && date.getUTCFullYear() >= 2026) return 'San Francesco d’Assisi';
    var names = {
      '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Festa della Liberazione',
      '05-01': 'Festa del Lavoro', '06-02': 'Festa della Repubblica',
      '08-15': 'Ferragosto', '11-01': 'Ognissanti', '12-08': 'Immacolata Concezione',
      '12-25': 'Natale', '12-26': 'Santo Stefano'
    };
    var easter = easterISO(date.getUTCFullYear());
    if (iso === easter) return 'Pasqua';
    if (iso === nextISO(easter)) return 'Lunedì dell’Angelo';
    return names[iso.slice(5)] || '';
  }

  function validateState(state) {
    var errors = [];
    function error(text) { errors.push(text); }
    if (!record(state)) return ['Il backup deve essere un oggetto.'];
    if (state.version !== 1) error('Versione del backup non supportata.');
    if (!Number.isInteger(state.year) || state.year < 2026 || state.year > 2100) error('Anno non valido: sono supportati gli anni interi dal 2026 al 2100.');
    if (!Number.isInteger(state.month) || state.month < 1 || state.month > 12) error('Mese selezionato non valido.');
    if (!record(state.settings)) error('Impostazioni non valide.');
    else {
      var s = state.settings;
      RATE_KEYS.forEach(function (key) {
        if (own(s, key) && !finite(s[key], 0, 100)) error('Impostazione ' + key + ': inserire un numero da 0 a 100.');
      });
      MONEY_KEYS.forEach(function (key) {
        if (own(s, key) && !finite(s[key], 0, 1e9)) error('Impostazione ' + key + ': importo non valido.');
      });
      if (own(s, 'taxMode') && s.taxMode !== 'law2026' && s.taxMode !== 'spec') error('Profilo fiscale non valido.');
      if (own(s, 'deductionMode') && s.deductionMode !== 'fixed' && s.deductionMode !== 'estimated') error('Modalità detrazioni non valida.');
      if (own(s, 'nightStartHour') && !finite(s.nightStartHour, 0, 23)) error('Ora iniziale notte non valida: inserire un numero da 0 a 23.');
    }
    if (own(state, 'annual')) {
      if (!record(state.annual)) error('Dati annuali non validi.');
      else {
        var annual = state.annual;
        var annualKeys = ['thirteenthEnabled', 'thirteenthMonths', 'thirteenthHours',
          'thirteenthGross', 'productionBonus', 'productionMonth'];
        Object.keys(annual).forEach(function (key) {
          if (annualKeys.indexOf(key) === -1) error('Campo annuale non valido: ' + key + '.');
        });
        if (own(annual, 'thirteenthEnabled') && typeof annual.thirteenthEnabled !== 'boolean') error('Attivazione tredicesima non valida.');
        if (own(annual, 'thirteenthMonths') && !finite(annual.thirteenthMonths, 0, 12)) error('Ratei tredicesima non validi: inserire un numero da 0 a 12.');
        if (own(annual, 'thirteenthHours') && !finite(annual.thirteenthHours, 0, 300)) error('Ore base tredicesima non valide: inserire un numero da 0 a 300.');
        ['thirteenthGross', 'productionBonus'].forEach(function (key) {
          if (own(annual, key) && !(key === 'thirteenthGross' && annual[key] === null) &&
              !finite(annual[key], 0, Number.MAX_VALUE)) error('Importo annuale ' + key + ' non valido.');
        });
        if (own(annual, 'productionMonth') && (!Number.isInteger(annual.productionMonth) || annual.productionMonth < 1 || annual.productionMonth > 12)) error('Mese premio di produzione non valido.');
      }
    }
    if (!record(state.opening)) error('Progressivi iniziali non validi.');
    else ['ordinaryTaxable'].forEach(function (key) {
      if (!finite(state.opening[key], 0, 1e9)) error('Progressivo iniziale ' + key + ' non valido.');
    });
    if (!record(state.days)) error('Calendario non valido.');
    else Object.keys(state.days).forEach(function (iso) {
      var day = state.days[iso];
      if (!dateFromISO(iso) || Number(iso.slice(0, 4)) !== state.year) error('Data non valida o fuori anno: ' + iso + '.');
      if (!record(day)) { error('Giornata non valida: ' + iso + '.'); return; }
      if (typeof day.shift !== 'string' || !own(SHIFT_LABELS, day.shift)) error('Turno non valido: ' + iso + '.');
      if (own(day, 'hours') && !finite(day.hours, 0, 8)) error('Ore non valide per ' + iso + ': sono ammesse da 0 a 8 ore (oltre 8 non supportato).');
      if (own(day, 'overtimeHours') && !finite(day.overtimeHours, 0, 16)) error('Ore straordinarie non valide per ' + iso + ': sono ammesse da 0 a 16 ore.');
      if (own(day, 'overtimePercent') && !finite(day.overtimePercent, 0, 1000)) error('Percentuale straordinario non valida per ' + iso + ': sono ammessi valori da 0 a 1000.');
      if (own(day, 'holiday') && day.holiday !== undefined && typeof day.holiday !== 'boolean') error('Festività personalizzata non valida: ' + iso + '.');
      if (own(day, 'note') && (typeof day.note !== 'string' || day.note.length > 10000)) error('Nota non valida: ' + iso + '.');
    });
    if (!record(state.months)) error('Dati mensili non validi.');
    else Object.keys(state.months).forEach(function (key) {
      var month = state.months[key];
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || Number(key.slice(0, 4)) !== state.year) error('Chiave del mese non valida: ' + key + '.');
      if (!record(month)) { error('Mese non valido: ' + key + '.'); return; }
      if (own(month, 'enabled') && typeof month.enabled !== 'boolean') error('Attivazione mese non valida: ' + key + '.');
      ['presenceEnabled', 'premiumEnabled'].forEach(function (field) {
        if (own(month, field) && typeof month[field] !== 'boolean') error(key + ': ' + field + ' deve essere booleano.');
      });
      ['premiumHours', 'extraPaidHours'].forEach(function (field) {
        if (own(month, field) && !finite(month[field], 0, 1000)) error(key + ': ' + field + ' deve essere tra 0 e 1000.');
      });
      ['standardHours', 'presenceBonus', 'actualNet'].forEach(function (field) {
        if (own(month, field) && month[field] !== null && !finite(month[field], 0, field === 'standardHours' ? 1000 : 1e9)) error(key + ': ' + field + ' non valido.');
      });
      ['adjustmentGross', 'otherTax', 'netAdjust'].forEach(function (field) {
        if (own(month, field) && !finite(month[field], -1e9, 1e9)) error(key + ': ' + field + ' non valido.');
      });
      if (own(month, 'quantityOverrides')) {
        if (!record(month.quantityOverrides)) error(key + ': quantità da cedolino non valide.');
        else Object.keys(month.quantityOverrides).forEach(function (code) {
          var signed = code === 'S17115' || code === 'S17260' || code === 'MD0252';
          if (!own(EARNING_RULES, code) || !finite(month.quantityOverrides[code], signed ? -1000 : 0, 1000)) {
            error(key + ': quantità non valida per ' + code + '.');
          }
        });
      }
    });
    return errors;
  }

  function settingsFor(input) {
    var result = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
      result[key] = own(input, key) ? input[key] : DEFAULT_SETTINGS[key];
    });
    Object.keys(PREMIUM_PERCENTAGES).forEach(function (key) {
      result[key] = result.baseRate * PREMIUM_PERCENTAGES[key] / 100;
    });
    return result;
  }
  function annualTax(taxable, secondRate) {
    taxable = Math.max(0, taxable);
    return round2(Math.min(taxable, 28000) * 0.23 + Math.min(Math.max(taxable - 28000, 0), 22000) * secondRate / 100 + Math.max(taxable - 50000, 0) * 0.43);
  }
  function annualDeductionFor(income) {
    var deduction;
    if (income <= 15000) deduction = 1955;
    else if (income <= 28000) deduction = 1910 + 1190 * (28000 - income) / 13000;
    else if (income <= 50000) deduction = 1910 * (50000 - income) / 22000;
    else deduction = 0;
    if (income > 25000 && income <= 35000) deduction += 65;
    return deduction;
  }
  function holidayAt(iso, days) {
    var day = own(days, iso) ? days[iso] : null;
    if (day && typeof day.holiday === 'boolean') return day.holiday;
    return Boolean(holidayName(iso));
  }
  function festiveAt(iso, days) {
    return dateFromISO(iso).getUTCDay() === 0 || holidayAt(iso, days);
  }

  function calculateYear(state) {
    var invalid = validateState(state);
    if (invalid.length) throw new RangeError(invalid.join('\n'));
    var s = settingsFor(state.settings);
    var ordinaryProgressive = round2(state.opening.ordinaryTaxable);
    var secondRate = s.taxMode === 'law2026' ? 33 : s.secondRate;
    var monthlyDeduction = round2(s.deductionMode === 'estimated' ? annualDeductionFor(s.annualIncomeEstimate) / 12 : s.monthlyDeduction);
    var annual = state.annual || {};
    var thirteenthGross = annual.thirteenthEnabled === true ? round2(annual.thirteenthGross == null ?
      s.baseRate * (own(annual, 'thirteenthHours') ? annual.thirteenthHours : 173) *
      (own(annual, 'thirteenthMonths') ? annual.thirteenthMonths : 0) / 12 : annual.thirteenthGross) : 0;
    var productionBonus = round2(own(annual, 'productionBonus') ? annual.productionBonus : 0);
    var productionMonth = own(annual, 'productionMonth') ? annual.productionMonth : 12;
    var warnings = [];
    if (state.year > 2026) warnings.push('Anno ' + state.year + ': simulazione con aliquote e regole del modello 2026, non previsione della normativa futura.');
    if (s.taxMode === 'spec') warnings.push('Profilo specifica: secondo scaglione configurabile; non è il profilo normativo 2026.');
    var openingPresent = state.opening.ordinaryTaxable !== 0;
    if (openingPresent) warnings.push('Progressivi iniziali presenti senza imposte pregresse: conguaglio annuale finale non determinabile.');
    var months = [], enabledCount = 0;
    var totals = { actualNet: null, actualMonths: 0, matchedNet: 0, netDifference: null,
      thirteenthGross: 0, productionBonus: 0 };
    TOTAL_FIELDS.forEach(function (field) { totals[field] = 0; });

    for (var monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      var key = state.year + '-' + String(monthNumber).padStart(2, '0');
      var input = own(state.months, key) ? state.months[key] : {};
      var result = { key: key, month: monthNumber, enabled: input.enabled === true,
        actualNet: input.actualNet == null ? null : round2(input.actualNet),
        calendarGross: 0, compensatoryHours: 0, lines: [], warnings: [],
        thirteenthGross: monthNumber === 12 ? thirteenthGross : 0,
        productionBonus: monthNumber === productionMonth ? productionBonus : 0 };
      TOTAL_FIELDS.forEach(function (field) { result[field] = 0; });
      // Inclusion changes annual aggregation, never the month's own calculation.
      var hasMonthlyData = own(state.months, key) || Object.keys(state.days).some(function (iso) { return iso.slice(0, 7) === key; });
      if (hasMonthlyData || result.thirteenthGross || result.productionBonus) {
        if (result.enabled) enabledCount += 1;
        var groups = new Map();
        function add(code, label, count, rate) {
          if (!count || !rate) return;
          if (!groups.has(code)) groups.set(code, { code: code, label: label, quantity: 0, rate: rate });
          groups.get(code).quantity += count;
        }
        var autoStandard = 0;
        Object.keys(state.days).sort().forEach(function (iso) {
          if (iso.slice(0, 7) !== key) return;
          var day = state.days[iso], shift = day.shift;
          var overtimeHours = own(day, 'overtimeHours') ? day.overtimeHours : 0;
          var overtimePercent = own(day, 'overtimePercent') ? day.overtimePercent : 0;
          if (overtimeHours > 0) {
            result.paidHours += overtimeHours;
            result.workedHours += overtimeHours;
            add('OT' + String(overtimePercent), 'Straordinario +' + overtimePercent + '%',
              overtimeHours, s.baseRate * (1 + overtimePercent / 100));
          }
          if (shift === '' || shift === 'R') return;
          var hours = own(day, 'hours') ? day.hours : (shift === 'H' ? 6.67 : 8);
          if (shift === 'C') {
            result.compensatoryHours += hours;
            result.paidHours += hours;
            add('X10879', 'Ore riposo turno', hours, s.baseRate);
            return;
          }
          result.paidHours += hours;
          if (['0', '1', '2', '3'].indexOf(shift) !== -1) {
            result.workedHours += hours;
            add('AA245', 'Retribuzione ordinaria', hours, s.baseRate);
          } else {
            var absenceCodes = { F: ['F1100', 'Ferie'], H: ['D10465', 'Festività non goduta'],
              P: ['D10466', 'Festività goduta'], L: ['F1300', 'ROL'], M: ['MAL', 'Malattia (stima alla base)'] };
            add(absenceCodes[shift][0], absenceCodes[shift][1], hours, s.baseRate);
          }
          if (hours === 0 || ['1', '2', '3'].indexOf(shift) === -1) return;
          var weekday = dateFromISO(iso).getUTCDay();
          var festive = festiveAt(iso, state.days);
          var night = shift === '3';
          var weekendBonus = festive || weekday === 6;
          if (night) {
            add(weekendBonus ? 'I20330' : 'I20331', weekendBonus ? 'Gettone notturno weekend / festivo' : 'Gettone notturno feriale', 1, weekendBonus ? s.weekendNightBonus : s.nightBonus);
            var beforeMidnight = Math.min(hours, 24 - s.nightStartHour);
            var sundayHours = (weekday === 0 ? beforeMidnight : 0) +
              (dateFromISO(nextISO(iso)).getUTCDay() === 0 ? hours - beforeMidnight : 0);
            add('S16360', 'Notte domenica 60%', sundayHours, s.holidayNightRate);
            add('S16335', 'Notte non domenicale 35%', hours - sundayHours, s.nightRate);
          } else {
            add(weekendBonus ? 'I20327' : 'I20329', weekendBonus ? 'Gettone diurno weekend / festivo' : 'Gettone diurno feriale', 1, weekendBonus ? s.weekendDayBonus : s.dayBonus);
            if (festive) add('S16350', 'Diurno domenica / festivo 50%', hours, s.sundayRate);
            else if (weekday === 6) add('S16345', 'Diurno sabato 45%', hours, s.saturdayRate);
            else if (shift === '1') autoStandard += hours;
            else add('S16320', 'Serale 18–22 20%', Math.max(0, hours - 4), s.eveningRate);
          }
          if (festive) result.warnings.push(iso + ': festività equiparata al weekend per il gettone giornaliero.');
        });
        var extraHours = own(input, 'extraPaidHours') ? input.extraPaidHours : 0;
        result.paidHours += extraHours;
        add('EXTRA', 'Altre ore pagate alla base (manuali)', extraHours, s.baseRate);
        if (input.premiumEnabled !== false) add('MD0251', 'Turnazione continua 25%', own(input, 'premiumHours') ? input.premiumHours : 0, s.premiumRate);
        add('S16310', 'Avvicendamento mattina feriale 10%', input.standardHours == null ? autoStandard : input.standardHours, s.standardRate);
        if (hasMonthlyData && input.presenceEnabled !== false) add('I16906', 'Premio presenza / produzione', 1, input.presenceBonus == null ? s.presenceBonus : input.presenceBonus);
        add('RETT', 'Rettifica imponibile lorda', own(input, 'adjustmentGross') ? input.adjustmentGross : 0, 1);
        add('THIRTEENTH', 'Tredicesima mensilità', 1, result.thirteenthGross);
        add('PRODUCTION', 'Premio di produzione', 1, result.productionBonus);
        groups.forEach(function (line) { result.calendarGross += round2(line.quantity * line.rate); });
        result.calendarGross = round2(result.calendarGross);
        // Actual payroll quantities reconcile source differences, not a fitted residual.
        var overrides = input.quantityOverrides || {};
        Object.keys(overrides).forEach(function (code) {
          if ((code === 'MD0251' && input.premiumEnabled === false) ||
              (code === 'I16906' && input.presenceEnabled === false)) return;
          var rule = EARNING_RULES[code];
          var previous = groups.get(code);
          var oldQuantity = previous ? previous.quantity : 0;
          var count = overrides[code];
          if (rule[2]) result.paidHours += count - oldQuantity;
          if (code === 'AA245') result.workedHours += count - oldQuantity;
          if (code === 'X10879') result.compensatoryHours += count - oldQuantity;
          var rate = code === 'I16906' && input.presenceBonus != null ? input.presenceBonus : s[rule[1]];
          groups.set(code, { code: code, label: rule[0], quantity: count, rate: rate, overridden: true });
        });
        if (Object.keys(overrides).length) result.warnings.push('Quantità da cedolino applicate: riconciliazione storica, non prova dell’accuratezza della previsione da calendario.');
        if (groups.has('MAL') && groups.get('MAL').quantity > 0) {
          result.warnings.push('Malattia: stima alla retribuzione base; non applica le indennità INPS né il trattamento aziendale di malattia.');
        }
        groups.forEach(function (line) {
          line.quantity = quantity(line.quantity);
          line.amount = round2(line.quantity * line.rate);
          if (line.amount === 0) return;
          result.lines.push(line);
          result.gross += line.amount;
        });
        result.paidHours = quantity(result.paidHours);
        result.workedHours = quantity(result.workedHours);
        result.compensatoryHours = quantity(result.compensatoryHours);
        result.gross = round2(result.gross);
        if (result.gross < 0) result.warnings.push('Lordo negativo da rettifiche: contributi e imponibile sono storni firmati nel modello.');
        result.contributions = round2(result.gross * s.contributionRate / 100);
        result.fiscal = round2(result.gross - result.contributions);
        result.ordinaryTaxable = result.fiscal;
        // Cumulative marginal estimate, not a monthly payslip withholding formula.
        var nextProgressive = round2(ordinaryProgressive + result.ordinaryTaxable);
        result.irpefGross = round2(annualTax(nextProgressive, secondRate) - annualTax(ordinaryProgressive, secondRate));
        result.deduction = round2(Math.min(Math.max(0, result.irpefGross), monthlyDeduction));
        result.irpef = round2(result.irpefGross - result.deduction);
        result.addizionali = round2(result.ordinaryTaxable * s.regionalRate / 100) + round2(result.ordinaryTaxable * s.municipalRate / 100);
        result.addizionali = round2(result.addizionali);
        result.otherTax = round2(own(input, 'otherTax') ? input.otherTax : 0);
        result.net = round2(result.gross - result.contributions - result.irpef - result.addizionali - result.otherTax + (own(input, 'netAdjust') ? input.netAdjust : 0));
        if (result.enabled) {
          ordinaryProgressive = nextProgressive;
        }
      }
      result.ordinaryProgressive = ordinaryProgressive;
      result.remainingThreshold = round2(Math.max(0, 28000 - ordinaryProgressive));
      if (result.enabled) {
        TOTAL_FIELDS.forEach(function (field) { totals[field] += result[field]; });
        totals.thirteenthGross += result.thirteenthGross;
        totals.productionBonus += result.productionBonus;
        if (result.actualNet !== null) {
          totals.actualNet = round2((totals.actualNet || 0) + result.actualNet);
          totals.actualMonths += 1;
          totals.matchedNet += result.net;
        }
      }
      months.push(result);
    }
    TOTAL_FIELDS.forEach(function (field) { totals[field] = field === 'paidHours' || field === 'workedHours' ? quantity(totals[field]) : round2(totals[field]); });
    totals.thirteenthGross = round2(totals.thirteenthGross);
    totals.productionBonus = round2(totals.productionBonus);
    totals.matchedNet = round2(totals.matchedNet);
    if (totals.actualMonths) totals.netDifference = round2(totals.matchedNet - totals.actualNet);
    // Annual deductions are available for enabled months only; unused monthly
    // deductions are recovered solely in this annual reconciliation, not in net pay.
    var grossAnnualTax = annualTax(ordinaryProgressive, secondRate);
    var annualDeduction = round2(Math.min(grossAnnualTax, monthlyDeduction * enabledCount));
    var annualIrpef = round2(grossAnnualTax - annualDeduction);
    return { months: months, totals: totals, ordinaryProgressive: ordinaryProgressive,
      nightStartHour: s.nightStartHour, remainingThreshold: round2(Math.max(0, 28000 - ordinaryProgressive)),
      annualIrpef: annualIrpef, annualDeduction: annualDeduction,
      thirteenthGross: totals.thirteenthGross, productionBonus: totals.productionBonus,
      annualBalance: openingPresent ? null : round2(annualIrpef - totals.irpef), warnings: warnings };
  }

  return Object.freeze({ DEFAULT_SETTINGS: DEFAULT_SETTINGS, PREMIUM_PERCENTAGES: PREMIUM_PERCENTAGES,
    SHIFT_LABELS: SHIFT_LABELS, round2: round2, holidayName: holidayName,
    calculateYear: calculateYear, validateState: validateState });
}));
