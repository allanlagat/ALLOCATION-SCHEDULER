const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const {
  Candidate,
  ExamScheduler,
  parseExcelFile,
  generateAllocationExcel,
  generateRegisterExcel,
} = require('./scheduler');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let uploadedCandidates = [];

app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const rows = parseExcelFile(req.file.buffer);
    const candidates = [];

    const normalize = (s) => String(s || '').trim().toLowerCase();

    const columnAliases = {
      'candidate number': ['candidate number', 'candidate no', 'candidate id', 'id', 'number'],
      'candidate name': ['candidate name', 'name', 'full name', 'candidate'],
      'centre': ['centre', 'center', 'campus', 'location', 'institution', 'site'],
      'trade': ['trade', 'job', 'occupation', 'craft', 'specialization'],
      'grade': ['grade', 'level', 'classification', 'rank', 'category'],
      'department': ['department', 'dept', 'division', 'section', 'unit']
    };

    const aliasToField = {};
    for (const [field, aliases] of Object.entries(columnAliases)) {
      for (const alias of aliases) {
        aliasToField[alias] = field;
      }
    }

    if (rows.length > 0) {
      const actualKeys = Object.keys(rows[0]);
      const normalizedActual = actualKeys.map(normalize);
      
      const mappedFields = {};
      const unmapped = [];
      
      for (let i = 0; i < actualKeys.length; i++) {
        const normalized = normalizedActual[i];
        const original = actualKeys[i];
        
        if (aliasToField[normalized]) {
          mappedFields[aliasToField[normalized]] = original;
        } else {
          unmapped.push(original);
        }
      }

      const requiredFields = Object.keys(columnAliases);
      const missing = requiredFields.filter(f => !mappedFields[f]);
      
      if (missing.length > 0) {
        return res.status(400).json({ 
          error: `Could not find required columns: ${missing.join(', ')}. Found columns: ${actualKeys.join(', ')}. Please ensure your Excel file has columns like: Candidate Number, Candidate Name, Centre, Trade, Grade, Department` 
        });
      }

      for (const row of rows) {
        const grade = String(row[mappedFields['grade']] || '').trim();
        if (!grade) continue;

        candidates.push(new Candidate(
          String(row[mappedFields['candidate number']] || ''),
          String(row[mappedFields['candidate name']] || ''),
          String(row[mappedFields['centre']] || ''),
          String(row[mappedFields['trade']] || ''),
          grade,
          String(row[mappedFields['department']] || ''),
        ));
      }
    }

    uploadedCandidates = candidates;
    const centres = [...new Set(candidates.map(c => c.centre))].filter(Boolean);
    const tradesByCentre = {};
    for (const c of candidates) {
      if (!c.centre) continue;
      if (!tradesByCentre[c.centre]) tradesByCentre[c.centre] = new Set();
      tradesByCentre[c.centre].add(c.trade);
    }
    const tradesArray = {};
    for (const k in tradesByCentre) tradesArray[k] = [...tradesByCentre[k]];
    
    res.json({
      message: `Loaded ${candidates.length} candidates from ${centres.length} centre(s)`,
      count: candidates.length,
      centres: centres,
      tradesByCentre: tradesArray
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/allocate', (req, res) => {
  try {
    const { examStart, examEnd, mergedTrades } = req.body;

    if (!examStart || !examEnd) {
      return res.status(400).json({ error: 'Missing exam dates' });
    }

    const scheduler = new ExamScheduler(uploadedCandidates, examStart, examEnd);
    const groups = scheduler.getGroups(mergedTrades || {});
    const { results, recommendations } = scheduler.allocate(groups);

    res.json({ results, recommendations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/download/allocation', (req, res) => {
  try {
    const results = JSON.parse(req.query.results || '[]');
    const buffer = generateAllocationExcel(results);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=allocation_summary.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/download/registers', (req, res) => {
  try {
    const results = JSON.parse(req.query.results || '[]');
    const buffer = generateRegisterExcel(results, uploadedCandidates);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=candidate_registers.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/centres', (req, res) => {
  try {
    const centres = [...new Set(uploadedCandidates.map(c => c.centre))];
    const tradesByCentre = {};
    for (const c of uploadedCandidates) {
      if (!tradesByCentre[c.centre]) tradesByCentre[c.centre] = new Set();
      tradesByCentre[c.centre].add(c.trade);
    }
    const tradesArray = {};
    for (const key in tradesByCentre) {
      tradesArray[key] = [...tradesByCentre[key]];
    }
    res.json({ centres, tradesByCentre: tradesArray });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
