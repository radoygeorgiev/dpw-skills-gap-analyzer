const XLSX = require('xlsx');

const file = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx';
const workbook = XLSX.readFile(file);

function inspectSheetFormulas(sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.log(`Sheet ${sheetName} not found`);
    return;
  }
  
  console.log(`\n=== Formulas in Sheet: ${sheetName} ===`);
  const cells = Object.keys(sheet);
  let count = 0;
  
  cells.forEach(cell => {
    if (cell.startsWith('!')) return;
    const cellData = sheet[cell];
    if (cellData && cellData.f) {
      count++;
      if (count <= 15) {
        console.log(`  Cell ${cell}: Formula = "${cellData.f}", Value = ${cellData.v}`);
      }
    }
  });
  console.log(`Total formulas found in ${sheetName}: ${count}`);
}

inspectSheetFormulas('03_Manager_Assessment');
inspectSheetFormulas('04_Dashboard');
inspectSheetFormulas('05_Geo_Coverage');
