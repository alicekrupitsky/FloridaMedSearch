<%@ Page Language="C#" AutoEventWireup="true" CodeFile="outPatient.cs" Inherits="outPatient" %>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Outpatient Practitioner Search</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/responsive/2.5.0/css/responsive.dataTables.min.css" rel="stylesheet" />
    <link href="outPatient.css" rel="stylesheet" />

    <% Response.WriteFile(Server.MapPath("~/ga4-snippet.html")); %>
</head>
<body data-is-auth="<%= (Context != null && Context.User != null && Context.User.Identity != null && Context.User.Identity.IsAuthenticated) ? "1" : "0" %>">
<a class="visually-hidden-focusable" href="#main">Skip to main content</a>

<!--#INCLUDE FILE="i_header.aspx" -->

<main id="main" class="container py-4">
<div class="d-flex align-items-center mb-3">
    <h2 class="mb-0 me-3">Outpatient Practitioner Search</h2>
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
        <label class="form-label">CPT Code(s)</label>
        <div class="input-group">
            <input type="text" name="cpt" class="form-control" value="<%= Server.HtmlEncode(CptRaw) %>" />
            <button id="openSearch" type="button" class="btn btn-outline-secondary" title="Open CPT Search">CPT Lookup</button>
        </div>
        <div class="small-muted">Comma separated (e.g., 29882, 29883)</div>
    </div>

    <div class="col-auto">
        <button type="submit" class="btn btn-primary" style="margin-bottom: 22px;">Search</button>
    </div>
</form>

<div id="resultsContainer">
    <%= RenderResultsHtml() %>
</div>

<!-- CPT Search Modal -->
<div class="modal fade" id="cptModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">CPT Code Lookup</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="row g-2 mb-3">
                    <div class="col-auto">
                        <label class="form-label">Section</label>
                        <select id="cptSection" class="form-select">
                            <option value="">-- all sections --</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <label class="form-label">Subsection</label>
                        <select id="cptSubsection" class="form-select">
                            <option value="">-- all subsections --</option>
                        </select>
                    </div>
                </div>

                <table id="cptTable" class="display nowrap dt-row-hover" style="width:100%">
                    <thead>
                        <tr>
                            <th></th>
                            <th></th>
                            <th>CPT</th>
                            <th>Description</th>
                            <th>Use Count</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
            <div class="modal-footer">
                <div class="form-check me-auto" id="cptStarOnlyWrap" style="display:none;">
                    <input class="form-check-input" type="checkbox" value="1" id="cptStarOnly">
                    <label class="form-check-label" for="cptStarOnly">Show starred only</label>
                </div>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="applyCptSelected">Apply Selected</button>
            </div>
        </div>
    </div>
</div>

</div>

</main>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/responsive/2.5.0/js/dataTables.responsive.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
<script src="outPatient.js"></script>
</body>
</html>
