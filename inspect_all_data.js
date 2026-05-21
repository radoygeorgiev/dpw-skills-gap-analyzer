const XLSX = require('xlsx');
const fs = require('fs');

function inspectManager() {
  const file = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx';
  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets['03_Manager_Assessment'];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  console.log('=== DPW Template 03_Manager_Assessment ===');
  console.log(`Loaded ${rows.length} rows`);
  
  const columns = Object.keys(rows[0] || {});
  console.log('Columns:', columns);
  
  // Let's summarize non-empty manager scores for Lawrence, Diego, Raffael
  let lawrenceCount = 0;
  let diegoCount = 0;
  let raffaelCount = 0;
  
  rows.forEach(row => {
    const id = row.ID || row.id;
    if (row['Lawrence'] !== undefined && row['Lawrence'] !== '') lawrenceCount++;
    if (row['Diego score'] !== undefined && row['Diego score'] !== '') diegoCount++;
    if (row['Raffael score'] !== undefined && row['Raffael score'] !== '') raffaelCount++;
  });
  
  console.log(`Lawrence scores: ${lawrenceCount}`);
  console.log(`Diego scores: ${diegoCount}`);
  console.log(`Raffael scores: ${raffaelCount}`);
  
  // Let's check if there are actual scores for Raffael or if they are blank
  const raffaelSample = rows.filter(row => row['Raffael score'] !== undefined && row['Raffael score'] !== '').map(row => ({
    id: row.ID,
    capability: row.Capability,
    score: row['Raffael score']
  }));
  
  console.log('\nRaffael scores sample (first 5):', raffaelSample.slice(0, 5));
}

inspectManager();
