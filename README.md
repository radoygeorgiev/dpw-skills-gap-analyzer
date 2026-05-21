# DPW Skills Gap Analyzer

Local interactive analyzer for the Automation & Innovation skills gap workbooks.

## Run

```bash
npm install
npm run start -- --port 5177
```

Open http://127.0.0.1:5177/.

## Workflow

- Import completed individual Excel templates to add self-assessment inputs.
- Import the manager workbook to add manager assessment columns.
- Adjust the self / manager weighting sliders.
- Disable or remove participants from the left panel.
- Paste new assessment rows from Excel through **Paste data**.
- Export a shareable Excel report with Executive Summary, Category Summary, Capability Gaps, and Participant Matrix tabs.
- Export a Word-compatible report with executive summary, category view, priority gaps, and participant detail.

The dashboard uses all available sources. If a participant only has self data, that data is used. If they only have manager data, manager data is used. If both exist, the sliders determine the combined score.

## Current Generated Reports

Generated from the emailed Lawrence and Diego inputs plus manager scores:

- `reports/DPW_Automation_Skills_Gap_Report.xlsx`
- `reports/DPW_Automation_Skills_Gap_Report.docx`
