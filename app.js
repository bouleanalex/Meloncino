/* Interfaccia offline: il motore in payroll.js è indipendente da DOM e storage. */
(() => {
  'use strict';
  const E = globalThis.MeloncinoEngine;
  const C = globalThis.MeloncinoCalendar;
  const K = globalThis.MeloncinoCalibration;
  const seed = globalThis.MeloncinoSeed;
  const $ = id => document.getElementById(id);
  if (!E || !seed || !C || !K) {
    $('fatal').hidden = false;
    $('fatal').textContent = 'File mancanti: mantieni index.html, styles.css, app.js, payroll.js, calendar.js, calibration.js e seed.js nella stessa cartella.';
    return;
  }
  const STORAGE_KEY = 'meloncino.v1';
  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const money = value => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value ?? 0);
  const number = value => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value ?? 0);
  const errorPercentage = (estimate, actual) => {
    const percent = K.relativeErrorPercent(estimate, actual);
    return percent === null ? (estimate !== null && actual === 0 ? 'n.d.' : '—')
      : `${percent > 0 ? '+' : ''}${number(percent)}%`;
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const quantityCodes = ['AA245','X10879','D10465','D10466','D10455','F1100','F1300','X10628','MAL','MD0251','MD0252','S16310','S16320','S16335','S16345','S16350','S16360','S17115','S17260','I16906','I20327','I20329','I20330','I20331'];
  const monthDefaults = () => ({enabled: false, presenceEnabled: true, premiumEnabled: true, premiumHours: 40, standardHours: null, presenceBonus: null, extraPaidHours: 0, adjustmentGross: 0, otherTax: 0, netAdjust: 0, actualNet: null, quantityOverrides: {}});
  const keyFor = (month, year = state.year) => `${year}-${String(month).padStart(2, '0')}`;
  const annualDefaults = months => ({thirteenthEnabled:true, thirteenthMonths:months, thirteenthHours:173, thirteenthGross:null, productionBonus:0, productionMonth:12});
  const initial = () => ({version: 1, year: 2026, month: 11, settings: clone(E.DEFAULT_SETTINGS), annual:annualDefaults(7), opening: {ordinaryTaxable: 0}, days: clone(seed.days), months: Object.fromEntries(monthNames.map((_, i) => [keyFor(i + 1, 2026), {...monthDefaults(), ...clone(seed.months[keyFor(i + 1, 2026)] || {})}]))});
  // The calculation API accepts omitted optional fields; the UI needs complete controls.
  // Copy only known keys rather than merging arbitrary backup properties.
  function normalized(input) {
    const settings = Object.fromEntries(Object.entries(E.DEFAULT_SETTINGS).map(([key, value]) => [key, Object.hasOwn(input.settings, key) ? input.settings[key] : clone(value)]));
    const oldEmptyMonth = {...monthDefaults(), presenceBonus: 51.67};
    delete oldEmptyMonth.quantityOverrides;
    delete oldEmptyMonth.presenceEnabled;
    delete oldEmptyMonth.premiumEnabled;
    const months = Object.fromEntries(monthNames.map((_, index) => {
      const key = keyFor(index + 1, input.year);
      let source = input.months[key] || {};
      // Retire only the untouched January–April seed amounts, never custom inputs.
      const untouchedEmpty = input.year === 2026 && index < 4
        && Object.entries(oldEmptyMonth).every(([field, value]) => source[field] === value)
        && Object.keys(source.quantityOverrides || {}).length === 0
        && !Object.entries(input.days).some(([iso, day]) => iso.startsWith(key + '-') && day.shift !== '');
      if (untouchedEmpty) source = {...source, premiumHours: 0, presenceBonus: 0};
      return [key, Object.fromEntries(Object.entries(monthDefaults()).map(([field, fallback]) => [field, field === 'quantityOverrides'
        ? Object.fromEntries(quantityCodes.filter(code => Object.hasOwn(source.quantityOverrides || {}, code)).map(code => [code, source.quantityOverrides[code]]))
        : Object.hasOwn(source, field) ? source[field] : fallback]))];
    }));
    const days = Object.fromEntries(Object.entries(input.days).map(([iso, day]) => [iso, {
      shift: day.shift, hours: Object.hasOwn(day, 'hours') ? day.hours : defaultHours(day.shift),
      overtimeHours: day.overtimeHours ?? 0, overtimePercent: day.overtimePercent ?? 0,
      ...(typeof day.holiday === 'boolean' ? {holiday: day.holiday} : {}),
      ...(typeof day.note === 'string' ? {note: day.note} : {})
    }]));
    const estimatedMonths = Object.entries(months).filter(([key, cfg]) => cfg.enabled && Object.entries(days).filter(([iso, day]) => iso.startsWith(key) && day.shift !== '').length >= 15).length;
    return {version: 1, year: input.year, month: input.month, settings, months, days,
      annual: {...annualDefaults(estimatedMonths), ...(input.annual || {})},
      ...(input.schedule ? {schedule:clone(input.schedule)} : {}),
      ...(input.baseline ? {baseline:clone(input.baseline)} : {}),
      opening: {ordinaryTaxable: input.opening.ordinaryTaxable}};
  }
  function validateYear(input) {
    const errors = E.validateState(input);
    if (input && typeof input === 'object') {
      if (input.schedule !== undefined) errors.push(...C.validateSchedule(input.schedule));
      if (input.baseline !== undefined) {
        errors.push(...C.validateBaseline(input.baseline, input.year));
        errors.push(...E.validateState({...input, days:input.baseline}));
      }
    }
    return errors;
  }
  function loadArchive(input) {
    if (input?.version !== 2) {
      const errors = validateYear(input);
      if (errors.length) throw new Error(errors.join(' '));
      const year = normalized(input);
      return {version:2, selectedYear:year.year, years:{[year.year]:year}};
    }
    if (!input.years || typeof input.years !== 'object' || Array.isArray(input.years) ||
      Object.keys(input.years).length > 75 ||
      (Object.keys(input.years).length === 0 ? input.selectedYear !== null
        : !Number.isInteger(input.selectedYear) || !Object.hasOwn(input.years, input.selectedYear))) throw new Error('Archivio annuale non valido.');
    const years = {};
    Object.entries(input.years).forEach(([key, value]) => {
      const errors = validateYear(value);
      if (String(value?.year) !== key || errors.length) throw new Error(`Anno ${key}: ${errors.join(' ') || 'chiave non valida'}`);
      years[key] = normalized(value);
    });
    return {version:2, selectedYear:input.selectedYear, years};
  }
  let state = normalized(initial());
  let archive = {version:2, selectedYear:state.year, years:{[state.year]:state}};
  let result;
  let calibration;
  let storageWarning = '';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      archive = loadArchive(JSON.parse(saved));
      state = archive.years[archive.selectedYear] || null;
    }
  } catch (error) {
    storageWarning = `Archivio locale non disponibile o non valido: ${error.message}. Sono mostrati i dati originali; esporta un backup per conservarli.`;
  }
  const today = new Date();
  if (Object.hasOwn(archive.years, today.getFullYear())) state = archive.years[today.getFullYear()];
  if (state) state.month = today.getMonth() + 1;
  function announce(message, error = false) {
    $('fatal').hidden = !message;
    $('fatal').textContent = message;
    $('fatal').style.color = error ? '#832d24' : '#224d3a';
  }
  function save() {
    try {
      archive.selectedYear = state?.year ?? null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
      $('save-status').textContent = 'Salvato su questo browser';
    } catch (_) {
      $('save-status').textContent = 'Salvataggio non disponibile · esporta un backup';
      storageWarning = 'Il browser non consente il salvataggio locale. Le modifiche restano in questa pagina: esporta il backup prima di chiuderla.';
    }
  }
  function monthConfig() {
    const key = keyFor(state.month);
    if (!state.months[key]) state.months[key] = monthDefaults();
    return state.months[key];
  }
  function option(value, text) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = text;
    return el;
  }
  function shiftOptions(select) {
    // Explicit order: numeric-like object properties otherwise sort before ''.
    ['', '0', '1', '2', '3', 'M', 'R', 'C', 'F', 'H', 'P', 'L'].forEach(code => select.append(option(code, code ? `${code} · ${E.SHIFT_LABELS[code]}` : '— Da compilare')));
  }
  function defaultHours(shift) {
    return shift === 'H' ? 6.67 : !shift || shift === 'R' ? 0 : 8;
  }
  function decimalInput(input, value) {
    input.type = 'text'; input.inputMode = 'decimal';
    input.pattern = '[0-9]+([.,][0-9]{1,2})?'; input.required = true;
    input.value = value;
  }
  function readDecimal(input, max) {
    const value = input.value.trim().replace(',', '.');
    const valid = /^[0-9]+(?:\.[0-9]{1,2})?$/.test(value) && Number(value) <= max;
    input.setCustomValidity(valid ? '' : `Inserisci un numero da 0 a ${max}, con al massimo due decimali.`);
    input.setAttribute('aria-invalid', String(!valid));
    return valid ? Number(value) : null;
  }
  function makeField(container, {key, label, hint = '', min = 0, max = 1000000, step = '0.01', nullable = false, choices}, value, scope) {
    const labelEl = document.createElement('label');
    labelEl.append(document.createTextNode(label));
    const input = document.createElement(choices ? 'select' : 'input');
    input.id = `${scope}-${key}`;
    input.dataset.scope = scope;
    input.dataset.key = key;
    if (choices) choices.forEach(([v, text]) => input.append(option(v, text)));
    else {
      input.type = 'number'; input.min = String(min); input.max = String(max); input.step = step;
      input.required = !nullable;
      if (nullable) input.placeholder = 'Vuoto = automatico / non indicato';
    }
    input.value = value ?? '';
    input.dataset.nullable = String(nullable);
    labelEl.append(input);
    if (hint) {
      const small = document.createElement('span'); small.className = 'field-hint'; small.textContent = hint; labelEl.append(small);
    }
    container.append(labelEl);
    return input;
  }
  const monthFields = [
    {key:'presenceBonus',label:'Premio mensile €',hint:'Vuoto = valore predefinito; non è il premio di produzione annuo',nullable:true},
    {key:'premiumHours',label:'Ore turnazione continua 25%',max:1000},
    {key:'standardHours',label:'Ore maggiorazione 10%',hint:'Vuoto = mattine lun–ven automatiche',nullable:true,max:744},
    {key:'extraPaidHours',label:'Altre ore pagate alla base',hint:'Aggiuntive alle ore del calendario, incluse le C',max:744},
    {key:'adjustmentGross',label:'Rettifiche imponibili lorde €',hint:'Anche negative',min:-100000},
    {key:'otherTax',label:'Altre imposte / trattenute €'},
    {key:'netAdjust',label:'Rettifiche nette €',hint:'Positive = accrediti, negative = addebiti',min:-100000}
  ];
  function renderMonthSettings() {
    $('month-settings').replaceChildren();
    const cfg = monthConfig();
    $('month-settings-title').textContent = `Parametri di ${monthNames[state.month - 1].toLowerCase()} ${state.year}`;
    monthFields.forEach(field => makeField($('month-settings'), field, cfg[field.key], 'month'));
    $('month-actualNet').value = cfg.actualNet ?? '';
    $('actual-month').value = state.month;
    $('actual-net-label').textContent = `Netto ricevuto a ${monthNames[state.month-1].toLowerCase()} ${state.year} €`;
  }
  function renderQuantities(current) {
    const overrides = monthConfig().quantityOverrides;
    const source = seed.months[current.key]?.quantityOverrides || {};
    $('source-quantities').hidden = Object.keys(source).length === 0;
    $('quantity-settings').replaceChildren();
    const codes = quantityCodes.filter(code => Object.hasOwn(overrides, code) || Object.hasOwn(source, code));
    $('quantity-empty').hidden = codes.length !== 0;
    codes.forEach(code => {
      const line = current.lines.find(item => item.code === code);
      const input = makeField($('quantity-settings'), {
        key: code, label: `${code} · ${line?.label || 'Voce del cedolino'}`,
        hint: Object.hasOwn(overrides, code)
          ? `Quantità da cedolino${line ? ' · tariffa ' + number(line.rate) + ' €' : ''}. Vuoto = automatico.`
          : 'Automatica dal calendario e dai parametri mensili; quantità cedolino rimossa.',
        min: -1000000, max: 1000000, step: 'any', nullable: true
      }, overrides[code], 'quantity');
      input.placeholder = 'Automatico';
    });
    const count = Object.keys(overrides).length;
    $('quantity-status').textContent = count
      ? `${count} quantità da cedolino attive. Lordo con quantità automatiche, senza queste sostituzioni: ${money(current.calendarGross)}. Il calendario non viene modificato.`
      : `Quantità automatiche dal calendario e dai parametri mensili: lordo ${money(current.calendarGross)}. Nessuna quantità da cedolino applicata.`;
  }
  const settingsGroups = [
    ['Contributi', [{key:'contributionRate',label:'INPS + FSBS %',max:100}]],
    ['Retribuzione e gettoni', [
      {key:'baseRate',label:'Base oraria · AA245 €/h',step:'0.00001'},
      {key:'presenceBonus',label:'Premio mensile predefinito €',hint:'Valore comune; il campo del mese consente un’eccezione'},
      {key:'dayBonus',label:'Gettone diurno feriale €'},
      {key:'nightBonus',label:'Gettone notturno feriale €'},
      {key:'weekendDayBonus',label:'Gettone weekend diurno €'},
      {key:'weekendNightBonus',label:'Gettone weekend notturno €'},
      {key:'nightStartHour',label:'Ora d’inizio notte (0–23)',max:23,step:'any',hint:'22 = 22:00; 22,5 = 22:30. Ore attribuite al mese d’inizio.'}
    ]]
  ];
  function renderSettings() {
    $('settings-form').replaceChildren();
    settingsGroups.forEach(([title, fields]) => {
      const group = document.createElement('section'); group.className = 'settings-group';
      const heading = document.createElement('h3'); heading.textContent = title;
      const grid = document.createElement('div'); grid.className = 'field-grid';
      fields.forEach(field => makeField(grid, field.key.endsWith('Rate') ? {...field, max: 100} : field, state.settings[field.key], 'settings'));
      group.append(heading, grid); $('settings-form').append(group);
    });
    const premiums = document.createElement('section'); premiums.className = 'settings-group';
    const title = document.createElement('h3'); title.textContent = 'Maggiorazioni automatiche sulla paga base';
    const grid = document.createElement('div'); grid.className = 'field-grid premium-rates';
    Object.entries(E.PREMIUM_PERCENTAGES).forEach(([key, percent]) => {
      const item = document.createElement('div');
      const label = document.createElement('span'); label.textContent = `${percent}% · €/h`;
      const output = document.createElement('output'); output.dataset.premiumRate = key;
      output.setAttribute('aria-label', `Tariffa maggiorazione ${percent}%`);
      item.append(label, output); grid.append(item);
    });
    premiums.append(title, grid); $('settings-form').append(premiums);
    $('opening-form').replaceChildren();
    makeField($('opening-form'),{key:'ordinaryTaxable',label:'Imponibile ordinario iniziale €'},state.opening.ordinaryTaxable,'opening');
    $('annual-settings').replaceChildren();
    [
      {key:'thirteenthEnabled',label:'Tredicesima a dicembre',choices:[['true','Inclusa'],['false','Esclusa']]},
      {key:'thirteenthMonths',label:'Ratei di tredicesima',max:12,hint:'7 iniziali per giugno–dicembre 2026; verifica la maturazione'},
      {key:'thirteenthHours',label:'Ore della base mensile',max:300,hint:'Base mensile = ore × paga base oraria'},
      {key:'thirteenthGross',label:'Lordo tredicesima manuale €',nullable:true,hint:'Vuoto = calcolato da base e ratei'},
      {key:'productionBonus',label:'Premio di produzione lordo €',hint:'Importo annuale aggiuntivo, non il premio mensile'},
      {key:'productionMonth',label:'Mese di pagamento del premio',choices:monthNames.map((name,i) => [String(i+1),name])}
    ].forEach(field => makeField($('annual-settings'),field,state.annual[field.key],'annual'));
  }
  function renderCalendar() {
    const days = new Date(state.year, state.month, 0).getDate();
    const offset = (new Date(state.year, state.month - 1, 1).getDay() + 6) % 7;
    const calendar = $('calendar'); calendar.replaceChildren();
    for (let i = 0; i < offset; i++) { const gap = document.createElement('div'); gap.setAttribute('aria-hidden','true'); calendar.append(gap); }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    for (let n = 1; n <= days; n++) {
      const iso = `${keyFor(state.month)}-${String(n).padStart(2,'0')}`;
      const day = state.days[iso] || {shift:'',hours:0};
      const weekday = new Date(state.year, state.month - 1, n).getDay();
      const cell = document.createElement('div'); cell.className = `day shift-${day.shift}${weekday === 0 || weekday === 6 ? ' weekend' : ''}`;
      const date = document.createElement('div'); date.className = 'day-date'; date.textContent = n;
      const holiday = document.createElement('span'); holiday.textContent = E.holidayName(iso) || ''; date.append(holiday);
      if (iso === today) {
        cell.classList.add('today'); cell.setAttribute('aria-current','date');
        const dot = document.createElement('i'); dot.className = 'today-dot'; dot.setAttribute('aria-label','Oggi'); date.prepend(dot);
      }
      const shift = document.createElement('select'); shiftOptions(shift); shift.value = day.shift;
      const printLabel = document.createElement('span'); printLabel.className = 'day-shift-label'; printLabel.textContent = day.shift ? `${day.shift} · ${E.SHIFT_LABELS[day.shift]}` : '— Da compilare';
      shift.setAttribute('aria-label',`Turno ${n} ${monthNames[state.month-1]}`); shift.dataset.date = iso; shift.dataset.dayField = 'shift';
      const row = document.createElement('div'); row.className = 'hours-row';
      const hours = document.createElement('input'); decimalInput(hours, day.hours);
      hours.disabled = !day.shift || day.shift === 'R'; hours.setAttribute('aria-label',`Ore ${n} ${monthNames[state.month-1]}`); hours.dataset.date = iso; hours.dataset.dayField = 'hours';
      if (day.shift === 'C') hours.title = 'Ore riposo turno retribuite alla paga base.';
      const unit = document.createElement('span'); unit.textContent = 'h'; row.append(hours, unit);
      const holidayChoice = document.createElement('select'); holidayChoice.className = 'holiday-choice'; holidayChoice.setAttribute('aria-label',`Festività ${n} ${monthNames[state.month-1]}`);
      holidayChoice.append(option('auto','Festivo: auto'),option('true','Festivo: sì'),option('false','Festivo: no'));
      holidayChoice.value = typeof day.holiday === 'boolean' ? String(day.holiday) : 'auto'; holidayChoice.dataset.date = iso; holidayChoice.dataset.dayField = 'holiday';
      cell.append(date, shift, printLabel, row, holidayChoice);
      const overtime = document.createElement('details'); overtime.className = 'overtime';
      const summary = document.createElement('summary'); summary.textContent = day.overtimeHours > 0 ? `Straordinario · ${number(day.overtimeHours)} h` : 'Straordinario';
      const enabledLabel = document.createElement('label');
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = day.overtimeHours > 0;
      enabled.dataset.date = iso; enabled.dataset.dayField = 'overtimeEnabled';
      enabledLabel.append(enabled, document.createTextNode('Aggiungi straordinario'));
      const fields = document.createElement('div'); fields.className = 'overtime-fields'; fields.hidden = !enabled.checked;
      [['overtimeHours','Ore extra',day.overtimeHours || 2],['overtimePercent','Maggiorazione %',day.overtimePercent ?? 0]].forEach(([key,label,value]) => {
        const wrapper = document.createElement('label'); wrapper.append(document.createTextNode(label));
        const field = document.createElement('input'); decimalInput(field, value);
        field.setAttribute('aria-label', `${label} ${n} ${monthNames[state.month-1]}`);
        field.dataset.date = iso; field.dataset.dayField = key;
        wrapper.append(field); fields.append(wrapper);
      });
      overtime.append(summary, enabledLabel, fields); cell.append(overtime);
      calendar.append(cell);
    }
    $('batch-from').max = $('batch-to').max = String(days);
    $('baseline-status').textContent = state.baseline ? 'Turnazione di riferimento bloccata. Puoi modificare i giorni e poi ripristinarli.' : 'Blocca una copia dell’anno per poter annullare le prove sul calendario.';
    $('reset-calendar').disabled = !state.baseline;
    $('lock-calendar').textContent = state.baseline ? 'Aggiorna riferimento' : 'Blocca turnazione di riferimento';
  }
  function addTableRow(body, values, className = '') {
    const row = document.createElement('tr'); row.className = className;
    values.forEach(value => { const cell = document.createElement('td'); if (value instanceof Node) cell.append(value); else cell.textContent = value; row.append(cell); });
    body.append(row); return row;
  }
  const pieColors = ['#365c49','#e9b56b','#8d79ab','#679ca6'];
  function renderPie(id, entries, emptyText) {
    const pie = $(`${id}-pie`), legend = $(`${id}-legend`);
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const valid = total > 0 && entries.every(entry => entry.value >= 0);
    let angle = 0;
    const slices = [];
    legend.replaceChildren();
    entries.filter(entry => entry.value !== 0).forEach((entry, index) => {
      const color = pieColors[index % pieColors.length];
      const percent = valid ? entry.value / total * 100 : 0;
      if (valid && entry.value) { slices.push(`${color} ${angle}% ${angle + percent}%`); angle += percent; }
      const item = document.createElement('li');
      const swatch = document.createElement('span'); swatch.className = 'pie-swatch'; swatch.style.background = color; swatch.setAttribute('aria-hidden','true');
      const text = document.createElement('span'); text.textContent = entry.label;
      const amount = document.createElement('strong'); amount.textContent = money(entry.value);
      const share = document.createElement('small'); share.textContent = valid ? `${number(percent)}%` : '—';
      item.append(swatch,text,amount,share); legend.append(item);
    });
    pie.style.background = valid ? `conic-gradient(${slices.join(',')})` : '';
    pie.classList.toggle('pie-empty', !valid);
    pie.textContent = valid ? '' : emptyText;
    pie.setAttribute('aria-label', valid ? entries.map(entry => `${entry.label}: ${money(entry.value)}, ${number(entry.value / total * 100)}%`).join('; ') : emptyText);
  }
  function renderAnnualChart() {
    const included = result.months.filter(month => month.enabled);
    const max = Math.max(1, ...included.flatMap(month => [Math.abs(month.actualNet ?? 0), Math.abs(calibration.months[month.month-1].net ?? 0)]));
    const chart = $('annual-bars'); chart.replaceChildren();
    result.months.forEach(month => {
      const card = document.createElement('div');
      card.className = `annual-month${month.enabled ? '' : ' excluded'}${month.month === state.month ? ' chart-current' : ''}`;
      const heading = document.createElement('div'); heading.className = 'chart-month-heading';
      const link = document.createElement('button'); link.className = 'month-link'; link.textContent = monthNames[month.month-1];
      link.addEventListener('click', () => {selectMonth(month.month); $('month-actualNet').focus({preventScroll:true}); document.querySelector('.comparison').scrollIntoView({behavior:'smooth'});});
      const status = document.createElement('span'); status.textContent = month.enabled ? `${number(month.workedHours)} h lavorate` : 'Escluso dal totale';
      heading.append(link,status); card.append(heading);
      [calibration.months[month.month-1].net, month.actualNet].forEach((value,index) => {
        const row = document.createElement('div'); row.className = 'chart-series';
        const label = document.createElement('span'); label.textContent = index === 0 ? 'Calibrato' : 'Reale';
        const amount = document.createElement('strong'); amount.textContent = value === null ? '—' : money(value);
        if (value === null) amount.setAttribute('aria-label', 'Non disponibile');
        const track = document.createElement('div'); track.className = `bar-track${value === null ? ' missing' : ''}`;
        const bar = document.createElement('span'); bar.className = index === 0 ? 'calibrated-bar' : 'actual-bar';
        bar.style.width = `${value !== null ? Math.min(100, Math.abs(value) / max * 100) : 0}%`;
        if (value !== null && value < 0) bar.classList.add('negative');
        track.setAttribute('aria-hidden','true'); track.append(bar);
        row.append(label,amount,track); card.append(row);
      });
      chart.append(card);
    });
    $('annual-chart-note').textContent = 'Stessa scala per tutti i mesi inclusi. — e traccia tratteggiata: dato non disponibile, non zero. I mesi esclusi non contribuiscono ai totali; importi negativi in rosso e in valore assoluto nelle barre.';
  }
  function renderPayLines(current) {
    const order = ['AA245','X10879','I20329','I20331','I20327','I20330','S16310','S17260','S16320','S16345','S16350','S16335','S17115','S16360'];
    const ranks = new Map(order.map((code,index) => [code,index]));
    const cfg = monthConfig();
    const lines = current.lines.filter(line => line.amount !== 0 || line.overridden);
    [['AA245','Retribuzione ordinaria',state.settings.baseRate],['X10879','Ore riposo turno',state.settings.baseRate],['I16906','Premio mensile',cfg.presenceBonus ?? state.settings.presenceBonus],['MD0251','Turnazione continua 25%',state.settings.baseRate * E.PREMIUM_PERCENTAGES.premiumRate / 100]].forEach(([code,label,rate]) => {
      if (!lines.some(line => line.code === code)) lines.push({code,label,rate,quantity:0,amount:0});
    });
    const rank = line => ranks.get(line.code) ?? (line.code.startsWith('OT') ? 20 : line.code === 'I16906' ? 21 : line.code === 'MD0251' ? 22 : 30);
    lines.sort((a,b) => rank(a) - rank(b));
    $('pay-lines').replaceChildren();
    const labels = {
      S16310:'Mattina feriale 10%', S16320:'Pomeriggio · fascia serale 20%',
      S16345:'Mattina / pomeriggio sabato 45%', S16350:'Mattina / pomeriggio domenica e festivi 50%',
      S16335:'Notte 35%', S16360:'Notte domenica 60%', I16906:'Premio mensile'
    };
    lines.forEach(line => {
      const title = document.createElement('span'); title.textContent = labels[line.code] || line.label;
      const code = document.createElement('small'); code.textContent = `${line.code}${line.overridden ? ' · quantità da cedolino' : ''}`; title.append(code);
      const toggleKey = line.code === 'I16906' ? 'presenceEnabled' : line.code === 'MD0251' ? 'premiumEnabled' : null;
      if (toggleKey) {
        const label = document.createElement('label'); label.className = 'earning-toggle';
        const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = cfg[toggleKey] !== false;
        toggle.dataset.monthToggle = toggleKey; toggle.setAttribute('aria-label',`Includi ${labels[line.code] || line.label}`);
        label.append(toggle,document.createTextNode(toggle.checked ? 'Incluso nel mese' : 'Escluso dal mese')); title.append(label);
      }
      const quantity = line.code === 'RETT' ? number(line.quantity)
        : ['THIRTEENTH','PRODUCTION'].includes(line.code) ? '1 importo'
        : `${number(line.quantity)} ${line.code.startsWith('I203') ? 'gettoni' : line.code === 'I16906' ? 'premio' : 'h'}`;
      addTableRow($('pay-lines'),[title,quantity,new Intl.NumberFormat('it-IT',{maximumFractionDigits:5}).format(line.rate),number(line.amount)]);
    });
  }
  function renderResults() {
    result = E.calculateYear(state);
    const previousState = archive.years[state.year - 1];
    calibration = K.calibrateYear(result,{
      previousYear:previousState ? E.calculateYear(previousState) : null});
    const current = result.months[state.month - 1];
    const projected = calibration.months[state.month - 1];
    $('calibrated-net').textContent = projected.net === null ? '—' : money(projected.net);
    $('calibrated-gross').textContent = projected.gross === null ? '—' : money(projected.gross);
    $('calibration-percent').textContent = projected.adjustmentPercent === null ? '—' : `${number(projected.adjustmentPercent)}%`;
    const calibrationStatuses = {
      excluded:'Mese escluso dal riepilogo annuale: nessuna proiezione calibrata.',
      nonpositive:'Proiezione non applicabile a un lordo o netto non positivo.',
      insufficient:`Campioni precedenti utilizzabili: ${projected.sampleCount}, di cui ${projected.previousYearCount} dall’anno ${state.year-1}; ne servono almeno due. Scartati: ${projected.excludedCount}.`,
      available:`Campioni utilizzati: ${projected.sampleCount}, di cui ${projected.previousYearCount} dall’anno ${state.year-1}; campioni scartati: ${projected.excludedCount}. Lordo statistico, non imponibile verificato.`,
    };
    $('calibration-status').textContent = calibrationStatuses[projected.status];
    $('calibrated-net-caption').textContent = projected.net === null
      ? 'Stima non disponibile · consulta i dettagli della calibrazione'
      : `Correzione ${number(projected.adjustmentPercent)}% · previsione, non cedolino${current.actualNet === null ? '' : ' · errore vs reale ' + errorPercentage(projected.net,current.actualNet)}`;
    $('calibrated-gross-caption').textContent = projected.gross === null
      ? 'Stima non disponibile · consulta il dettaglio stipendio'
      : 'Proiezione statistica, non imponibile verificato';
    $('hours').textContent = `${number(current.paidHours)} h`;
    $('hours-caption').textContent = `${number(current.workedHours)} h lavorate${current.compensatoryHours ? ' · ' + number(current.compensatoryHours) + ' h riposo turno retribuite' : ''}`;
    $('actual').textContent = current.actualNet == null ? 'Da inserire' : money(current.actualNet);
    $('actual-caption').textContent = current.actualNet == null ? 'Nessun pagamento reale per questo mese.' :
      `${projected.net === null ? 'Confronto calibrato non disponibile.' : 'Calibrato − reale: ' + money(E.round2(projected.net-current.actualNet)) + '. Errore calibrato: ' + (current.actualNet === 0 ? 'non definibile con netto reale zero' : errorPercentage(projected.net,current.actualNet)) + '.'} Da regole − reale: ${money(E.round2(current.net-current.actualNet))}. Errore da regole: ${errorPercentage(current.net,current.actualNet)}.`;
    const festiveWarnings = current.warnings.filter(text => text.includes('festività equiparata al weekend'));
    const monthlyWarnings = current.warnings.filter(text => !text.includes('festività equiparata al weekend'));
    if (festiveWarnings.length) monthlyWarnings.push(`Gettone weekend applicato a ${festiveWarnings.length} turni iniziati in un festivo: ipotesi da confermare con l’ufficio paghe.`);
    const warnings = [...new Set([storageWarning, ...result.warnings, ...monthlyWarnings,
      state.settings.regionalRate === 0 && state.settings.municipalRate === 0 ? 'Addizionali non valorizzate: il netto non comprende questi eventuali addebiti.' : '',
      state.settings.taxMode === 'spec' ? 'Profilo specifiche originali: secondo scaglione alternativo, non conforme alle aliquote del modello 2026.' : '',
      state.year !== 2026 ? `Anno ${state.year}: simulazione con aliquote del modello 2026, non aggiornamento normativo automatico.` : '',
      state.annual.thirteenthEnabled && !state.months[keyFor(12)].enabled ? 'Dicembre escluso: la tredicesima non contribuisce al totale annuale.' : '',
      state.annual.productionBonus && !state.months[keyFor(state.annual.productionMonth)].enabled ? 'Il mese del premio di produzione è escluso: il premio non contribuisce al totale annuale.' : ''
    ].filter(Boolean))];
    $('warnings').replaceChildren();
    if (warnings.length) { const ul = document.createElement('ul'); warnings.forEach(text => {const li = document.createElement('li'); li.textContent = text; ul.append(li);}); $('warnings').append(ul); }
    document.querySelectorAll('[data-premium-rate]').forEach(output => {
      output.value = new Intl.NumberFormat('it-IT', {maximumFractionDigits:5}).format(state.settings.baseRate * E.PREMIUM_PERCENTAGES[output.dataset.premiumRate] / 100);
    });
    renderPayLines(current);
    $('table-gross').textContent = number(current.gross);
    renderQuantities(current);
    const taxes = [
      ['Contributi INPS + FSBS', -current.contributions],
      ['IRPEF lorda cumulativa', -current.irpefGross]
    ];
    $('tax-lines').replaceChildren();
    taxes.forEach(([label,value,style]) => {const div = document.createElement('div'); div.className = `tax-row ${style || ''}`; const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = money(value); div.append(dt,dd); $('tax-lines').append(div);});
    $('chart-gross').textContent = money(current.gross);
    renderPie('monthly', [
      {label:'Netto',value:E.round2(current.net - (monthConfig().netAdjust || 0))},
      {label:'Imposte stimate',value:E.round2(current.irpef + current.addizionali)},
      {label:'Contributi',value:current.contributions},
      {label:'Altre trattenute',value:current.otherTax}
    ], 'Grafico non disponibile');
    $('monthly-chart-note').textContent = `Imposte stimate, non versamenti effettivi.${monthConfig().netAdjust ? ' Rettifiche nette escluse dal grafico: ' + money(monthConfig().netAdjust) + '.' : ''}`;
    renderAnnualChart();
    $('annual-title').textContent = `Il tuo ${state.year}`;
    $('annual-actual').textContent = result.totals.actualNet === null ? 'Da inserire' : money(result.totals.actualNet);
    $('annual-comparison').textContent = calibration.totals.actualMonths
      ? `Mesi confrontabili: ${calibration.totals.actualMonths} · calibrato ${money(calibration.totals.matchedNet)} · effettivo sugli stessi mesi ${money(calibration.totals.matchedActualNet)} · differenza ${money(calibration.totals.netDifference)} · errore calibrato ${errorPercentage(calibration.totals.matchedNet,calibration.totals.matchedActualNet)}${calibration.totals.matchedActualNet === 0 ? ' (netto reale zero)' : ''}.`
      : result.totals.actualNet === null ? 'Nessun pagamento effettivo nei mesi inclusi.'
        : 'Pagamenti effettivi disponibili, ma nessuna stima calibrata confrontabile sugli stessi mesi.';
    $('annual-extra-summary').textContent = `Lordo aggiuntivo incluso nell’anno: tredicesima ${money(result.thirteenthGross)} · premio di produzione ${money(result.productionBonus)}.`;
    $('annual-net').textContent = calibration.totals.coveredMonths ? money(calibration.totals.annualNet) : '—';
    const enabledMonths = result.months.filter(month => month.enabled).length;
    $('annual-calibrated-summary').textContent = !enabledMonths ? 'Nessun mese incluso nel totale annuale.'
      : calibration.totals.coveredMonths
        ? `${calibration.totals.coveredMonths === enabledMonths ? 'Totale completo' : 'Totale parziale'}: ${calibration.totals.projectedMonths} mesi calibrati + ${calibration.totals.actualFallbackMonths} pagamenti reali senza stima (${money(calibration.totals.actualFallbackNet)}). Copertura: ${calibration.totals.coveredMonths}/${enabledMonths} mesi inclusi.${calibration.totals.coveredMonths === enabledMonths ? '' : ' Restano esclusi dal totale i mesi senza stima né pagamento reale.'}`
        : 'Totale annuale non disponibile: nessuna stima calibrata o pagamento reale nei mesi inclusi.';
    const taxable = result.ordinaryProgressive;
    const lower = taxable > 28000 ? 28000 : 0;
    const upper = taxable > 28000 ? 50000 : 28000;
    const finalBracket = taxable > 50000;
    const progress = $('progress');
    progress.hidden = finalBracket;
    progress.min = lower;
    progress.max = upper;
    progress.value = Math.min(upper, Math.max(lower, taxable));
    progress.textContent = `${money(Math.max(0, taxable - lower))} su ${money(upper - lower)} nello scaglione`;
    progress.setAttribute('aria-label', `Avanzamento nello scaglione IRPEF da ${money(lower)} a ${money(upper)}`);
    $('progress-label').textContent = finalBracket ? `${money(taxable)} · ultimo scaglione` : `${money(taxable)} / ${money(upper)}`;
    const second = state.settings.taxMode === 'spec' ? state.settings.secondRate : 33;
    $('threshold-text').textContent = finalBracket
      ? 'Ultimo scaglione: 43% solo sulla quota oltre 50.000 €. Nessuna soglia successiva.'
      : lower === 28000
        ? `Secondo scaglione: ${second}% solo sulla quota fra 28.000 e 50.000 €. Mancano ${money(upper - taxable)} alla soglia del 43%.`
        : `Mancano ${money(upper - taxable)} al secondo scaglione (${second}%). Il cambio aliquota riguarda solo la parte eccedente.`;
    $('year-lines').replaceChildren();
    let calibratedProgressive = 0, projectedMonths = 0, missingMonths = 0;
    result.months.forEach(m => {
      const monthCell = document.createElement('div'); monthCell.className = 'annual-month-choice';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = m.enabled;
      checkbox.dataset.includeMonth = m.month; checkbox.setAttribute('aria-label', `Includi ${monthNames[m.month-1]} nel totale annuale`);
      const link = document.createElement('button'); link.className = 'month-link'; link.textContent = monthNames[m.month-1];
      link.addEventListener('click',() => {selectMonth(m.month); $('turni').scrollIntoView({behavior:'smooth'});});
      monthCell.append(checkbox,link);
      const p = calibration.months[m.month-1];
      if (m.enabled) {
        if (p.gross === null) missingMonths++;
        else {calibratedProgressive = E.round2(calibratedProgressive + p.gross); projectedMonths++;}
      }
      const delta = p.net === null || m.actualNet === null ? '—' : number(E.round2(p.net - m.actualNet));
      const progressive = projectedMonths ? number(calibratedProgressive) + (missingMonths ? ' *' : '') : '—';
      addTableRow($('year-lines'),[monthCell,number(m.workedHours),number(m.paidHours),number(m.gross),number(m.contributions),number(m.irpef),m.actualNet === null ? '—' : number(m.actualNet),p.net === null ? '—' : number(p.net),errorPercentage(p.net,m.actualNet),delta,progressive],`${m.month === state.month ? 'year-current ' : ''}${m.enabled ? '' : 'year-excluded'}`);
    });
    $('annual-balance').textContent = result.annualBalance == null ? 'Conguaglio annuale non determinabile: progressivi esterni senza imposte pregresse.' : `Conguaglio IRPEF indicativo dei mesi inclusi: ${money(result.annualBalance)} (${result.annualBalance > 0 ? 'debito' : result.annualBalance < 0 ? 'credito' : 'nessun saldo'}). Non è già incluso nel netto. Non comprende il ricalcolo delle detrazioni personali o i redditi mancanti.`;
    $('references').replaceChildren();
    seed.references.filter(ref => Number(ref.key.slice(0,4)) === state.year).forEach(ref => {
      const calculated = result.months.find(month => month.key === ref.key);
      addTableRow($('references'), [
        monthNames[Number(ref.key.slice(5))-1], number(calculated.paidHours), number(ref.paidHours),
        number(calculated.calendarGross), number(calculated.gross), number(ref.gross),
        number(E.round2(calculated.gross - ref.gross)), number(ref.totalEarnings), number(ref.rounding),
        number(ref.net), number(ref.ordinaryTaxable), number(ref.ordinaryProgressive)
      ]);
    });
  }
  function update() { save(); renderResults(); }
  function selectMonth(month) {
    state.month = Math.max(1,Math.min(12,Number(month)));
    $('month').value = state.month;
    $('previous').disabled = state.month === 1; $('next').disabled = state.month === 12;
    renderCalendar(); renderMonthSettings(); update();
  }
  function renderYearPicker() {
    $('year').replaceChildren();
    Object.keys(archive.years).sort((a,b) => Number(a)-Number(b)).forEach(year => $('year').append(option(year,year)));
    $('year').value = state?.year ?? '';
    $('period-picker').hidden = !state;
    $('delete-year').hidden = !state;
    $('year-content').hidden = !state;
    $('empty-archive').hidden = !!state;
    const years = Object.keys(archive.years).map(Number);
    $('new-year-number').value = Math.min(2100, years.length ? Math.max(...years) + 1 : Math.max(2026, today.getFullYear()));
    $('schedule-anchor').value = `${$('new-year-number').value}-01-01`;
    updateScheduleSource();
  }
  function previousSchedule() {
    const previous = archive.years[Number($('new-year-number').value) - 1];
    return previous ? previous.schedule || C.inferSchedule(previous.baseline || previous.days, previous.year) : null;
  }
  function updateScheduleSource() {
    const schedule = previousSchedule();
    $('schedule-mode').querySelector('[value="previous"]').disabled = !schedule;
    if (!schedule && $('schedule-mode').value === 'previous') $('schedule-mode').value = 'custom';
    const continuing = $('schedule-mode').value === 'previous' && schedule;
    ['schedule-cycle','schedule-order','schedule-anchor'].forEach(id => $(id).disabled = !!continuing);
    $('schedule-source').textContent = schedule
      ? `Ciclo disponibile dall’anno precedente (${schedule.pattern.length} giorni). La continuazione mantiene la fase al cambio d’anno.`
      : 'Nessun ciclo completo e ripetuto riconoscibile nell’anno precedente. Scegli ciclo, ordine e data di inizio: compensativi e assenze non vengono indovinati.';
  }
  $('year').addEventListener('change', event => {
    state = archive.years[event.target.value];
    renderSettings(); selectMonth(state.month);
  });
  $('delete-year').addEventListener('click', () => {
    const year = state.year;
    if (!window.confirm(`Eliminare l’anno ${year} e tutti i suoi turni, parametri e pagamenti reali? L’operazione non è annullabile senza un backup. Gli altri anni saranno conservati.`)) return;
    delete archive.years[year];
    const remaining = Object.keys(archive.years).map(Number).sort((a,b) => a-b);
    const selected = remaining.filter(value => value < year).pop() ?? remaining[0];
    state = selected === undefined ? null : archive.years[selected];
    renderYearPicker();
    if (state) {renderSettings(); selectMonth(state.month);}
    else {result = null; calibration = null; save();}
    announce(`Anno ${year} eliminato.${state ? ` È selezionato l’anno ${state.year}.` : ' Puoi creare un nuovo anno o importare un backup.'}`);
  });
  $('new-year').addEventListener('click', () => {
    renderYearPicker();
    $('schedule-mode').value = previousSchedule() ? 'previous' : 'custom';
    updateScheduleSource();
    $('year-error').hidden = true;
    $('year-management').showModal();
  });
  $('close-year').addEventListener('click', () => $('year-management').close());
  $('year-management').addEventListener('click', event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  $('new-year-number').addEventListener('change', () => {
    $('schedule-anchor').value = `${$('new-year-number').value}-01-01`;
    $('schedule-mode').value = previousSchedule() ? 'previous' : 'custom'; updateScheduleSource();
  });
  $('schedule-mode').addEventListener('change',updateScheduleSource);
  $('year-form').addEventListener('submit', event => {
    event.preventDefault();
    const year = Number($('new-year-number').value);
    $('year-error').hidden = true;
    if (Object.hasOwn(archive.years,year)) {
      $('year-error').textContent = `L’anno ${year} esiste già: selezionalo senza sovrascrivere i dati.`;
      $('year-error').hidden = false; return;
    }
    try {
      const [workDays, restDays] = $('schedule-cycle').value.split(',').map(Number);
      const schedule = $('schedule-mode').value === 'previous' ? previousSchedule() : C.createSchedule({
        workDays, restDays,
        shifts:$('schedule-order').value.split(','), anchor:$('schedule-anchor').value
      });
      if (!schedule) throw new Error('Imposta un ciclo prima di creare l’anno.');
      const days = C.generateYear(year,schedule);
      const previous = archive.years[year-1] || state;
      const created = {version:1,year,month:1,settings:clone(previous?.settings || E.DEFAULT_SETTINGS),annual:annualDefaults(12),
        opening:{ordinaryTaxable:0},days,baseline:clone(days),schedule:clone(schedule),
        months:Object.fromEntries(monthNames.map((_,i) => [keyFor(i+1,year),{...monthDefaults(),enabled:true}]))};
      const errors = validateYear(created);
      if (errors.length) throw new Error(errors.join(' '));
      state = normalized(created); archive.years[year] = state;
      renderYearPicker(); renderSettings(); selectMonth(1); $('year-management').close();
      announce(`Anno ${year} compilato. Turnazione di riferimento bloccata; puoi fare prove e ripristinarla.`);
    } catch (error) {
      $('year-error').textContent = error.message;
      $('year-error').hidden = false;
    }
  });
  $('lock-calendar').addEventListener('click', () => {
    if (state.baseline && !window.confirm('Sostituire la turnazione di riferimento con il calendario attuale dell’intero anno?')) return;
    const baseline = {};
    for (let date = new Date(Date.UTC(state.year,0,1)); date.getUTCFullYear() === state.year; date.setUTCDate(date.getUTCDate()+1)) {
      const iso = date.toISOString().slice(0,10);
      baseline[iso] = clone(state.days[iso] || {shift:'',hours:0});
    }
    state.baseline = baseline;
    const schedule = C.inferSchedule(baseline,state.year);
    if (schedule) state.schedule = schedule; else delete state.schedule;
    renderCalendar(); update(); announce('Riferimento annuale bloccato. Le modifiche successive potranno essere annullate.');
  });
  $('reset-calendar').addEventListener('click', () => {
    if (!state.baseline || !window.confirm('Ripristinare tutti i giorni dell’anno al riferimento bloccato? Le modifiche a turni, ore, festività e straordinari saranno sostituite. Parametri e pagamenti reali restano invariati.')) return;
    state.days = clone(state.baseline);
    renderCalendar(); update(); announce('Calendario annuale ripristinato al riferimento.');
  });
  function onNumericOrSelect(event) {
    const input = event.target;
    if (!input.dataset.scope) return;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const scope = input.dataset.scope, key = input.dataset.key;
    let value = input.value;
    if (input.tagName !== 'SELECT') value = value === '' && input.dataset.nullable === 'true' ? null : Number(value);
    if (['presenceEnabled','premiumEnabled','thirteenthEnabled'].includes(key)) value = value === 'true';
    if (key === 'productionMonth') value = Number(value);
    const target = scope === 'settings' ? state.settings : scope === 'opening' ? state.opening : scope === 'annual' ? state.annual : monthConfig();
    target[key] = value;
    if (scope === 'month' && key === 'premiumHours' && Object.hasOwn(target.quantityOverrides,'MD0251')) target.quantityOverrides.MD0251 = value;
    announce(''); update();
  }
  ['settings-form','month-settings','opening-form','actual-net-form','annual-settings'].forEach(id => {$(id).addEventListener('input',onNumericOrSelect); $(id).addEventListener('submit',event => event.preventDefault());});
  $('quantity-settings').addEventListener('submit',event => event.preventDefault());
  $('quantity-settings').addEventListener('change',event => {
    const input = event.target, code = input.dataset.key;
    if (input.dataset.scope !== 'quantity' || !quantityCodes.includes(code)) return;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    if (input.value === '') delete monthConfig().quantityOverrides[code];
    else monthConfig().quantityOverrides[code] = Number(input.value);
    announce(''); update();
  });
  $('source-quantities').addEventListener('click',() => {
    const source = seed.months[keyFor(state.month)]?.quantityOverrides;
    if (!source) return;
    monthConfig().quantityOverrides = clone(source);
    update();
    announce('Quantità del cedolino applicate al mese corrente. Sostituite solo le quantità mensili; calendario, parametri e netto reale invariati.');
  });
  $('pay-lines').addEventListener('change',event => {
    const key = event.target.dataset.monthToggle;
    if (!['presenceEnabled','premiumEnabled'].includes(key)) return;
    monthConfig()[key] = event.target.checked;
    update();
  });
  $('calendar').addEventListener('input', event => {
    const input = event.target;
    if (!input.dataset.date) return;
    const field = input.dataset.dayField;
    let numeric;
    if (['hours','overtimeHours','overtimePercent'].includes(field)) {
      numeric = readDecimal(input, field === 'hours' ? 8 : field === 'overtimeHours' ? 16 : 1000);
      if (numeric === null) return;
    } else if (!input.checkValidity()) return;
    const iso = input.dataset.date;
    const day = state.days[iso] || {shift:'',hours:0};
    if (field === 'shift') {
      day.shift = input.value; day.hours = defaultHours(day.shift);
      delete day.note;
      const cell = input.closest('.day'); cell.className = cell.className.replace(/shift-\S*/,'shift-' + day.shift);
      cell.querySelector('.day-shift-label').textContent = day.shift ? `${day.shift} · ${E.SHIFT_LABELS[day.shift]}` : '— Da compilare';
      const hours = cell.querySelector('[data-day-field="hours"]'); hours.value = day.hours; hours.setCustomValidity(''); hours.removeAttribute('aria-invalid'); hours.disabled = !day.shift || day.shift === 'R';
      if (day.shift === 'C') hours.title = 'Ore riposo turno retribuite alla paga base.';
      else hours.removeAttribute('title');
    } else if (field === 'hours') day.hours = numeric;
    else if (field === 'overtimeEnabled') {
      const fields = input.closest('.overtime').querySelector('.overtime-fields');
      fields.hidden = !input.checked;
      const hoursInput = fields.querySelector('[data-day-field="overtimeHours"]');
      const percentInput = fields.querySelector('[data-day-field="overtimePercent"]');
      if (input.checked) {
        const hours = readDecimal(hoursInput, 16), percent = readDecimal(percentInput, 1000);
        if (hours === null || percent === null) {
          input.checked = false; (hours === null ? hoursInput : percentInput).reportValidity(); return;
        }
        day.overtimeHours = hours; day.overtimePercent = percent;
      } else {
        day.overtimeHours = 0;
        hoursInput.value = 2; percentInput.value = day.overtimePercent ?? 0;
        hoursInput.setCustomValidity(''); percentInput.setCustomValidity('');
        hoursInput.removeAttribute('aria-invalid'); percentInput.removeAttribute('aria-invalid');
      }
    } else if (field === 'overtimeHours' || field === 'overtimePercent') day[field] = numeric;
    else if (field === 'holiday') { if (input.value === 'auto') delete day.holiday; else day.holiday = input.value === 'true'; }
    const overtime = input.closest('.day').querySelector('.overtime');
    overtime.querySelector('summary').textContent = day.overtimeHours > 0 ? `Straordinario · ${number(day.overtimeHours)} h` : 'Straordinario';
    overtime.querySelector('[data-day-field="overtimeEnabled"]').checked = day.overtimeHours > 0;
    state.days[iso] = day;
    announce(''); update();
  });
  $('year-lines').addEventListener('change', event => {
    const month = Number(event.target.dataset.includeMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    state.months[keyFor(month)].enabled = event.target.checked;
    update();
    $('year-lines').querySelector(`[data-include-month="${month}"]`).focus({preventScroll:true});
  });
  $('month').addEventListener('change',event => selectMonth(event.target.value));
  $('actual-month').addEventListener('change',event => selectMonth(event.target.value));
  $('previous').addEventListener('click',() => selectMonth(state.month-1));
  $('next').addEventListener('click',() => selectMonth(state.month+1));
  $('batch-shift').addEventListener('change',event => {$('batch-hours').value = defaultHours(event.target.value); readDecimal($('batch-hours'), 8);});
  $('batch-form').addEventListener('submit',event => {
    event.preventDefault();
    const from = Number($('batch-from').value), to = Number($('batch-to').value), max = new Date(state.year,state.month,0).getDate();
    if (from > to || from < 1 || to > max) {announce('Intervallo non valido per questo mese.',true);return;}
    const shift = $('batch-shift').value;
    const enteredHours = readDecimal($('batch-hours'), 8);
    if (enteredHours === null) { $('batch-hours').reportValidity(); return; }
    const hours = !shift || shift === 'R' ? 0 : enteredHours;
    for (let day = from; day <= to; day++) {const iso = `${keyFor(state.month)}-${String(day).padStart(2,'0')}`; const previous = state.days[iso] || {}; state.days[iso] = {shift,hours,...(typeof previous.holiday === 'boolean' ? {holiday:previous.holiday} : {}),overtimeHours:previous.overtimeHours ?? 0,overtimePercent:previous.overtimePercent ?? 0};}
    announce(''); renderCalendar(); update();
  });
  $('batch-hours').addEventListener('input',event => readDecimal(event.target, 8));
  function download(name, content, type) {
    const blob = new Blob([content],{type}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  $('backup').addEventListener('click',() => download('meloncino-backup.json',JSON.stringify(archive,null,2),'application/json'));
  $('import').addEventListener('change',async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20000000) throw new Error('Backup troppo grande (massimo 20 MB).');
      const imported = loadArchive(JSON.parse(await file.text()));
      archive = imported; state = archive.years[archive.selectedYear] || null;
      renderYearPicker();
      if (state) {renderSettings(); selectMonth(state.month);} else save();
      announce('Backup importato. L’archivio precedente è stato sostituito.');
    } catch (error) {announce(`Importazione annullata; dati attuali invariati. ${error.message}`,true);}
    event.target.value = '';
  });
  const csv = rows => '\uFEFF' + rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"','""') + '"').join(';')).join('\r\n');
  const decimal = value => value == null ? '' : String(E.round2(value)).replace('.',',');
  $('csv-days').addEventListener('click',() => {
    const rows = [['Data','Turno','Ore','Festivo','Ore straordinario','Maggiorazione straordinario %']];
    const count = new Date(state.year,state.month,0).getDate();
    for (let i = 1; i <= count; i++) {const iso = `${keyFor(state.month)}-${String(i).padStart(2,'0')}`;const d = state.days[iso] || {shift:'',hours:0}; rows.push([iso,d.shift,decimal(d.hours),typeof d.holiday === 'boolean' ? (d.holiday ? 'si' : 'no') : 'auto',decimal(d.overtimeHours ?? 0),decimal(d.overtimePercent ?? 0)]);}
    download(`meloncino-${keyFor(state.month)}-turni.csv`,csv(rows),'text/csv;charset=utf-8');
  });
  $('csv-year').addEventListener('click',() => {
    const rows = [['Mese','Incluso','Ore lavorate','Ore pagate','Lordo','Contributi','IRPEF netta','Netto reale','Netto calibrato','Errore calibrato %','Delta calibrato - reale','Progressivo lordo calibrato','Progressivo calibrato parziale','Lordo calibrato statistico','Imponibile ordinario','Progressivo ordinario','Netto da regole','Addizionali','Altre trattenute','Campioni utilizzati','Correzione %','Campioni anno precedente']];
    let progressive = 0, projectedMonths = 0, missingMonths = 0;
    result.months.forEach(m => {
      const p = calibration.months[m.month-1];
      if (m.enabled) {
        if (p.gross === null) missingMonths++;
        else {progressive = E.round2(progressive + p.gross); projectedMonths++;}
      }
      rows.push([m.key,m.enabled ? 'si' : 'no',decimal(m.workedHours),decimal(m.paidHours),decimal(m.gross),decimal(m.contributions),decimal(m.irpef),decimal(m.actualNet),decimal(p.net),decimal(K.relativeErrorPercent(p.net,m.actualNet)),decimal(p.net === null || m.actualNet === null ? null : E.round2(p.net-m.actualNet)),decimal(projectedMonths ? progressive : null),missingMonths ? 'si' : 'no',decimal(p.gross),decimal(m.ordinaryTaxable),decimal(m.ordinaryProgressive),decimal(m.net),decimal(m.addizionali),decimal(m.otherTax),p.sampleCount,decimal(p.adjustmentPercent),p.previousYearCount]);
    });
    download(`meloncino-${state.year}-riepilogo.csv`,csv(rows),'text/csv;charset=utf-8');
  });
  $('print').addEventListener('click',() => window.print());
  monthNames.forEach((name,index) => {$('month').append(option(index+1,name)); $('actual-month').append(option(index+1,name));});
  shiftOptions($('batch-shift')); $('batch-shift').value = '1';
  renderYearPicker();
  if (state) {renderSettings(); selectMonth(state.month);} else save();
})();
