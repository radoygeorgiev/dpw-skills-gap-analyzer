const XLSX = require('xlsx');

const file = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx';
const workbook = XLSX.readFile(file);

const managerSheet = workbook.Sheets['03_Manager_Assessment'];
if (managerSheet) {
  const data = XLSX.utils.sheet_to_json(managerSheet, { header: 1 });
  console.log('--- Manager Assessment Header & Columns ---');
  console.log(data[0]); // Header row
  console.log('\nFirst 10 rows:');
  data.slice(1, 10).forEach((row, idx) => {
    console.log(`Row ${idx+1}:`, row.slice(0, 10));
  });
} else {
  console.log('Manager sheet not found');
}

const geoSheet = workbook.Sheets['05_Geo_Coverage'];
if (geoSheet) {
  const data = XLSX.utils.sheet_to_json(geoSheet, { header: 1 });
  console.log('\n--- Geo Coverage Sheet ---');
  data.slice(0, 10).forEach((row, idx) => {
    console.log(`Row ${idx}:`, row.slice(0, 8));
  });
}
