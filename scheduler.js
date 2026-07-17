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

  minAssessors(examDays) {
    const totalDays = this.totalCandidateDays();
    const capacityPerAssessor = examDays * 6;
    if (capacityPerAssessor <= 0) return 1;
    return Math.max(1, Math.ceil(totalDays / capacityPerAssessor));
  }

  daysForAssessors(numAssessors, examDays) {
    const totalDays = this.totalCandidateDays();
    if (numAssessors === 0) return Infinity;
    return Math.max(1, Math.ceil(totalDays / (numAssessors * 6)));
  }

  getOptions(examDays) {
    const options = [];
    const minAssessors = this.minAssessors(examDays);
    
    for (let assessors = minAssessors; assessors <= minAssessors + 10; assessors++) {
      const days = this.daysForAssessors(assessors, examDays);
      options.push({
        assessors: assessors,
        days: days,
        fits: days <= examDays
      });
    }
    
    return options;
  }

  assignCandidatesToAssessors(numAssessors, examDays) {
    const sortedCandidates = [...this.candidates].sort((a, b) => {
      const priorityDiff = GRADE_PRIORITY[a.grade] - GRADE_PRIORITY[b.grade];
      if (priorityDiff !== 0) return priorityDiff;
      return a.candidateNumber.localeCompare(b.candidateNumber);
    });

    const assignments = [];
    for (let i = 0; i < numAssessors; i++) {
      assignments.push({
        assessorNumber: i + 1,
        candidates: [],
        totalCandidateDays: 0
      });
    }

    for (const candidate of sortedCandidates) {
      const candidateDays = GRADE_DAYS[candidate.grade] || 0;
      let bestAssessor = 0;
      let minLoad = assignments[0].totalCandidateDays;

      for (let i = 1; i < assignments.length; i++) {
        if (assignments[i].totalCandidateDays < minLoad) {
          minLoad = assignments[i].totalCandidateDays;
          bestAssessor = i;
        }
      }

      assignments[bestAssessor].candidates.push(candidate);
      assignments[bestAssessor].totalCandidateDays += candidateDays;
    }

    return assignments;
  }

  generateDailySchedule(numAssessors, examDays) {
    const assignments = this.assignCandidatesToAssessors(numAssessors, examDays);
    const schedule = [];
    
    for (let day = 1; day <= examDays; day++) {
      const daySchedule = {
        day: day,
        assessors: []
      };
      
      for (const assignment of assignments) {
        const assessorDay = {
          assessorNumber: assignment.assessorNumber,
          candidates: []
        };
        
        for (const candidate of assignment.candidates) {
          const candidateDays = GRADE_DAYS[candidate.grade] || 0;
          const candidateStartDay = candidate.scheduledStartDay || 1;
          
          if (day >= candidateStartDay && day < candidateStartDay + candidateDays) {
            assessorDay.candidates.push(candidate);
          }
        }
        
        daySchedule.assessors.push(assessorDay);
      }
      
      schedule.push(daySchedule);
    }
    
    return schedule;
  }

  scheduleCandidates(numAssessors, examDays) {
    const sortedCandidates = [...this.candidates].sort((a, b) => {
      const priorityDiff = GRADE_PRIORITY[a.grade] - GRADE_PRIORITY[b.grade];
      if (priorityDiff !== 0) return priorityDiff;
      return a.candidateNumber.localeCompare(b.candidateNumber);
    });

    const assignments = [];
    for (let i = 0; i < numAssessors; i++) {
      assignments.push({
        assessorNumber: i + 1,
        candidates: [],
        totalCandidateDays: 0,
        dailyLoad: new Array(examDays).fill(0)
      });
    }

    const candidateAssignments = new Map();
    let unscheduledCandidates = [];
    
    for (const candidate of sortedCandidates) {
      const candidateDays = GRADE_DAYS[candidate.grade] || 0;
      
      if (candidateDays > examDays) {
        unscheduledCandidates.push(candidate);
        continue;
      }
      
      let bestAssessor = 0;
      let minMaxLoad = Infinity;
      let bestStartDay = -1;

      for (let day = 0; day <= examDays - candidateDays; day++) {
        for (let i = 0; i < assignments.length; i++) {
          let fits = true;
          let maxLoad = 0;
          
          for (let d = day; d < day + candidateDays; d++) {
            if (assignments[i].dailyLoad[d] + 1 > 6) {
              fits = false;
              break;
            }
            maxLoad = Math.max(maxLoad, assignments[i].dailyLoad[d] + 1);
          }
          
          if (fits && maxLoad < minMaxLoad) {
            minMaxLoad = maxLoad;
            bestAssessor = i;
            bestStartDay = day;
          }
        }
      }

      if (bestStartDay === -1) {
        unscheduledCandidates.push(candidate);
        continue;
      }

      assignments[bestAssessor].candidates.push(candidate);
      assignments[bestAssessor].totalCandidateDays += candidateDays;
      
      for (let d = bestStartDay; d < bestStartDay + candidateDays; d++) {
        assignments[bestAssessor].dailyLoad[d] += 1;
      }
      
      candidateAssignments.set(candidate.candidateNumber, {
        assessorNumber: assignments[bestAssessor].assessorNumber,
        startDay: bestStartDay + 1,
        endDay: bestStartDay + candidateDays
      });
    }

    const schedule = [];
    for (let day = 0; day < examDays; day++) {
      const daySchedule = {
        day: day + 1,
        assessors: []
      };
      
      for (const assignment of assignments) {
        const dayCandidates = assignment.candidates.filter(c => {
          const info = candidateAssignments.get(c.candidateNumber);
          return info && day + 1 >= info.startDay && day + 1 <= info.endDay;
        });
        
        daySchedule.assessors.push({
          assessorNumber: assignment.assessorNumber,
          candidates: dayCandidates,
          count: dayCandidates.length
        });
      }
      
      schedule.push(daySchedule);
    }

    const candidateSchedule = Array.from(candidateAssignments.entries()).map(([candidateNumber, info]) => {
      const candidate = this.candidates.find(c => c.candidateNumber === candidateNumber);
      return {
        candidateNumber: candidate.candidateNumber,
        candidateName: candidate.candidateName,
        grade: candidate.grade,
        department: candidate.department,
        assessorNumber: info.assessorNumber,
        startDay: info.startDay,
        endDay: info.endDay
      };
    });

    return { assignments, schedule, candidateSchedule, unscheduledCandidates };
  }
}

