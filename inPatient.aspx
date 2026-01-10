<%@ Page Language="C#" AutoEventWireup="true" CodeFile="inPatient.cs" Inherits="inPatient" %>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Inpatient Practitioner Search</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/buttons/2.4.1/css/buttons.dataTables.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/responsive/2.5.0/css/responsive.dataTables.min.css" rel="stylesheet" />
    <link href="inPatient.css?v=20260106" rel="stylesheet" />
</head>
<body>
<a class="visually-hidden-focusable" href="#main">Skip to main content</a>

<header class="border-bottom bg-white">
    <nav class="navbar navbar-expand-lg navbar-light bg-white" aria-label="Primary">
        <div class="container py-2">
            <a class="navbar-brand fw-semibold" href="Default.aspx">
                <span class="text-primary">Florida</span> Medical Doctor Search
            </a>

            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#primaryNav" aria-controls="primaryNav" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="primaryNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item"><a class="nav-link" href="Default.aspx">Home</a></li>
                    <li class="nav-item"><a class="nav-link" href="outPatient.aspx">Outpatient</a></li>
                    <li class="nav-item"><a class="nav-link active" aria-current="page" href="inPatient.aspx">Inpatient</a></li>
                </ul>
            </div>
        </div>
    </nav>
</header>

<main id="main" class="container py-4">
<div class="d-flex align-items-center mb-3">
    <h2 class="mb-0 me-3">Inpatient Practitioner Search</h2>
</div>

<form method="post" class="row g-3 align-items-end" id="searchForm">
    
    <div class="col-auto county-field">
        <label class="form-label">County</label>
        <select id="county" name="county" class="form-select" multiple="multiple" style="width: 300px;">
            <%= RenderCountyOptions() %>
        </select>
        <div class="small-muted">You can select multiple counties</div>
    </div>

    <div class="col-auto">
        <label class="form-label">Center ZIP</label>
        <input type="text" id="centerZip" name="centerZip" class="form-control" inputmode="numeric" maxlength="5" placeholder="e.g., 33647" value="<%= Server.HtmlEncode(CenterZip) %>" style="width: 160px;" />
        <div class="small-muted">center</div>
    </div>

    <div class="col-auto" id="radiusSearchCol" style="display: none;">
        <label class="form-label"><span id="radiusMilesValue"><%= Server.HtmlEncode(RadiusMilesRaw) %></span></label>
        <input type="range" id="radiusMiles" name="radiusMiles" class="form-range" min="0" max="250" step="1" value="<%= Server.HtmlEncode(RadiusMilesRaw) %>" style="width: 100px;" />
        <div class="small-muted">Radius in miles</div>
    </div>

    <div class="col-auto">
        <label class="form-label">ICD-10 Procedure Code(s)</label>
        <div class="input-group">
            <input type="text" name="icd" class="form-control" value="<%= Server.HtmlEncode(IcdRaw) %>" />
            <button id="openSearch" type="button" class="btn btn-outline-secondary" title="Open ICD-10 Procedure Search">ICD-10 Lookup</button>
        </div>
        <div class="small-muted">Comma separated</div>
    </div>

    <div class="col-auto">
        <button type="submit" class="btn btn-primary" style="margin-bottom: 22px;">Search</button>
    </div>
</form>

<div id="resultsContainer">
    <%= RenderResultsHtml() %>
</div>

<!-- ICD-10 Procedure Search Modal -->
<div class="modal fade" id="icdModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">ICD-10 Procedure Lookup</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2 mb-3">
                    <div class="col-auto">
                        <label class="form-label">Category</label>
                        <select id="icdSection" class="form-select">
                            <option value="">-- all categories --</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <label class="form-label">Subcategory</label>
                        <select id="icdSubsection" class="form-select">
                            <option value="">-- all subcategories --</option>
                        </select>
                    </div>
                </div>

                <table id="icdTable" class="display nowrap dt-row-hover" style="width:100%">
                    <thead>
                        <tr>
                            <th></th>
                            <th>ICD-10</th>
                            <th>Description</th>
                            <th>Use Count</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="applyIcdSelected">Apply Selected</button>
            </div>
        </div>
    </div>
</div>

</div>

</main>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/buttons/2.4.1/js/dataTables.buttons.min.js"></script>
<script src="https://cdn.datatables.net/buttons/2.4.1/js/buttons.html5.min.js"></script>
<script src="https://cdn.datatables.net/buttons/2.4.1/js/buttons.colVis.min.js"></script>
<script src="https://cdn.datatables.net/responsive/2.5.0/js/dataTables.responsive.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
<script src="inPatient.js?v=20260106"></script>
</body>
</html>
