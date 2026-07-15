const API_BASE = 'http://localhost:3000';

let currentCandidates = [];
let centres = [];
let tradesByCentre = {};
let mergedTrades = {};
let allocationResults = [];

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
const downloadAllocBtn = document.getElementById('downloadAllocBtn');
const downloadRegBtn = document.getElementById('downloadRegBtn');

function updateSelectionSummary() {
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);
  const hasMerges = Object.keys(mergedTrades).length > 0;
  
  let html = '';
  if (centre) {
    html += `<strong>Selected Centre:</strong> ${centre}`;
    if (selectedTrades.length > 0) {
      html += ` | <strong>Trades visible:</strong> ${selectedTrades.length}`;
    }
    if (hasMerges) {
      html += ` | <strong>Merged groups:</strong> ${Object.keys(mergedTrades).map(c => `${c}: ${mergedTrades[c].join(' + ')}`).join(', ')}`;
    }
    html += ` | <strong>Note:</strong> Allocation will run for all trades in the selected centre(s). Use merge to combine trades.`;
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
});

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
      }),
    });

    const data = await response.json();

    if (response.ok) {
      allocationResults = data.results;
      displayResults(data.results, data.recommendations);
      if (data.results.length === 0) {
        recommendationsDiv.innerHTML = '<p class="error">Allocation completed but returned no results. Check your data and dates.</p>';
      }
    } else {
      recommendationsDiv.innerHTML = `<p class="error">Allocation failed: ${data.error}</p>`;
    }
  } catch (error) {
    recommendationsDiv.innerHTML = `<p class="error">Allocation failed: ${error.message}</p>`;
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
