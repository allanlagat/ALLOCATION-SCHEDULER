const API_BASE = 'http://localhost:3000';

let currentCandidates = [];
let centres = [];
let tradesByCentre = {};
let mergedTrades = {};
let allocationResults = [];
let selectedOptionIndex = null;

const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const uploadStatus = document.getElementById('uploadStatus');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const centreSelect = document.getElementById('centreSelect');
const tradeSelect = document.getElementById('tradeSelect');
const mergeBtn = document.getElementById('mergeBtn');
const resetMergeBtn = document.getElementById('resetMergeBtn');
const mergeStatus = document.getElementById('mergeStatus');
const allocateBtn = document.getElementById('allocateBtn');
const recommendationsDiv = document.getElementById('recommendations');
const selectionSummary = document.getElementById('selectionSummary');
const resultsSection = document.getElementById('resultsSection');
const resultsTableBody = document.querySelector('#resultsTable tbody');
const optionsTableBody = document.querySelector('#optionsTable tbody');
const optionsSection = document.getElementById('optionsSection');
const downloadAllocBtn = document.getElementById('downloadAllocBtn');
const downloadRegBtn = document.getElementById('downloadRegBtn');
const optionsSection = document.getElementById('optionsSection');
const optionsTableBody = document.querySelector('#optionsTable tbody');

function updateSelectionSummary() {
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);
  const hasMerges = Object.keys(mergedTrades).length > 0;
  
  let html = '';
  if (centre) {
    html += `<strong>Selected Centre:</strong> ${centre}`;
    if (selectedTrades.length > 0) {
      html += ` | <strong>Selected Trades:</strong> ${selectedTrades.join(', ')}`;
    } else {
      html += ` | <strong>Selected Trades:</strong> All trades`;
    }
    if (hasMerges) {
      html += ` | <strong>Merged groups:</strong> ${Object.keys(mergedTrades).map(c => `${c}: ${mergedTrades[c].join(' + ')}`).join(', ')}`;
    }
  } else {
    html = `<strong>No centre selected.</strong> Please select a centre to see available trades.`;
  }
  selectionSummary.innerHTML = html;
}

centreSelect.addEventListener('change', () => {
  const centre = centreSelect.value;
  tradeSelect.innerHTML = '<option value="">-- Select Trades --</option>';
  if (centre && tradesByCentre[centre]) {
    tradesByCentre[centre].forEach(trade => {
      const option = document.createElement('option');
      option.value = trade;
      option.textContent = trade;
      tradeSelect.appendChild(option);
    });
  }
  updateSelectionSummary();
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  fileName.textContent = file.name;
  uploadStatus.textContent = 'Uploading...';
  uploadStatus.className = 'status';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      uploadStatus.textContent = data.message;
      uploadStatus.className = 'status success';
      currentCandidates = [];
      centres = data.centres || [];
      tradesByCentre = data.tradesByCentre || {};
      mergedTrades = {};
      updateCentreSelect();
      updateSelectionSummary();
    } else {
      uploadStatus.textContent = data.error;
      uploadStatus.className = 'status error';
    }
  } catch (error) {
    uploadStatus.textContent = 'Upload failed: ' + error.message;
    uploadStatus.className = 'status error';
  }
});

function updateCentreSelect() {
  centreSelect.innerHTML = '<option value="">-- Select Centre --</option>';
  centres.forEach(centre => {
    const option = document.createElement('option');
    option.value = centre;
    option.textContent = centre;
    centreSelect.appendChild(option);
  });
}

async function loadCentres() {
  try {
    const response = await fetch(`${API_BASE}/centres`);
    const data = await response.json();
    centres = data.centres;
    tradesByCentre = data.tradesByCentre;
    updateCentreSelect();
  } catch (error) {
    console.error('Failed to load centres:', error);
  }
}

mergeBtn.addEventListener('click', () => {
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);

  if (!centre) {
    mergeStatus.textContent = 'Please select a centre';
    mergeStatus.className = 'status error';
    return;
  }

  if (selectedTrades.length < 2) {
    mergeStatus.textContent = 'Please select at least 2 trades to merge';
    mergeStatus.className = 'status error';
    return;
  }

  mergedTrades[centre] = selectedTrades;
  mergeStatus.textContent = `Merged trades for ${centre}: ${selectedTrades.join(', ')}`;
  mergeStatus.className = 'status success';
  updateSelectionSummary();
});

resetMergeBtn.addEventListener('click', () => {
  const centre = centreSelect.value;
  if (centre && mergedTrades[centre]) {
    delete mergedTrades[centre];
    mergeStatus.textContent = `Merges reset for ${centre}`;
    mergeStatus.className = 'status success';
    updateSelectionSummary();
  }
});

