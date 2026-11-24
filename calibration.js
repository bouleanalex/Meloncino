/* Meloncino: statistical projections only, never actual pay or taxable amounts.
 * calibrateYear(payrollResult, { previousYear }) does not mutate inputs.
 * previousYear is the previous calendar year's uncalibrated payroll result.
 * Each month: { key, gross, net, factor, adjustmentPercent, errorPercent,
 *   sampleCount, previousYearCount, excludedCount, status }; unavailable values are null.
 * Projection totals stay separate; annualNet fills missing projections with included actuals.
 * coveredMonths counts projections plus actualFallbackMonths; matched fields use projections only.
 * Training uses earlier current-year months and the immediately previous year;
 * extraordinary target months can still be projected in full.
 * Where paid hours are known, require source hours between half and twice the
 * target's hours, so a short hire month cannot calibrate a normal full month.
 * With >= 3 samples, retain |actual/net - median| <= max(3*MAD, 0.05).
 * With >= 2 inliers: factor = sum(actualNet) / sum(simulatedNet);
 * projected gross/net = round2(simulated gross/net * factor),
 * adjustmentPercent = round2(100 * (factor - 1)). Diagnostic errorPercent
 * always uses the original simulation: round2(100 * (net - actual) / actual).
 * sampleCount counts inliers; excludedCount counts past manual values rejected
 * for exclusion, invalid/nonpositive amounts, extraordinary pay or outliers.
 * Missing manual values are not rejected samples; an explicit zero is.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeloncinoCalibration = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function positive(value) { return finite(value) && value > 0; }
  function round2(value) {
    var magnitude = Math.abs(value);
    var rounded = Math.round((magnitude + Number.EPSILON * Math.max(1, magnitude)) * 100) / 100;
    return value < 0 && rounded !== 0 ? -rounded : rounded;
  }
  function relativeErrorPercent(estimated, actual) {
    if (!finite(estimated) || !positive(actual)) return null;
    var percent = 100 * round2(estimated - actual) / actual;
    return finite(percent) ? round2(percent) : null;
  }
  function hasExtras(month) {
    return (month.thirteenthGross != null && month.thirteenthGross !== 0) ||
      (month.productionBonus != null && month.productionBonus !== 0);
  }
  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  }

  function trainingFor(months, target) {
    var samples = [], excludedCount = 0;
    months.forEach(function (month) {
      if (!(month.key < target.key) || month.actualNet == null) return;
      if (month.enabled !== true || hasExtras(month) || !positive(month.actualNet) ||
          !positive(month.net) || !positive(month.gross) ||
          (positive(month.paidHours) && positive(target.paidHours) &&
            (month.paidHours < target.paidHours / 2 || month.paidHours > target.paidHours * 2))) {
        excludedCount += 1;
        return;
      }
      var ratio = month.actualNet / month.net;
      if (!positive(ratio)) {
        excludedCount += 1;
        return;
      }
      samples.push({ actual: month.actualNet, net: month.net, ratio: ratio,
        previousYear: month.key.slice(0, 4) !== target.key.slice(0, 4) });
    });
    if (samples.length >= 3) {
      var center = median(samples.map(function (sample) { return sample.ratio; }));
      var mad = median(samples.map(function (sample) { return Math.abs(sample.ratio - center); }));
      var threshold = Math.max(3 * mad, 0.05);
      samples = samples.filter(function (sample) {
        if (Math.abs(sample.ratio - center) <= threshold) return true;
        excludedCount += 1;
        return false;
      });
    }
    return { samples: samples, excludedCount: excludedCount };
  }

  function calibrateYear(result, options) {
    var totals = { gross: 0, net: 0, projectedMonths: 0,
      matchedNet: 0, matchedActualNet: null, actualMonths: 0, netDifference: null,
      annualNet: 0, actualFallbackNet: 0, actualFallbackMonths: 0, coveredMonths: 0 };
    var year = result.months.length ? Number(result.months[0].key.slice(0, 4)) : 0;
    var previousMonths = options && options.previousYear ? options.previousYear.months.filter(function (month) {
      return Number(month.key.slice(0, 4)) === year - 1;
    }) : [];
    var history = previousMonths.concat(result.months);
    var months = result.months.map(function (month) {
      var training = trainingFor(history, month);
      var projection = {
        key: month.key, gross: null, net: null, factor: null,
        adjustmentPercent: null,
        errorPercent: relativeErrorPercent(month.net, month.actualNet),
        sampleCount: training.samples.length,
        previousYearCount: training.samples.filter(function (sample) { return sample.previousYear; }).length,
        excludedCount: training.excludedCount,
        status: 'insufficient'
      };
      if (month.enabled !== true) projection.status = 'excluded';
      else if (!positive(month.gross) || !positive(month.net)) projection.status = 'nonpositive';
      else if (training.samples.length >= 2) {
        var actual = 0, simulated = 0;
        training.samples.forEach(function (sample) {
          actual += sample.actual;
          simulated += sample.net;
        });
        var factor = actual / simulated;
        var gross = round2(month.gross * factor);
        var net = round2(month.net * factor);
        var adjustment = round2(100 * (factor - 1));
        if (!positive(factor) || !finite(gross) || !finite(net) || !finite(adjustment)) {
          projection.status = 'nonpositive';
        } else {
          projection.gross = gross;
          projection.net = net;
          projection.factor = factor;
          projection.adjustmentPercent = adjustment;
          projection.status = 'available';
          totals.gross += gross;
          totals.net += net;
          totals.projectedMonths += 1;
          if (month.actualNet !== null && finite(month.actualNet)) {
            totals.matchedNet += net;
            totals.matchedActualNet = (totals.matchedActualNet || 0) + month.actualNet;
            totals.actualMonths += 1;
          }
        }
      }
      if (projection.net !== null) totals.coveredMonths += 1;
      else if (month.enabled === true && finite(month.actualNet) && month.actualNet >= 0) {
        totals.actualFallbackNet += month.actualNet;
        totals.actualFallbackMonths += 1;
        totals.coveredMonths += 1;
      }
      return projection;
    });
    totals.gross = round2(totals.gross);
    totals.net = round2(totals.net);
    totals.actualFallbackNet = round2(totals.actualFallbackNet);
    totals.annualNet = round2(totals.net + totals.actualFallbackNet);
    totals.matchedNet = round2(totals.matchedNet);
    if (totals.actualMonths) {
      totals.matchedActualNet = round2(totals.matchedActualNet);
      totals.netDifference = round2(totals.matchedNet - totals.matchedActualNet);
    }
    return { months: months, totals: totals };
  }

  return Object.freeze({ calibrateYear: calibrateYear, relativeErrorPercent: relativeErrorPercent });
}));
