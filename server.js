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

    for (const row of rows) {
      const grade = String(row['Grade'] || '').trim();
      if (!grade) continue;

      candidates.push(new Candidate(
        String(row['Candidate Number'] || ''),
        String(row['Candidate Name'] || ''),
        String(row['Centre'] || ''),
        String(row['Trade'] || ''),
        grade,
        String(row['Department'] || ''),
      ));
    }

    uploadedCandidates = candidates;
    res.json({
      message: `Loaded ${candidates.length} candidates`,
      count: candidates.length,
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