allocateBtn.addEventListener('click', async () => {
  const examStart = startDateInput.value;
  const examEnd = endDateInput.value;
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);

  if (!centre) {
    recommendationsDiv.innerHTML = '<p class="error">Please select a centre before running allocation.</p>';
    recommendationsDiv.style.display = 'block';
    return;
  }

  if (!examStart || !examEnd) {
    recommendationsDiv.innerHTML = '<p class="error">Please select examination start and end dates.</p>';
    recommendationsDiv.style.display = 'block';
    return;
  }

  recommendationsDiv.innerHTML = 'Running allocation... This may take a moment for large datasets.';
  recommendationsDiv.style.display = 'block';
  allocateBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examStart,
        examEnd,
        mergedTrades,
        selectedTrades: selectedTrades.length > 0 ? selectedTrades : null
      }),
    });

    const data = await response.json();

    if (response.ok) {
      if (data.groupOptions && data.groupOptions.length > 0) {
        displayOptions(data.groupOptions);
        if (data.recommendations && data.recommendations.length > 0) {
          recommendationsDiv.innerHTML = data.recommendations.map(r => `<p>${r}</p>`).join('');
          recommendationsDiv.style.display = 'block';
        } else {
          recommendationsDiv.innerHTML = '';
          recommendationsDiv.style.display = 'none';
        }
      } else {
        recommendationsDiv.innerHTML = '<p class="error">Allocation completed but returned no results. Check your data and dates.</p>';
        recommendationsDiv.style.display = 'block';
        resultsSection.style.display = 'none';
        optionsSection.style.display = 'none';
      }
    } else {
      recommendationsDiv.innerHTML = `<p class="error">Allocation failed: ${data.error}</p>`;
      recommendationsDiv.style.display = 'block';
    }
  } catch (error) {
    recommendationsDiv.innerHTML = `<p class="error">Allocation failed: ${error.message}</p>`;
    recommendationsDiv.style.display = 'block';
  } finally {
    allocateBtn.disabled = false;
  }
});

function displayResults(results, recommendations) {
  resultsSection.style.display = 'block';
  resultsTableBody.innerHTML = '';

  if (recommendations && recommendations.length > 0) {
    recommendationsDiv.innerHTML = recommendations.map(r => `<p>${r}</p>`).join('');
  } else {
    recommendationsDiv.innerHTML = '';
  }

  for (const r of results) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${r.centre}</td>
      <td>${r.tradeOrMerged}</td>
      <td>${r.grade}</td>
      <td>${r.numCandidates}</td>
      <td>${r.numAssessors}</td>
      <td>${r.startDate}</td>
      <td>${r.endDate}</td>
      <td>${r.numDays}</td>
    `;
    resultsTableBody.appendChild(row);
  }
}

function displayOptions(groupOptions) {
  optionsSection.style.display = 'block';
  optionsTableBody.innerHTML = '';

  window.currentGroupOptions = groupOptions;

  for (let i = 0; i < groupOptions.length; i++) {
    const group = groupOptions[i];
    const preferred = group.preferred;
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${group.centre}</td>
      <td>${group.tradeOrMerged}</td>
      <td>${group.totalCandidates}</td>
      <td>${group.totalCandidateDays}</td>
      <td>${group.options.length > 0 ? group.options.map((opt, idx) => 
        `<button class="option-btn ${opt === preferred ? 'preferred' : ''}" 
                onclick="selectOption(${i}, ${idx})"
                title="${opt === preferred ? 'Recommended: fits within available period' : (opt.fits ? 'Fits within period' : 'Exceeds available period')}">
          Option ${idx + 1}<br>
          <strong>${opt.assessors}</strong> assessor(s)<br>
          <strong>${opt.days}</strong> day(s)<br>
          ${opt.fits ? 'Fits' : 'Exceeds'}
        </button>`
      ).join(' ') : 'N/A'}</td>
      <td>${preferred.fits ? 'Yes' : 'No'}</td>
    `;
    optionsTableBody.appendChild(row);
  }
}

function selectOption(groupIndex, optionIndex) {
  const group = window.currentGroupOptions[groupIndex];
  const option = group.options[optionIndex];
  
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + option.days - 1);
  
  const results = group.gradeResults.map(r => ({
    ...r,
    numAssessors: option.assessors,
    numDays: option.days,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }));

  allocationResults = results;
  displayResults(results, []);
  optionsSection.style.display = 'none';
  resultsSection.style.display = 'block';
}

downloadAllocBtn.addEventListener('click', () => {
  if (!allocationResults.length) return;
  const url = `${API_BASE}/download/allocation?results=${encodeURIComponent(JSON.stringify(allocationResults))}`;
  window.open(url, '_blank');
});

downloadRegBtn.addEventListener('click', () => {
  if (!allocationResults.length) return;
  const url = `${API_BASE}/download/registers?results=${encodeURIComponent(JSON.stringify(allocationResults))}`;
  window.open(url, '_blank');
});
