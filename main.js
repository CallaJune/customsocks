const sockCalculator = window.calculateSock;

const UNIT_IN = "in";
const UNIT_CM = "cm";
const FILE_PROTOCOL = "file:";
const TEMPLATE_PATH = "./template.md";
const TEMPLATE_EMBEDDED_ID = "templateMarkdown";
const FORM_ERROR_UNEXPECTED = "Unexpected error while calculating.";
const PDF_ERROR_LIBRARY = "PDF library failed to load. Check internet connection or CDN access.";
const PDF_ERROR_GENERIC = "Could not generate PDF.";
const UNIT_GAUGE_LABELS = {
  [UNIT_IN]: "4 in",
  [UNIT_CM]: "10 cm"
};
const PDF_FILENAME_PREFIX = "Calla_CustomSockCalculator";
const PDF_OPTIONS = {
  margin: [0.15, 0.25, 0.2, 0.25],
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
  jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
  pagebreak: { mode: ["css", "legacy"] }
};

const form = document.getElementById("sockForm");
const formError = document.getElementById("formError");
const patternOutput = document.getElementById("patternOutput");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const separateSidesToggle = document.getElementById("separateSides");
const measurementUnitSelect = document.getElementById("measurementUnit");
const leftUnitLabel = document.getElementById("leftUnitLabel");
const rightUnitLabel = document.getElementById("rightUnitLabel");
const stitchGaugeScaleLabel = document.getElementById("stitchGaugeScaleLabel");
const rowGaugeScaleLabel = document.getElementById("rowGaugeScaleLabel");
const embeddedTemplateElement = document.getElementById(TEMPLATE_EMBEDDED_ID);

let templateText = "";
let latestPattern = null;
let latestFilledText = "";

const SIDE_FIELD_PAIRS = [
  ["footCircumferenceL", "footCircumferenceR"],
  ["gussetCircumferenceL", "gussetCircumferenceR"],
  ["footLengthL", "footLengthR"]
];

function setError(message) {
  formError.textContent = message;
}

function clearError() {
  setError("");
}

function isFileProtocol() {
  return window.location.protocol === FILE_PROTOCOL;
}

function getMeasurementUnit() {
  return measurementUnitSelect.value === UNIT_CM ? UNIT_CM : UNIT_IN;
}

function getEmbeddedTemplate() {
  return String(embeddedTemplateElement?.textContent ?? "").trim();
}

async function fetchTemplateMarkdown() {
  const response = await fetch(TEMPLATE_PATH, { cache: "no-store" });
  if (!response.ok) {
    return "";
  }
  return (await response.text()).trim();
}

async function loadTemplate() {
  if (!isFileProtocol()) {
    try {
      const fetchedTemplate = await fetchTemplateMarkdown();
      if (fetchedTemplate) {
        templateText = fetchedTemplate;
        return;
      }
    } catch {
      // Fall through to embedded template fallback.
    }
  }

  const embeddedTemplate = getEmbeddedTemplate();
  if (embeddedTemplate) {
    templateText = embeddedTemplate;
    return;
  }

  throw new Error("Could not load template markdown from template.md or embedded fallback.");
}

function serializeForm(formEl) {
  const values = Object.fromEntries(new FormData(formEl).entries());

  if (!separateSidesToggle.checked) {
    for (const [leftKey, rightKey] of SIDE_FIELD_PAIRS) {
      values[rightKey] = values[leftKey];
    }
  }

  values.gauge_st_per_unit = String(values.stitchGauge ?? "").trim();
  values.gauge_row_per_unit = String(values.rowGauge ?? "").trim();

  return values;
}

function updateUnitLabels() {
  const unit = getMeasurementUnit();
  const gaugeLabel = UNIT_GAUGE_LABELS[unit];

  leftUnitLabel.textContent = unit;
  rightUnitLabel.textContent = unit;
  stitchGaugeScaleLabel.textContent = gaugeLabel;
  rowGaugeScaleLabel.textContent = gaugeLabel;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function renderMarkdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraphParts = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraphParts.length === 0) {
      return;
    }
    html.push(`<p>${renderInlineMarkdown(paragraphParts.join(" "))}</p>`);
    paragraphParts = [];
  };

  const closeList = () => {
    if (!inList) {
      return;
    }
    html.push("</ul>");
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
      continue;
    }

    paragraphParts.push(line);
  }

  flushParagraph();
  closeList();
  return html.join("\n");
}

