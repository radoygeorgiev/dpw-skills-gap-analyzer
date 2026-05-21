const XLSX = require('xlsx');
const fs = require('fs');

const TEMPLATE_FILE = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Template.xlsx';
const DIEGO_FILE = 'Diego_Team Gap Analysis Self Assessment Diego Delgado.xlsx';
const LAWRENCE_FILE = 'Lawrence_DPW_Automation_Innovation_Skills_Gap_Analysis_Individual_Template (002).xlsx';
const OUTPUT_FILE = 'DPW_Automation_Innovation_Skills_Gap_Analysis_Consolidated.xlsx';

function main() {
  console.log('Starting DPW Skills Gap Excel Consolidation...');

  // 1. Verify existence of files
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`Error: Master template file not found: ${TEMPLATE_FILE}`);
    process.exit(1);
  }
  
  const hasDiego = fs.existsSync(DIEGO_FILE);
  const hasLawrence = fs.existsSync(LAWRENCE_FILE);
  
  console.log(`Master Template: Found`);
  console.log(`Diego Individual file: ${hasDiego ? 'Found' : 'Not found'}`);
  console.log(`Lawrence Individual file: ${hasLawrence ? 'Found' : 'Not found'}`);

  // 2. Load the master workbook
  const masterWb = XLSX.readFile(TEMPLATE_FILE);
  
  // 3. Load self assessments
  const selfScores = {
    lawrence: {},
    diego: {},
    raffael: {}
  };
  const selfEvidence = {
    lawrence: {},
    diego: {},
    raffael: {}
  };

  if (hasLawrence) {
    const lawrenceWb = XLSX.readFile(LAWRENCE_FILE);
    const sheet = lawrenceWb.Sheets['02_Self_Assessment'];
    if (sheet) {
      const rows = XLSX.utils.sheet_to_json(sheet);
      rows.forEach(row => {
        const id = String(row.ID || '').trim();
        const score = Number(row['Self score (1-5)']);
        if (id && !isNaN(score)) {
          selfScores.lawrence[id] = score;
        }
        if (id && row['Evidence / example']) {
          selfEvidence.lawrence[id] = row['Evidence / example'];
        }
      });
    }
  }

  if (hasDiego) {
    const diegoWb = XLSX.readFile(DIEGO_FILE);
    const sheet = diegoWb.Sheets['02_Self_Assessment'];
    if (sheet) {
      const rows = XLSX.utils.sheet_to_json(sheet);
      rows.forEach(row => {
        const id = String(row.ID || '').trim();
        const score = Number(row['Self score (1-5)']);
        if (id && !isNaN(score)) {
          selfScores.diego[id] = score;
        }
        if (id && row['Evidence / example']) {
          selfEvidence.diego[id] = row['Evidence / example'];
        }
      });
    }
  }

  // 4. Load manager assessments from the master template
  const managerScores = {
    lawrence: {},
    diego: {},
    raffael: {} // Starts empty as per requirements
  };

  const managerSheet = masterWb.Sheets['03_Manager_Assessment'];
  const criteria = [];
  if (managerSheet) {
    // We parse sheet using sheet_to_json but read raw matrix to get columns safely
    const matrix = XLSX.utils.sheet_to_json(managerSheet, { header: 1, defval: '' });
    const headers = matrix[0] || [];
    
    // Find column indexes
    const idIdx = headers.indexOf('ID');
    const pillarIdx = headers.indexOf('Pillar');
    const capIdx = headers.indexOf('Capability');
    const reqIdx = headers.indexOf('Required level');
    const weightIdx = headers.indexOf('Weight');
    const typeIdx = headers.indexOf('Gap type');
    
    const lawrenceIdx = headers.indexOf('Lawrence');
    const diegoIdx = headers.indexOf('Diego score');
    const raffaelIdx = headers.indexOf('Raffael score');

    matrix.slice(1).forEach(row => {
      const id = String(row[idIdx] || '').trim();
      if (!id) return;
      
      const req = Number(row[reqIdx]);
      const weight = Number(row[weightIdx]);
      
      criteria.push({
        id,
        pillar: row[pillarIdx],
        capability: row[capIdx],
        required: isNaN(req) ? 3 : req,
        weight: isNaN(weight) ? 1 : weight,
        gapType: row[typeIdx] || 'Skill'
      });

      if (lawrenceIdx >= 0) {
        const score = Number(row[lawrenceIdx]);
        if (!isNaN(score) && row[lawrenceIdx] !== '') managerScores.lawrence[id] = score;
      }
      if (diegoIdx >= 0) {
        const score = Number(row[diegoIdx]);
        if (!isNaN(score) && row[diegoIdx] !== '') managerScores.diego[id] = score;
      }
      if (raffaelIdx >= 0) {
        const score = Number(row[raffaelIdx]);
        if (!isNaN(score) && row[raffaelIdx] !== '') managerScores.raffael[id] = score;
      }
    });
  }

  console.log(`Loaded ${criteria.length} capabilities from template.`);

  // 5. Create a combined dataset for Excel output
  // We will build a customized consolidated sheets package
  const consolidatedWb = XLSX.utils.book_new();

  // Copy 00_ReadMe and 01_Scale directly from master if they exist
  ['00_ReadMe', '01_Scale'].forEach(sheetName => {
    if (masterWb.Sheets[sheetName]) {
      XLSX.utils.book_append_sheet(consolidatedWb, masterWb.Sheets[sheetName], sheetName);
    }
  });

  // A. Build multi-participant self assessment sheet
  const selfRows = criteria.map(c => ({
    ID: c.id,
    Pillar: c.pillar,
    Capability: c.capability,
    'Required Level': c.required,
    'Lawrence Self Score': selfScores.lawrence[c.id] || '',
    'Lawrence Evidence': selfEvidence.lawrence[c.id] || '',
    'Diego Self Score': selfScores.diego[c.id] || '',
    'Diego Evidence': selfEvidence.diego[c.id] || '',
    'Raffael Self Score': selfScores.raffael[c.id] || '',
    'Raffael Evidence': selfEvidence.raffael[c.id] || '',
  }));
  XLSX.utils.book_append_sheet(consolidatedWb, XLSX.utils.json_to_sheet(selfRows), '02_Self_Assessments');

  // B. Build manager assessment sheet matching standard template but populating all known inputs
  // We can write back sheet 03_Manager_Assessment as is, or updated
  if (masterWb.Sheets['03_Manager_Assessment']) {
    XLSX.utils.book_append_sheet(consolidatedWb, masterWb.Sheets['03_Manager_Assessment'], '03_Manager_Assessment');
  }

  // C. Build consolidated dashboard sheet that dynamically aggregates
  const dashboardRows = criteria.map(c => {
    const pScores = [];
    
    // Lawrence combined
    let lSelf = selfScores.lawrence[c.id];
    let lMgr = managerScores.lawrence[c.id];
    let lCombined = null;
    if (lSelf !== undefined && lMgr !== undefined) lCombined = (lSelf + lMgr) / 2;
    else if (lSelf !== undefined) lCombined = lSelf;
    else if (lMgr !== undefined) lCombined = lMgr;
    if (lCombined !== null) pScores.push(lCombined);

    // Diego combined
    let dSelf = selfScores.diego[c.id];
    let dMgr = managerScores.diego[c.id];
    let dCombined = null;
    if (dSelf !== undefined && dMgr !== undefined) dCombined = (dSelf + dMgr) / 2;
    else if (dSelf !== undefined) dCombined = dSelf;
    else if (dMgr !== undefined) dCombined = dMgr;
    if (dCombined !== null) pScores.push(dCombined);

    // Raffael combined
    let rSelf = selfScores.raffael[c.id];
    let rMgr = managerScores.raffael[c.id];
    let rCombined = null;
    if (rSelf !== undefined && rMgr !== undefined) rCombined = (rSelf + rMgr) / 2;
    else if (rSelf !== undefined) rCombined = rSelf;
    else if (rMgr !== undefined) rCombined = rMgr;
    if (rCombined !== null) pScores.push(rCombined);

    // Dynamic aggregated score across all active participants
    const avgScore = pScores.length ? pScores.reduce((a,b)=>a+b, 0) / pScores.length : null;
    const gap = avgScore !== null ? avgScore - c.required : null;
    let status = 'Not Assessed';
    if (gap !== null) {
      if (gap <= -1) status = 'Critical Gap';
      else if (gap < 0) status = 'Gap';
      else if (gap < 0.5) status = 'Adequate';
      else status = 'Strong';
    }

    return {
      ID: c.id,
      Pillar: c.pillar,
      Capability: c.capability,
      'Required Level': c.required,
      'Weight': c.weight,
      'Gap Type': c.gapType,
      'Lawrence Blended': lCombined !== null ? Math.round(lCombined * 100) / 100 : '',
      'Diego Blended': dCombined !== null ? Math.round(dCombined * 100) / 100 : '',
      'Raffael Blended': rCombined !== null ? Math.round(rCombined * 100) / 100 : '',
      'Team Average Score': avgScore !== null ? Math.round(avgScore * 100) / 100 : '',
      'Team Gap': gap !== null ? Math.round(gap * 100) / 100 : '',
      'Risk Status': status
    };
  });
  XLSX.utils.book_append_sheet(consolidatedWb, XLSX.utils.json_to_sheet(dashboardRows), '04_Consolidated_Dashboard');

  // Copy 05_Geo_Coverage, 06_Role_Business_Case, and Lists directly from template if they exist
  ['05_Geo_Coverage', '06_Role_Business_Case', 'Lists'].forEach(sheetName => {
    if (masterWb.Sheets[sheetName]) {
      XLSX.utils.book_append_sheet(consolidatedWb, masterWb.Sheets[sheetName], sheetName);
    }
  });

  // 6. Write output workbook
  XLSX.writeFile(consolidatedWb, OUTPUT_FILE);
  console.log(`Successfully created consolidated workbook: ${OUTPUT_FILE}`);
}

main();
