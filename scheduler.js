const XLSX = require('xlsx');

const GRADE_DAYS = {
  'Grade I': 3,
  'MCP III': 3,
  'Grade II': 2,
  'Grade III': 1,
};

const GRADE_PRIORITY = {
  'Grade I': 1,
  'MCP III': 2,
  'Grade II': 3,
  'Grade III': 4,
};

class Candidate {
  constructor(candidateNumber, candidateName, centre, trade, grade, department) {
    this.candidateNumber = candidateNumber;
    this.candidateName = candidateName;
    this.centre = centre;
    this.trade = trade;
    this.grade = grade;
    this.department = department;
  }
}

class TradeGroup {
  constructor(centre, trades, merged = false) {
    this.centre = centre;
    this.trades = trades;
    this.candidates = [];
    this.merged = merged;
  }

  addCandidate(candidate) {
    this.candidates.push(candidate);
  }

  totalCandidates() {
    return this.candidates.length;
  }

  candidatesByGrade() {
    const counts = {};
    for (const c of this.candidates) {
      counts[c.grade] = (counts[c.grade] || 0) + 1;
    }
    return counts;
  }

  totalCandidateDays() {
    return this.candidates.reduce((sum, c) => sum + (GRADE_DAYS[c.grade] || 0), 0);
  }

  minAssessors() {
    const totalDays = this.totalCandidateDays();
    return Math.max(1, Math.ceil(totalDays / 6));
  }

  minDaysForAssessors(numAssessors) {
    const totalDays = this.totalCandidateDays();
    if (numAssessors === 0) return Infinity;
    return Math.max(1, Math.ceil(totalDays / (numAssessors * 6)));
  }
}

class ExamScheduler {
  constructor(candidates, examStart, examEnd) {
    this.candidates = candidates;
    this.examStart = new Date(examStart);
    this.examEnd = new Date(examEnd);
    this.availableDays = this.getExamDays();
  }

  getExamDays() {
    const days = [];
    let current = new Date(this.examStart);
    while (current <= this.examEnd) {
      const day = current.getDay();
      if (day !== 0) {
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }

  getGroups(mergedTrades = {}) {
    const groups = {};

    for (const c of this.candidates) {
      const centreMerges = mergedTrades[c.centre];
      let tradeList;
      if (centreMerges && centreMerges.includes(c.trade)) {
        tradeList = centreMerges;
      } else {
        tradeList = [c.trade];
      }
      const groupKey = `${c.centre}|${[...new Set(tradeList)].sort().join('|')}`;

      if (!groups[groupKey]) {
        const isMerged = tradeList.length > 1;
        groups[groupKey] = new TradeGroup(c.centre, tradeList, isMerged);
      }

      groups[groupKey].addCandidate(c);
    }

    return Object.values(groups);
  }

  allocate(groups) {
    const results = [];
    const recommendations = [];

    for (const group of groups) {
      const totalDaysNeeded = group.totalCandidateDays();
      const minAssessors = group.minAssessors();
      const minDays = group.minDaysForAssessors(minAssessors);

      let numAssessors = minAssessors;
      let numDays = minDays;
      let feasible = true;

      if (minDays > this.availableDays.length) {
        feasible = false;
        for (let a = minAssessors; a <= this.availableDays.length; a++) {
          const daysNeeded = group.minDaysForAssessors(a);
          if (daysNeeded <= this.availableDays.length) {
            numAssessors = a;
            numDays = daysNeeded;
            feasible = true;
            break;
          }
        }
      }

      if (!feasible) {
        recommendations.push(
          `Centre: ${group.centre} | Trades: ${group.trades.join(', ')} | Cannot fit within available period even with ${this.availableDays.length} assessors.`
        );
        continue;
      }

      const startDate = this.availableDays[0];
      const endDate = new Date(this.availableDays[numDays - 1]);

      const displayTrade = group.merged ? group.trades.join(' + ') : group.trades[0];

      const sortedGrades = Object.keys(group.candidatesByGrade()).sort(
        (a, b) => GRADE_PRIORITY[a] - GRADE_PRIORITY[b]
      );

      for (const grade of sortedGrades) {
        results.push({
          centre: group.centre,
          tradeOrMerged: displayTrade,
          grade: grade,
          numCandidates: group.candidatesByGrade()[grade],
          numAssessors: numAssessors,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          numDays: numDays,
          merged: group.merged,
          originalTrades: group.trades,
        });
      }
    }

    return { results, recommendations };
  }
}

function parseExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

function generateAllocationExcel(results) {
  const data = results.map(r => ({
    Centre: r.centre,
    'Trade/Merged Trade': r.tradeOrMerged,
    Grade: r.grade,
    'Number of Candidates': r.numCandidates,
    'Number of Assessors': r.numAssessors,
    'Examination Start Date': r.startDate,
    'Examination End Date': r.endDate,
    'Number of Days Allocated': r.numDays,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Allocation');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function generateRegisterExcel(results, candidates) {
  const wb = XLSX.utils.book_new();

  for (const res of results) {
    const filtered = candidates.filter(c => {
      if (c.centre !== res.centre) return false;
      if (c.grade !== res.grade) return false;
      if (res.merged) {
        return res.originalTrades.includes(c.trade);
      }
      return c.trade === res.tradeOrMerged;
    });

    const data = filtered.map(c => ({
      Centre: res.centre,
      Trade: res.tradeOrMerged,
      Grade: res.grade,
      'Candidate Number': c.candidateNumber,
      'Candidate Name': c.candidateName,
      'Examination Start Date': res.startDate,
      'Examination End Date': res.endDate,
      'Days Allocated': res.numDays,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const sheetName = `${res.centre}_${res.tradeOrMerged}_${res.grade}`.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  Candidate,
  TradeGroup,
  ExamScheduler,
  parseExcelFile,
  generateAllocationExcel,
  generateRegisterExcel,
  GRADE_DAYS,
  GRADE_PRIORITY,
};
