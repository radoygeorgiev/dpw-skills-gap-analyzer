const XLSX = require('xlsx');
const fs = require('fs');

const files = [
  'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx',
  'Diego_Team Gap Analysis Self Assessment Diego Delgado.xlsx',
  'Lawrence_DPW_Automation_Innovation_Skills_Gap_Analysis_Individual_Template (002).xlsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`\n=== File: ${file} ===`);
    const workbook = XLSX.readFile(file);
    console.log('Sheets:', workbook.SheetNames);
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
      console.log(`  Sheet: ${sheetName}, Range: ${sheet['!ref']}, Rows: ${range.e.r + 1}, Cols: ${range.e.c + 1}`);
      
      // Let's print the first few rows
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 5);
      console.log('  First few rows:');
      data.forEach((row, i) => {
        console.log(`    Row ${i}:`, row.slice(0, 8));
      });
    });
  } else {
    console.log(`File not found: ${file}`);
  }
});
