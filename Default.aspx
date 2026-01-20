<%@ Page Language="C#" AutoEventWireup="true" ResponseEncoding="utf-8" %>

<!DOCTYPE html>
<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Practitioner Search</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="Default.css?v=20260116" rel="stylesheet" />

    <% Response.WriteFile(Server.MapPath("~/ga4-snippet.html")); %>
</head>
<body>
    <a class="visually-hidden-focusable" href="#main">Skip to main content</a>

    <!--#INCLUDE FILE="i_header.aspx" -->

    <main id="main" class="flex-grow-1">
        <section class="hero">
            <div class="container">
                <div class="row align-items-center g-4">
                    <div class="col-12 col-lg-7">
                        <p class="text-uppercase text-primary fw-semibold small mb-2">Search portal</p>
                        <h1 class="display-5 fw-semibold text-dark mb-3">Find Practitioners by Experience. Trust Real Data, Not Marketing.</h1>
                        <p class="lead text-secondary mb-4">
                            Choose a dataset to start your search. Both tools support county filtering and optional radius searches by ZIP code.
                        </p>

                        <div class="d-flex flex-column flex-sm-row gap-2">

                            <a class="btn btn-outline-primary btn-lg" href="outPatient.aspx">
                                <i class="bi bi-hospital me-2" aria-hidden="true"></i>
                                Search Outpatient
                            </a>

                            <a class="btn btn-outline-primary btn-lg" href="inPatient.aspx">
                                <i class="bi bi-building me-2" aria-hidden="true"></i>
                                Search Inpatient
                            </a>

                            <% if (Context.User.Identity.IsAuthenticated) { %>

                            <a class="btn btn-outline-primary btn-lg" href="md.aspx">
                                <i class="bi bi-person-vcard me-2" aria-hidden="true"></i>
                                Search Practitioners
                            </a>

                            <% } %>
                        </div>

                        <% if (Context.User.Identity.IsAuthenticated == false) { %>
                            <div class="text-secondary small mt-2">Log in to see premium content.</div>
                        <% } %>

                    </div>

                    <div class="col-12 col-lg-5">
                        <div class="card shadow-sm border-0">
                            <div class="card-body p-4">
                                <div class="d-flex align-items-start gap-3">
                                    <div class="icon-badge bg-primary-subtle text-primary" aria-hidden="true">
                                        <i class="bi bi-search"></i>
                                    </div>
                                    <div>
                                        <h2 class="h5 mb-1">Two ways to search</h2>
                                        <p class="text-secondary mb-0">
                                            Outpatient uses CPT codes. Inpatient uses ICD-10 procedure codes.
                                        </p>
                                    </div>
                                </div>

                                <hr class="my-4" />

                                <div class="row g-3">
                                    <div class="col-12">
                                        <div class="d-flex gap-3">
                                            <div class="icon-badge bg-primary-subtle text-primary" aria-hidden="true">
                                                <i class="bi bi-geo-alt"></i>
                                            </div>
                                            <div>
                                                <div class="fw-semibold">Location filters</div>
                                                <div class="text-secondary small">Counties and optional ZIP radius.</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <div class="d-flex gap-3">
                                            <div class="icon-badge bg-primary-subtle text-primary" aria-hidden="true">
                                                <i class="bi bi-bar-chart"></i>
                                            </div>
                                            <div>
                                                <div class="fw-semibold">Yearly counts</div>
                                                <div class="text-secondary small">Results show totals and yearly breakdown from 2020 through 2024</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="py-5">
            <div class="container">
                <div class="row g-4">
                    <div class="col-12 col-lg-6">
                        <div class="card h-100 border-0 shadow-sm">
                            <div class="card-body p-4">
                                <div class="d-flex align-items-start justify-content-between gap-3">
                                    <div>
                                        <h2 class="h4 mb-2">Outpatient search</h2>
                                        <p class="text-secondary mb-3">Explore ambulatory procedures using CPT codes.</p>
                                    </div>
                                    <span class="badge text-bg-primary">CPT</span>
                                </div>
                                <ul class="text-secondary mb-4">
                                    <li>Pick one or more counties</li>
                                    <li>Optionally search within a ZIP radius</li>
                                    <li>Enter CPT code(s) and view top practitioners</li>
                                </ul>
                                <a class="btn btn-outline-primary" href="outPatient.aspx">Open Outpatient Search</a>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 col-lg-6">
                        <div class="card h-100 border-0 shadow-sm">
                            <div class="card-body p-4">
                                <div class="d-flex align-items-start justify-content-between gap-3">
                                    <div>
                                        <h2 class="h4 mb-2">Inpatient search</h2>
                                        <p class="text-secondary mb-3">Explore inpatient procedures using ICD-10 procedure codes.</p>
                                    </div>
                                    <span class="badge text-bg-primary">ICD-10</span>
                                </div>
                                <ul class="text-secondary mb-4">
                                    <li>Pick one or more counties</li>
                                    <li>Optionally search within a ZIP radius</li>
                                    <li>Enter ICD-10 procedure code(s) and view top practitioners</li>
                                </ul>
                                <a class="btn btn-outline-primary" href="inPatient.aspx">Open Inpatient Search</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer class="border-top bg-white">
        <div class="container py-4 d-flex flex-column flex-sm-row justify-content-between gap-2">
            <div class="text-secondary small">&copy; <%= DateTime.Now.Year %> Practitioner Search</div>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
