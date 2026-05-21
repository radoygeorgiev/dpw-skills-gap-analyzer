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
- Export the current capability gap table as CSV.

The dashboard uses all available sources. If a participant only has self data, that data is used. If they only have manager data, manager data is used. If both exist, the sliders determine the combined score.
