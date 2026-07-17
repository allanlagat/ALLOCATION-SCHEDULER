const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const {
  Candidate,
  ExamScheduler,
  parseExcelFile,
  parseCSVFile,
  generateAllocationExcel,
  generateRegisterExcel,
  generateAssignmentsExcel,
} = require('./scheduler');

const PORT = process.env.PORT || 3000;

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access from other devices on the network: http://192.168.2.101:${PORT}`);
});

server.timeout = 300000;

let uploadedCandidates = [];

app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Received file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    let rows;
    const isCSV = req.file.originalname.toLowerCase().endsWith('.csv');
    const fileSizeMB = req.file.size / (1024 * 1024);
    
    if (!isCSV && fileSizeMB > 5) {
      console.log(`Large Excel file (${fileSizeMB.toFixed(1)}MB). Consider using CSV for faster processing.`);
    }

    try {
      if (isCSV) {
        console.log('Parsing as CSV...');
        rows = parseCSVFile(req.file.buffer);
      } else {
        console.log('Parsing as Excel...');
        rows = parseExcelFile(req.file.buffer);
      }
      console.log(`Parsed ${rows.length} rows`);
    } catch (parseError) {
      console.error('Parsing error:', parseError);
      return res.status(400).json({ 
        error: `Failed to parse file: ${parseError.message}. ${isCSV ? 'Please ensure the CSV format is correct.' : 'Please ensure the Excel file is not corrupted. Try converting to CSV for faster processing.'}` 
      });
    }

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
      
      for (let i = 0; i < actualKeys.length; i++) {
        const normalized = normalizedActual[i];
        const original = actualKeys[i];
        
        if (aliasToField[normalized]) {
          mappedFields[aliasToField[normalized]] = original;
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
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/allocate', (req, res) => {
  try {
    const { examDays, mergedTrades, selectedTrades, selectedCentre } = req.body;

    if (!examDays || isNaN(examDays) || examDays <= 0) {
      return res.status(400).json({ error: 'Invalid exam days. Please enter a positive number.' });
    }

    const scheduler = new ExamScheduler(uploadedCandidates, parseInt(examDays));
    const groups = scheduler.getGroups(mergedTrades || {}, selectedTrades || null, selectedCentre || null);
    
    console.log('Allocating', groups.length, 'groups');
    
    const { groupOptions, recommendations } = scheduler.allocate(groups);

    res.json({ groupOptions, recommendations });
  } catch (error) {
    console.error('Allocation error:', error);
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

app.get('/download/assignments', (req, res) => {
  try {
    const groupOptions = JSON.parse(req.query.groupOptions || '[]');
    const buffer = generateAssignmentsExcel(groupOptions);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=assessor_assignments.xlsx');
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