class ExamScheduler {
  constructor(candidates, examDays) {
    this.candidates = candidates;
    this.examDays = examDays;
  }

  getGroups(mergedTrades = {}, selectedTrades = null, selectedCentre = null) {
    const groups = {};

    for (const c of this.candidates) {
      if (selectedCentre && c.centre !== selectedCentre) {
        continue;
      }
      if (selectedTrades && selectedTrades.length > 0 && !selectedTrades.includes(c.trade)) {
        continue;
      }

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
    const groupOptions = [];
    const recommendations = [];

    for (const group of groups) {
      const totalDaysNeeded = group.totalCandidateDays();
      const minAssessors = group.minAssessors(this.examDays);
      const minDays = group.daysForAssessors(minAssessors, this.examDays);

      const options = group.getOptions(this.examDays);
      const preferred = options.find(o => o.fits) || options[0];

      const displayTrade = group.merged ? group.trades.join(' + ') : group.trades[0];

      const sortedGrades = Object.keys(group.candidatesByGrade()).sort(
        (a, b) => GRADE_PRIORITY[a] - GRADE_PRIORITY[b]
      );

      const gradeResults = [];
      for (const grade of sortedGrades) {
        gradeResults.push({
          centre: group.centre,
          tradeOrMerged: displayTrade,
          grade: grade,
          numCandidates: group.candidatesByGrade()[grade],
          numAssessors: preferred.assessors,
          numDays: preferred.days,
          merged: group.merged,
          originalTrades: group.trades,
        });
      }

      const { assignments, schedule, candidateSchedule, unscheduledCandidates } = group.scheduleCandidates(preferred.assessors, this.examDays);

      const allCandidateSchedules = group.candidates.map(c => {
        const scheduled = candidateSchedule.find(cs => cs.candidateNumber === c.candidateNumber);
        if (scheduled) return scheduled;
        
        const unscheduled = unscheduledCandidates.find(uc => uc.candidateNumber === c.candidateNumber);
        return {
          candidateNumber: c.candidateNumber,
          candidateName: c.candidateName,
          grade: c.grade,
          department: c.department,
          assessorNumber: 0,
          startDay: 0,
          endDay: 0,
          error: unscheduled ? `Requires ${GRADE_DAYS[c.grade] || 0} days but only ${this.examDays} exam days available` : 'Not scheduled'
        };
      });

      groupOptions.push({
        centre: group.centre,
        tradeOrMerged: displayTrade,
        merged: group.merged,
        originalTrades: group.trades,
        totalCandidates: group.totalCandidates(),
        totalCandidateDays: totalDaysNeeded,
        options: options,
        preferred: preferred,
        gradeResults: gradeResults,
        assignments: assignments,
        schedule: schedule,
        candidateSchedule: allCandidateSchedules,
        unscheduledCandidates: unscheduledCandidates.map(c => ({
          candidateNumber: c.candidateNumber,
          candidateName: c.candidateName,
          grade: c.grade,
          department: c.department,
          reason: `Requires ${GRADE_DAYS[c.grade] || 0} days but only ${this.examDays} exam days available`
        }))
      });

      if (!preferred.fits) {
        recommendations.push(
          `Centre: ${group.centre} | Trade: ${displayTrade} | Requires ${preferred.days} days but only ${this.examDays} days available. Consider adding assessors.`
        );
      }
    }

    return { groupOptions, recommendations };
  }
}

function parseExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { 
    type: 'buffer',
    cellStyles: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
    dense: true
  });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
}

