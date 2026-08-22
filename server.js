const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory environment state: 'stable' | 'broken'
let environmentState = 'stable';

app.get('/api/status', (req, res) => {
  res.json({ environment: environmentState });
});

app.post('/api/toggle', (req, res) => {
  environmentState = environmentState === 'stable' ? 'broken' : 'stable';
  res.json({ environment: environmentState });
});

app.post('/api/deploy', (req, res) => {
  if (environmentState === 'stable') {
    res.status(200).json({ success: true, message: 'Deployment succeeded! Release shipped.' });
  } else {
    res.status(500).json({ success: false, message: 'Deployment failed: environment is broken!' });
  }
});

// Test-only helper so specs can force a known starting state without UI toggling races
app.post('/api/reset', (req, res) => {
  environmentState = 'stable';
  res.json({ environment: environmentState });
});

app.listen(PORT, () => {
  console.log(`DevOps Release Dashboard running at http://localhost:${PORT}`);
});
