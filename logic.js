const CM_PER_INCH = 2.54;
const INCH_GAUGE_SPAN = 4;
const CM_GAUGE_SPAN = 10;
const ROUNDING_EPSILON = 1e-9;
const FIT_EASE_FACTOR = 0.9;
const STITCH_MULTIPLE = 4;
const HEEL_FLAP_ROW_MULTIPLE = 2;
const HEEL_TURN_OFFSET = 3;
const TOE_DECREASE_RATIO = 0.4;
const TOE_DECREASE1_ROW_DIVISOR = 2;
const TOE_DECREASE2_ROW_DIVISOR = 4;
const NEEDLE_UNIT_METRIC = "metric";
const NEEDLE_UNIT_US = "us";

function floorToMultiple(value, multiple) {
  return Math.floor((value + ROUNDING_EPSILON) / multiple) * multiple;
}

function ceilingToMultiple(value, multiple) {
  return Math.ceil((value - ROUNDING_EPSILON) / multiple) * multiple;
}

function toNumber(input, label) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a number greater than 0.`);
  }
  return n;
}

function normalizeUnit(unitRaw) {
  const unit = String(unitRaw ?? "in").trim().toLowerCase();
  if (unit !== "in" && unit !== "cm") {
    throw new Error("Unit must be either inches or centimeters.");
  }
  return unit;
}

function normalizeNeedleUnit(unitRaw) {
  const unit = String(unitRaw ?? NEEDLE_UNIT_US).trim().toLowerCase();
  return unit === NEEDLE_UNIT_METRIC ? NEEDLE_UNIT_METRIC : NEEDLE_UNIT_US;
}

function formatNeedleSizeForTemplate(needleSize, needleUnit) {
  return needleUnit === NEEDLE_UNIT_US ? `${needleSize} US` : `${needleSize}mm`;
}

function toInches(value, measurementUnit) {
  return measurementUnit === "cm" ? value / CM_PER_INCH : value;
}

function toGaugePerInch(value, measurementUnit) {
  return measurementUnit === "cm"
    ? value / (CM_GAUGE_SPAN / CM_PER_INCH)
    : value / INCH_GAUGE_SPAN;
}

function resolveGaugeDisplayValue(preferredValue, fallbackValue) {
  const text = String(preferredValue ?? "").trim();
  return text || String(fallbackValue);
}

function calculateSidePattern(footCircIn, gussetCircIn, footLengthIn, stitchGaugePerIn, rowGaugePerIn) {
  // Spreadsheet intermediates used by rows 19-24 outputs.
  const d5 = stitchGaugePerIn * footCircIn * FIT_EASE_FACTOR;
  const d8 = rowGaugePerIn * footLengthIn * FIT_EASE_FACTOR;

  // Row 19 formulas.
  const cast_on_s = floorToMultiple(d5, STITCH_MULTIPLE);

  // Row 20 formulas.
  const heel_flap_s = cast_on_s / 2;
  const heel_turn_center_s = heel_flap_s / 2;

  // C20/E20: CEILING(heel_flap_stitches * (gusset_circumference/foot_length), 2)
  const gussetToFootRatio = gussetCircIn / footLengthIn;
  const heel_flap_r = ceilingToMultiple(heel_flap_s * gussetToFootRatio, HEEL_FLAP_ROW_MULTIPLE);

  // Row 21 formulas.
  const after_heel_turn_s = Math.round(heel_flap_s / 2 + HEEL_TURN_OFFSET);
  const after_heel_turn_r = heel_flap_s - after_heel_turn_s;

  // Row 22/23/24 formulas.
  const foot_s = floorToMultiple(d5, STITCH_MULTIPLE);
  const toe_decrease1_s = foot_s - floorToMultiple(foot_s * TOE_DECREASE_RATIO, STITCH_MULTIPLE);
  const toe_decrease1_r = (foot_s - toe_decrease1_s) / TOE_DECREASE1_ROW_DIVISOR;
  const foot_r = floorToMultiple(d8 - after_heel_turn_r - toe_decrease1_r, 1);
  const toe_decrease2_s = toe_decrease1_s - floorToMultiple(foot_s * TOE_DECREASE_RATIO, STITCH_MULTIPLE);
  const toe_decrease2_r = (toe_decrease1_s - toe_decrease2_s) / TOE_DECREASE2_ROW_DIVISOR;

  return {
    cast_on_s,
    heel_flap_s,
    heel_turn_center_s,
    heel_flap_r,
    after_heel_turn_s,
    after_heel_turn_r,
    foot_s,
    foot_r,
    toe_decrease1_s,
    toe_decrease1_r,
    toe_decrease2_s,
    toe_decrease2_r
  };
}

function calculateSock(inputs) {
  const measurementUnit = normalizeUnit(inputs.measurementUnit);

  const footCircL = toNumber(inputs.footCircumferenceL, "Left foot circumference");
  const footCircR = toNumber(inputs.footCircumferenceR, "Right foot circumference");
  const gussetCircL = toNumber(inputs.gussetCircumferenceL, "Left gusset circumference");
  const gussetCircR = toNumber(inputs.gussetCircumferenceR, "Right gusset circumference");
  const footLengthL = toNumber(inputs.footLengthL, "Left foot length");
  const footLengthR = toNumber(inputs.footLengthR, "Right foot length");
  const stitchGaugeInput = toNumber(inputs.stitchGauge, "Stitch gauge");
  const rowGaugeInput = toNumber(inputs.rowGauge, "Row gauge");

  const footCircLIn = toInches(footCircL, measurementUnit);
  const footCircRIn = toInches(footCircR, measurementUnit);
  const gussetCircLIn = toInches(gussetCircL, measurementUnit);
  const gussetCircRIn = toInches(gussetCircR, measurementUnit);
  const footLengthLIn = toInches(footLengthL, measurementUnit);
  const footLengthRIn = toInches(footLengthR, measurementUnit);
  const stitchGaugePerIn = toGaugePerInch(stitchGaugeInput, measurementUnit);
  const rowGaugePerIn = toGaugePerInch(rowGaugeInput, measurementUnit);
  const gaugeStPerUnit = resolveGaugeDisplayValue(inputs.gauge_st_per_unit ?? inputs.stitchGauge, stitchGaugeInput);
  const gaugeRowPerUnit = resolveGaugeDisplayValue(inputs.gauge_row_per_unit ?? inputs.rowGauge, rowGaugeInput);

  const needleSize = String(inputs.needleSize ?? "").trim();
  if (!needleSize) {
    throw new Error("Needle size is required.");
  }
  const needleSizeUnit = normalizeNeedleUnit(inputs.needleSizeUnit);
  const formattedNeedleSize = formatNeedleSizeForTemplate(needleSize, needleSizeUnit);

  const left = calculateSidePattern(footCircLIn, gussetCircLIn, footLengthLIn, stitchGaugePerIn, rowGaugePerIn);
  const right = calculateSidePattern(footCircRIn, gussetCircRIn, footLengthRIn, stitchGaugePerIn, rowGaugePerIn);

  return {
    measurement_unit: measurementUnit,
    needle_size: formattedNeedleSize,
    gauge_st_per_unit: gaugeStPerUnit,
    gauge_row_per_unit: gaugeRowPerUnit,
    cast_on_s_l: left.cast_on_s,
    cast_on_s_r: right.cast_on_s,
    heel_flap_s_l: left.heel_flap_s,
    heel_flap_s_r: right.heel_flap_s,
    heel_turn_center_s_l: left.heel_turn_center_s,
    heel_turn_center_s_r: right.heel_turn_center_s,
    heel_flap_r_l: left.heel_flap_r,
    heel_flap_r_r: right.heel_flap_r,
    after_heel_turn_s_l: left.after_heel_turn_s,
    after_heel_turn_s_r: right.after_heel_turn_s,
    after_heel_turn_r_l: left.after_heel_turn_r,
    after_heel_turn_r_r: right.after_heel_turn_r,
    foot_s_l: left.foot_s,
    foot_s_r: right.foot_s,
    foot_r_l: left.foot_r,
    foot_r_r: right.foot_r,
    toe_decrease1_s_l: left.toe_decrease1_s,
    toe_decrease1_s_r: right.toe_decrease1_s,
    toe_decrease1_r_l: left.toe_decrease1_r,
    toe_decrease1_r_r: right.toe_decrease1_r,
    toe_decrease2_s_l: left.toe_decrease2_s,
    toe_decrease2_s_r: right.toe_decrease2_s,
    toe_decrease2_r_l: left.toe_decrease2_r,
    toe_decrease2_r_r: right.toe_decrease2_r
  };
}

window.calculateSock = calculateSock;
