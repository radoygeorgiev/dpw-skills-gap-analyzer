const XLSX = require('xlsx');

const file = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx';
const workbook = XLSX.readFile(file);

const selfSheet = workbook.Sheets['02_Self_Assessment'];
if (selfSheet) {
  const data = XLSX.utils.sheet_to_json(selfSheet);
  console.log('=== DPW Template 02_Self_Assessment ===');
  console.log(`Loaded ${data.length} rows`);
  
  const scoredRows = data.filter(row => row['Self score (1-5)'] !== undefined && row['Self score (1-5)'] !== '');
  console.log(`Scored rows count: ${scoredRows.length}`);
  
  if (scoredRows.length > 0) {
    console.log('Sample of scored rows (first 5):');
    scoredRows.slice(0, 5).forEach(row => {
      console.log(`ID: ${row.ID}, Score: ${row['Self score (1-5)']}, Evidence: ${row['Evidence / example'] || 'none'}`);
    });
  }
} else {
  console.log('Self Assessment sheet not found in template');
}
