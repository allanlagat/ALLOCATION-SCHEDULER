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
const examDaysInput = document.getElementById('examDays');
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
const assignmentsSection = document.getElementById('assignmentsSection');
const assignmentsTableBody = document.querySelector('#assignmentsTable tbody');
const downloadAllocBtn = document.getElementById('downloadAllocBtn');
const downloadRegBtn = document.getElementById('downloadRegBtn');
const downloadAssignmentsBtn = document.getElementById('downloadAssignmentsBtn');

window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.error);
  console.error('Error message:', event.message);
  console.error('Error filename:', event.filename);
  console.error('Error lineno:', event.lineno);
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});

function updateSelectionSummary() {
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);
  const examDays = examDaysInput.value;
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
    if (examDays) {
      html += ` | <strong>Exam Days:</strong> ${examDays}`;
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
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
  uploadStatus.textContent = `Uploading ${file.name} (${fileSizeMB}MB)... This may take a moment.`;
  uploadStatus.className = 'status loading';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

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
      uploadStatus.textContent = data.error || 'Upload failed';
      uploadStatus.className = 'status error';
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      uploadStatus.textContent = 'Upload timed out. The file may be too large. Please try a smaller file or contact support.';
    } else {
      uploadStatus.textContent = 'Upload failed: ' + error.message;
    }
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
  const examDays = examDaysInput.value;
  const centre = centreSelect.value;
  const selectedTrades = Array.from(tradeSelect.selectedOptions).map(o => o.value);

  if (!centre) {
    recommendationsDiv.innerHTML = '<p class="error">Please select a centre before running allocation.</p>';
    recommendationsDiv.style.display = 'block';
    return;
  }

  if (!examDays || isNaN(examDays) || examDays <= 0) {
    recommendationsDiv.innerHTML = '<p class="error">Please enter a valid number of examination days.</p>';
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
        examDays: parseInt(examDays),
        mergedTrades,
        selectedTrades: selectedTrades.length > 0 ? selectedTrades : null,
        selectedCentre: centre || null
      }),
    });

    const data = await response.json();
    console.log('Allocation response received, groupOptions count:', data.groupOptions ? data.groupOptions.length : 0);

    if (response.ok) {
      if (data.groupOptions && data.groupOptions.length > 0) {
        try {
          displayOptions(data.groupOptions);
        } catch (displayError) {
          console.error('Error in displayOptions:', displayError);
          throw displayError;
        }
        
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
        assignmentsSection.style.display = 'none';
      }
    } else {
      recommendationsDiv.innerHTML = `<p class="error">Allocation failed: ${data.error}</p>`;
      recommendationsDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Allocation error details:', error);
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

  let totalCandidates = 0;
  for (const r of results) {
    totalCandidates += r.numCandidates || 0;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${r.centre}</td>
      <td>${r.tradeOrMerged}</td>
      <td>${r.grade}</td>
      <td>${r.numCandidates}</td>
      <td>${r.numAssessors}</td>
      <td>${r.numDays}</td>
    `;
    resultsTableBody.appendChild(row);
  }

  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `
    <td><strong>Total</strong></td>
    <td colspan="2"></td>
    <td><strong>${totalCandidates}</strong></td>
    <td><strong>${results.length > 0 ? results[0].numAssessors : 0}</strong></td>
    <td><strong>${results.length > 0 ? results[0].numDays : 0}</strong></td>
  `;
  resultsTableBody.appendChild(totalRow);
}

function displayOptions(groupOptions) {
  console.log('displayOptions called with', groupOptions ? groupOptions.length : 0, 'groups');
  optionsSection.style.display = 'block';
  optionsTableBody.innerHTML = '';

  window.currentGroupOptions = groupOptions;

  if (!groupOptions || groupOptions.length === 0) {
    optionsTableBody.innerHTML = '<tr><td colspan="6">No options available. Please check your data and dates.</td></tr>';
    return;
  }

  const MAX_DISPLAY = 50;
  const displayList = groupOptions.slice(0, MAX_DISPLAY);
  const hasMore = groupOptions.length > MAX_DISPLAY;

  for (let i = 0; i < displayList.length; i++) {
    const group = displayList[i];
    
    if (!group || !group.options) {
      console.error('Invalid group data at index', i, group);
      continue;
    }
    
    const preferred = group.preferred;
    
    const row = document.createElement('tr');
    
    const centreCell = group.centre || 'N/A';
    const tradeCell = group.tradeOrMerged || 'N/A';
    const candidatesCell = group.totalCandidates || 0;
    const daysCell = group.totalCandidateDays || 0;
    
    let optionsHtml = 'N/A';
    if (Array.isArray(group.options) && group.options.length > 0) {
      const buttons = [];
      for (let j = 0; j < group.options.length; j++) {
        const opt = group.options[j];
        if (!opt) {
          console.error('Undefined option at group', i, 'index', j);
          buttons.push('Error');
          continue;
        }
        const isPreferred = (preferred && opt === preferred);
        const titleText = isPreferred ? 'Recommended: fits within available period' : (opt.fits ? 'Fits within period' : 'Exceeds available period');
        const btnHtml = '<button class="option-btn ' + (isPreferred ? 'preferred' : '') + '" onclick="selectOption(' + i + ', ' + j + ')" title="' + titleText + '">' +
          'Option ' + (j + 1) + '<br>' +
          '<strong>' + (opt.assessors || 0) + '</strong> assessor(s)<br>' +
          '<strong>' + (opt.days || 0) + '</strong> day(s)<br>' +
          (opt.fits ? 'Fits' : 'Exceeds') +
          '</button>';
        buttons.push(btnHtml);
      }
      optionsHtml = buttons.join(' ');
    }
    
    const fitsCell = (preferred && preferred.fits) ? 'Yes' : 'No';
    
    row.innerHTML = '<td>' + centreCell + '</td>' +
      '<td>' + tradeCell + '</td>' +
      '<td>' + candidatesCell + '</td>' +
      '<td>' + daysCell + '</td>' +
      '<td>' + optionsHtml + '</td>' +
      '<td>' + fitsCell + '</td>';
    
    optionsTableBody.appendChild(row);
  }

  if (hasMore) {
    const moreRow = document.createElement('tr');
    moreRow.innerHTML = '<td colspan="6" class="warning">Showing ' + MAX_DISPLAY + ' of ' + groupOptions.length + ' groups. Please select specific trades to see fewer results, or select options above.</td>';
    optionsTableBody.appendChild(moreRow);
  }
  
  console.log('displayOptions completed successfully');
}

function selectOption(groupIndex, optionIndex) {
  try {
    window.selectedGroupIndex = groupIndex;
    const group = window.currentGroupOptions && window.currentGroupOptions[groupIndex];
    if (!group || !group.options || !group.options[optionIndex]) {
      console.error('Invalid selection:', groupIndex, optionIndex, group);
      alert('Invalid option selected. Please try again.');
      return;
    }
    
    const option = group.options[optionIndex];
    const examDays = parseInt(examDaysInput.value) || 1;
    
    const results = group.gradeResults.map(r => ({
      ...r,
      numAssessors: option.assessors || 1,
      numDays: option.days || 1
    }));

    allocationResults = results;
    displayResults(results, []);
    displayAssignments(group, option);
    optionsSection.style.display = 'none';
    resultsSection.style.display = 'block';
    assignmentsSection.style.display = 'block';
  } catch (error) {
    console.error('Error selecting option:', error);
    alert('Error selecting option: ' + error.message);
  }
}

function displayAssignments(group, option) {
  assignmentsSection.style.display = 'block';
  assignmentsTableBody.innerHTML = '';

  if (!group.assignments || group.assignments.length === 0) {
    assignmentsTableBody.innerHTML = '<tr><td colspan="7">No assignments available.</td></tr>';
    return;
  }

  for (const assignment of group.assignments) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${group.centre || 'N/A'}</td>
      <td>${group.tradeOrMerged || 'N/A'}</td>
      <td>Assessor ${assignment.assessorNumber}</td>
      <td>${assignment.candidates.length}</td>
      <td>${assignment.totalCandidateDays}</td>
      <td>${assignment.candidates.map(c => c.candidateNumber).join(', ')}</td>
      <td>${assignment.candidates.map(c => c.grade).join(', ')}</td>
    `;
    assignmentsTableBody.appendChild(row);
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

downloadAssignmentsBtn.addEventListener('click', () => {
  if (!window.currentGroupOptions || window.currentGroupOptions.length === 0) return;
  const selectedGroup = window.currentGroupOptions[window.selectedGroupIndex || 0];
  if (!selectedGroup || !selectedGroup.assignments) return;
  
  const url = `${API_BASE}/download/assignments?groupOptions=${encodeURIComponent(JSON.stringify([selectedGroup]))}`;
  window.open(url, '_blank');
});