function collapseToSingleSide(text) {
  return text
    .replace(/([^\s]+)\s*\(L\)\s*\/\s*([^\s]+)\s*\(R\)/g, "$1")
    .replace(/([^\s]+)\s*\(L\)\s+([^\s]+)\s*\(R\)/g, "$1")
    .replace(/left\s*\(L\)\s*and\s*right\s*\(R\)\s*values\s*in\s*case\s*they\s*differ\.?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function updateSideModeUI() {
  const separate = separateSidesToggle.checked;
  form.classList.toggle("single-side", !separate);

  for (const [leftKey, rightKey] of SIDE_FIELD_PAIRS) {
    const leftInput = document.getElementById(leftKey);
    const rightInput = document.getElementById(rightKey);
    rightInput.disabled = !separate;
    rightInput.required = separate;

    if (!separate) {
      rightInput.value = leftInput.value;
    }
  }
}

function fillTemplate(template, values) {
  let output = template;
  const tokens = [...new Set(template.match(/\{[^{}]+\}/g) ?? [])];

  for (const token of tokens) {
    const key = token.slice(1, -1);
    const value = Object.hasOwn(values, key) ? String(values[key]) : token;
    output = output.replaceAll(token, value);
  }

  return output;
}

function applyTemplateGaugeLanguage(text, unit) {
  return text.replace(/per\s+inch/gi, unit === UNIT_CM ? "per 10 centimeters" : 'per 4"');
}

function buildTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function buildPdfFilename() {
  return `${PDF_FILENAME_PREFIX}_${buildTimestamp()}.pdf`;
}

function buildPdfExportMarkup(markdown) {
  const rendered = renderMarkdownToHtml(markdown);

  return `
    <style>
      .pdf-doc,
      .pdf-doc * {
        box-sizing: border-box;
      }

      .pdf-doc {
        width: 7.2in;
        margin: 0;
        padding: 0;
        color: #111;
        font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
        font-size: 10.5pt;
        line-height: 1.18;
      }

      .pdf-doc h1,
      .pdf-doc h2,
      .pdf-doc h3 {
        font-family: Georgia, "Times New Roman", serif;
        page-break-after: avoid;
        break-after: avoid;
      }

      .pdf-doc h1 {
        margin: 0 0 7pt;
        font-size: 17pt;
        line-height: 1.08;
      }

      .pdf-doc h2 {
        margin: 10pt 0 4pt;
        font-size: 11.5pt;
        line-height: 1.1;
      }

      .pdf-doc h3 {
        margin: 8pt 0 3pt;
        font-size: 10.75pt;
        line-height: 1.1;
      }

      .pdf-doc p {
        margin: 0 0 5pt;
      }

      .pdf-doc ul {
        margin: 0 0 6pt 15pt;
        padding: 0;
      }

      .pdf-doc li {
        margin: 0 0 2pt;
      }

      .pdf-doc p,
      .pdf-doc ul,
      .pdf-doc li {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .pdf-doc code {
        background: #f5f2e8;
        border: 1px solid #e6dbbb;
        border-radius: 3px;
        padding: 0 3px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.92em;
      }
    </style>
    <article class="pdf-doc">${rendered}</article>
  `;
}

function buildRenderedPattern(pattern) {
  const replaced = fillTemplate(templateText, pattern);
  const unitAware = applyTemplateGaugeLanguage(replaced, pattern.measurement_unit);
  return separateSidesToggle.checked ? unitAware : collapseToSingleSide(unitAware);
}

function updatePatternPreview(pattern) {
  latestFilledText = buildRenderedPattern(pattern);
  patternOutput.innerHTML = renderMarkdownToHtml(latestFilledText);
}

function recalculate() {
  clearError();
  latestPattern = sockCalculator(serializeForm(form));
  updatePatternPreview(latestPattern);
}

function tryRecalculateSilently() {
  if (!latestPattern) {
    return;
  }

  try {
    recalculate();
  } catch {
    // Ignore transient validation issues while user is toggling options.
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    recalculate();
  } catch (error) {
    setError(error instanceof Error ? error.message : FORM_ERROR_UNEXPECTED);
  }
});

for (const [leftKey, rightKey] of SIDE_FIELD_PAIRS) {
  const leftInput = document.getElementById(leftKey);
  const rightInput = document.getElementById(rightKey);

  leftInput.addEventListener("input", () => {
    if (!separateSidesToggle.checked) {
      rightInput.value = leftInput.value;
    }
  });
}

separateSidesToggle.addEventListener("change", () => {
  updateSideModeUI();
  tryRecalculateSilently();
});

measurementUnitSelect.addEventListener("change", () => {
  updateUnitLabels();
  tryRecalculateSilently();
});

downloadPdfBtn.addEventListener("click", async () => {
  try {
    if (!latestPattern) {
      recalculate();
    }

    if (typeof window.html2pdf !== "function") {
      throw new Error(PDF_ERROR_LIBRARY);
    }

    const options = { ...PDF_OPTIONS, filename: buildPdfFilename() };
    await window.html2pdf().set(options).from(buildPdfExportMarkup(latestFilledText)).save();
  } catch (error) {
    setError(error instanceof Error ? error.message : PDF_ERROR_GENERIC);
  }
});

(async function init() {
  if (typeof sockCalculator !== "function") {
    setError("Calculator script failed to load. Make sure logic.js is next to index.html.");
    return;
  }

  try {
    updateUnitLabels();
    updateSideModeUI();
    await loadTemplate();
  } catch (error) {
    setError(
      error instanceof Error
        ? `${error.message}. Keep template.md next to index.html, or include #templateMarkdown in index.html for file:// use.`
        : "Could not load template."
    );
  }
})();