function parseCSVFile(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }
  
  return rows;
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

function generateAssignmentsExcel(groupOptions) {
  const wb = XLSX.utils.book_new();

  for (const group of groupOptions) {
    if (!group.assignments || group.assignments.length === 0) continue;

    const sheetData = [];
    sheetData.push(['Centre', 'Trade', 'Assessor', 'Candidate Number', 'Candidate Name', 'Grade', 'Department', 'Start Day', 'End Day']);

    for (const assignment of group.assignments) {
      for (const candidate of assignment.candidates) {
        const schedule = group.candidateSchedule.find(cs => cs.candidateNumber === candidate.candidateNumber);
        sheetData.push([
          group.centre,
          group.tradeOrMerged,
          assignment.assessorNumber,
          candidate.candidateNumber,
          candidate.candidateName,
          candidate.grade,
          candidate.department,
          schedule ? schedule.startDay : '',
          schedule ? schedule.endDay : ''
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const sheetName = `${group.centre}_${group.tradeOrMerged}_Assignments`.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    if (group.schedule && group.schedule.length > 0) {
      const scheduleData = [['Day', 'Assessor', 'Candidates Count', 'Candidate Numbers', 'Grades']];
      
      for (const daySchedule of group.schedule) {
        for (const assessorDay of daySchedule.assessors) {
          if (assessorDay.candidates.length > 0) {
            scheduleData.push([
              daySchedule.day,
              assessorDay.assessorNumber,
              assessorDay.count,
              assessorDay.candidates.map(c => c.candidateNumber).join(', '),
              assessorDay.candidates.map(c => c.grade).join(', ')
            ]);
          }
        }
      }

      const scheduleWs = XLSX.utils.aoa_to_sheet(scheduleData);
      const scheduleSheetName = `${group.centre}_${group.tradeOrMerged}_Daily_Schedule`.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, scheduleWs, scheduleSheetName);
    }
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  Candidate,
  TradeGroup,
  ExamScheduler,
  parseExcelFile,
  parseCSVFile,
  generateAllocationExcel,
  generateRegisterExcel,
  generateAssignmentsExcel,
  GRADE_DAYS,
  GRADE_PRIORITY,
};
