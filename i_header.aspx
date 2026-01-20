<%
    var currentPage = System.IO.Path.GetFileName(Request.Path ?? "").ToLowerInvariant();

    var isDefault = string.IsNullOrEmpty(currentPage) || currentPage == "default.aspx";
    var isOutPatient = currentPage == "outpatient.aspx";
    var isInPatient = currentPage == "inpatient.aspx";
    var isMd = currentPage == "md.aspx";

    var isAuthenticated = (Context != null && Context.User != null && Context.User.Identity != null && Context.User.Identity.IsAuthenticated);
%>

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
                <ul class="navbar-nav ms-lg-auto">
                    <li class="nav-item">
                        <a class="nav-link<%= isDefault ? " active" : "" %>" <%= isDefault ? "aria-current=\"page\"" : "" %> href="Default.aspx">Home</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link<%= isOutPatient ? " active" : "" %>" <%= isOutPatient ? "aria-current=\"page\"" : "" %> href="outPatient.aspx">Outpatient</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link<%= isInPatient ? " active" : "" %>" <%= isInPatient ? "aria-current=\"page\"" : "" %> href="inPatient.aspx">Inpatient</a>
                    </li>

                    <% if (isAuthenticated) { %>
                    <li class="nav-item">
                        <a class="nav-link<%= isMd ? " active" : "" %>" <%= isMd ? "aria-current=\"page\"" : "" %> href="md.aspx">Practitioners</a>
                    </li>
                    <% } %>
                </ul>

                <div class="d-flex align-items-center gap-2 ms-lg-3 mt-3 mt-lg-0" id="userLogin">
                    <% if (isAuthenticated) { %>
                        <span class="d-inline-flex align-items-center gap-2 border rounded-pill px-2 py-1 bg-light" title="Signed in">
                            <i class="bi bi-person-circle" aria-hidden="true"></i>
                            <span class="small"><%= System.Web.HttpUtility.HtmlEncode(Context.User.Identity.Name) %></span>
                        </span>
                        <a class="btn btn-outline-secondary btn-sm" href="Logout.aspx" aria-label="Log out">
                            <i class="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
                            Log out
                        </a>
                    <% } else { %>
                        <%
                            var googleClientId = System.Configuration.ConfigurationManager.AppSettings["GoogleClientId"];
                        %>

                        <% if (!string.IsNullOrWhiteSpace(googleClientId)) { %>
                            <script src="https://accounts.google.com/gsi/client" async defer></script>

                            <div id="g_id_onload"
                                data-client_id="<%= System.Web.HttpUtility.HtmlAttributeEncode(googleClientId.Trim()) %>"
                                data-callback="onGoogleCredential">
                            </div>

                            <div class="g_id_signin"
                                data-type="standard"
                                data-size="large"
                                data-theme="outline"
                                data-text="sign_in_with"
                                data-shape="rectangular"
                                data-logo_alignment="left">
                            </div>

                            <script>
                            async function onGoogleCredential(resp) {
                                const r = await fetch('/Auth/GoogleSignIn.aspx', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                    body: 'credential=' + encodeURIComponent(resp.credential)
                                });

                                const txt = await r.text();

                                if (!r.ok) {
                                    console.error('Login failed:', r.status, txt);
                                    alert('Login failed');
                                    return;
                                }

                                window.location.reload();
                            }
                            </script>
                        <% } else { %>
                            <a class="btn btn-outline-primary btn-sm" href="Login.aspx">Log in</a>
                        <% } %>
                    <% } %>
                </div>
            </div>
        </div>
    </nav>
</header>
