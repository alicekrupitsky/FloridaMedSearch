<%@ Page Language="C#" AutoEventWireup="true" CodeFile="md.cs" Inherits="md" %>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Practitioner Profile</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css" rel="stylesheet" />
    <link href="https://cdn.datatables.net/responsive/2.5.0/css/responsive.dataTables.min.css" rel="stylesheet" />
    <link href="md.css?v=20260111" rel="stylesheet" />

    <% Response.WriteFile(Server.MapPath("~/ga4-snippet.html")); %>
</head>
<body>
<a class="visually-hidden-focusable" href="#main">Skip to main content</a>

<!--#INCLUDE FILE="i_header.aspx" -->

<main id="main" class="container py-4">
<div class="d-flex align-items-center mb-3">
    <h2 class="mb-0 me-3">Practitioner Profile</h2>
</div>

<form method="post" id="searchForm" class="d-none" aria-hidden="true">
    <input type="hidden" name="md" id="md" value="<%= Server.HtmlEncode(LicenseNumber) %>" />
    <button type="submit" tabindex="-1">Search</button>
</form>

<div class="card mb-4" id="licenseLookupSection">
    <div class="card-header bg-white">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h5 class="mb-0">License Lookup</h5>
            <div class="small text-muted">Click a row to load results</div>
        </div>
    </div>
    <div class="card-body">
        <div class="row g-2 mb-3">
            <div class="col-auto">
                <label class="form-label">County</label>
                <select id="licCounty" class="form-select">
                    <option value="">-- all counties --</option>
                </select>
            </div>
            <div class="col-auto">
                <label class="form-label">City</label>
                <select id="licCity" class="form-select">
                    <option value="">-- all cities --</option>
                </select>
            </div>
            <div class="col-auto d-flex align-items-end">
                <div class="form-check mb-1">
                    <input class="form-check-input" type="checkbox" id="licStarOnly" />
                    <label class="form-check-label" for="licStarOnly">Show starred only</label>
                </div>
            </div>
        </div>

        <table id="licenseTable" class="display nowrap dt-row-hover" style="width:100%">
            <thead>
                <tr>
                    <th></th>
                    <th>Full Name</th>
                    <th>License</th>
                    <th>County</th>
                    <th>City</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    </div>
</div>

<div id="resultsContainer">
    <%= RenderResultsHtml() %>
</div>

</main>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/responsive/2.5.0/js/dataTables.responsive.min.js"></script>
<script src="md.js?v=20260111"></script>
</body>
</html>
