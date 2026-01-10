# Florida Medical Doctor Search by Alice Krupitsky

Small ASP.NET WebForms site that lets users search practitioner utilization data in two modes:

- **Outpatient search** (CPT)
- **Inpatient search** (ICD-10-PCS)

Landing page: [Default.aspx](Default.aspx)

## Features

- County multi-select (Select2)
- Optional ZIP + radius filter (miles)
- Code lookup modal with searchable table (DataTables)
- AJAX results loading (no full page refresh)
- Optional debug SQL display (if enabled in code/query string)

## Project Layout

- Landing: [Default.aspx](Default.aspx)
- Outpatient UI: [outPatient.aspx](outPatient.aspx)
- Outpatient code-behind: [outPatient.cs](outPatient.cs)
- Outpatient assets: [outPatient.js](outPatient.js), [outPatient.css](outPatient.css)
- Inpatient UI: [inPatient.aspx](inPatient.aspx)
- Inpatient code-behind: [inPatient.cs](inPatient.cs)
- Inpatient assets: [inPatient.js](inPatient.js), [inPatient.css](inPatient.css)
- IIS / app config: [web.config](web.config)

## Requirements

- Windows + IIS
- ASP.NET (.NET Framework) enabled for the site/app pool
- SQL Server (or SQL Server Express) with the expected schema/data

Client-side libraries are loaded via CDN:

- Bootstrap 5
- Bootstrap Icons
- jQuery
- DataTables (+ Buttons, Responsive)
- Select2

## Configuration

### 1) Database connection string

Edit the `MedDb` connection string in [web.config](web.config).

Example (replace with real values):

```xml
<connectionStrings>
  <add name="MedDb"
       connectionString="Data Source=.;Initial Catalog=MED;User ID=...;Password=...;Encrypt=False;TrustServerCertificate=True;"
       providerName="System.Data.SqlClient" />
</connectionStrings>
```

Notes:

- Prefer Windows Integrated Security for local installs when possible.
- Avoid committing real credentials.

### 2) IIS site settings

- Point the IIS site (or virtual directory/application) to this folder.
- Ensure the app pool has ASP.NET (.NET Framework) enabled.
- Grant the app pool identity read access to the folder (default is usually fine).

## Usage

### Start at the landing page

- Browse to `/Default.aspx`
- Choose **Outpatient** or **Inpatient**

### Outpatient search (CPT)

- Open [outPatient.aspx](outPatient.aspx)
- Select one or more counties
- Optionally enter a **Center ZIP** to enable the radius slider
- Enter CPT codes (comma-separated) or use **CPT Lookup**
- Click **Search**

### Inpatient search (ICD-10-PCS)

- Open [inPatient.aspx](inPatient.aspx)
- Select one or more counties
- Optionally enter a **Center ZIP** to enable the radius slider
- Enter ICD-10 procedure codes (comma-separated) or use **ICD-10 Lookup**
- Click **Search**

## AJAX endpoints (internal)

Both search pages support `action` query parameters:

- `?action=data`
  - Returns JSON for the lookup modal (CPT or ICD-10-PCS)
- `?action=search`
  - Returns HTML fragment for the results area (`#resultsContainer`)

The UI pages use these automatically via JavaScript.

## Troubleshooting

- **Blank page / server error**: check IIS logs and Windows Event Viewer; confirm ASP.NET features are installed.
- **“Missing connection string 'MedDb'…”**: verify [web.config](web.config) has the `MedDb` entry.
- **No results**: confirm the database has data and that your CPT/ICD codes match the expected format.
- **Lookup modal doesn’t load**: verify the site can reach CDN assets (jQuery/DataTables/Select2) from the server/browser.

## Security notes

- Treat [web.config](web.config) as sensitive if it contains credentials.
- If you deploy beyond localhost, enable TLS and use least-privilege DB accounts.
