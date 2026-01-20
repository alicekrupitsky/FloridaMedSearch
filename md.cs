using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data.SqlClient;
using System.Text;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.UI;

public partial class md : System.Web.UI.Page
{
    private static readonly string ConnStr = GetConnStr();

    private string _profileError;
    private string _outpatientError;
    private string _inpatientError;

    private static readonly string ProfileSql = @"
         SELECT FullName,
             'https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthCareProviders/Details?LicInd=' + convert(varchar, LicInd) + '&ProCde=' + convert(varchar, ProCde) AS URL
         FROM dbo.lic_status
         WHERE LicenseNumber = @LicenseNumber";

    private static readonly string OutpatientSql = @"
         SELECT c.cptCode + ' - ' + COALESCE(c.shortDesc, c.layDescription, c.longDesc) AS Proc_Desc, 
             COUNT(*) AS cnt,
             SUM(CASE WHEN year = 2020 THEN 1 END) AS [2020],
             SUM(CASE WHEN year = 2021 THEN 1 END) AS [2021],
             SUM(CASE WHEN year = 2022 THEN 1 END) AS [2022],
             SUM(CASE WHEN year = 2023 THEN 1 END) AS [2023],
             SUM(CASE WHEN year = 2024 THEN 1 END) AS [2024]
         FROM dbo.AmbCpt a
         JOIN dbo.CPT c ON c.cptCode = a.OTHCPT
         WHERE a.OPER_PHYID = @LicenseNumber
         GROUP BY c.cptCode, COALESCE(c.shortDesc, c.layDescription, c.longDesc)
         HAVING COUNT(*) > 1
         ORDER BY 2 DESC";

    private static readonly string InpatientSql = @"
         SELECT p.Brutus_Desc AS Proc_Desc, 
             COUNT(*) AS cnt,
             SUM(CASE WHEN year = 2020 THEN 1 END) AS [2020],
             SUM(CASE WHEN year = 2021 THEN 1 END) AS [2021],
             SUM(CASE WHEN year = 2022 THEN 1 END) AS [2022],
             SUM(CASE WHEN year = 2023 THEN 1 END) AS [2023],
             SUM(CASE WHEN year = 2024 THEN 1 END) AS [2024]
         FROM dbo.InpProc a
         JOIN dbo.Procedures p ON p.Proc_Cd = a.OTHPROC
         WHERE a.OPER_PHYID = @LicenseNumber
         GROUP BY p.Brutus_Desc
         HAVING COUNT(*) > 1
         ORDER BY 2 DESC";

        private static readonly string LicenseLookupSql = @"
            SELECT z.County,
                   z.City,
                   a.LicenseNumber,
                   a.FullName,
                   CASE WHEN ud.UserId IS NULL THEN 0 ELSE 1 END AS IsStarred
            FROM lic_status a
            JOIN Zip_Code z ON z.ZIPCODE = a.ZIPCODE
            LEFT JOIN UserDoc ud ON ud.UserId = @UserId AND ud.LicenseNumber = a.LicenseNumber
            ORDER BY 1, 2";

    private static string GetConnStr()
    {
        var cs = ConfigurationManager.ConnectionStrings["MedDb"];
        if (cs == null || string.IsNullOrWhiteSpace(cs.ConnectionString))
            throw new InvalidOperationException("Missing connection string 'MedDb' in web.config <connectionStrings>.");
        return cs.ConnectionString;
    }

    protected string LicenseNumber = "";

    protected void Page_Load(object sender, EventArgs e)
    {
        var action = (Request.QueryString["action"] ?? "").Trim();

        if (Context.User.Identity.IsAuthenticated == false)
        {
            // For AJAX endpoints, return JSON instead of redirecting to HTML.
            if (string.Equals(action, "data", StringComparison.OrdinalIgnoreCase)
                || string.Equals(action, "search", StringComparison.OrdinalIgnoreCase)
                || string.Equals(action, "toggleStar", StringComparison.OrdinalIgnoreCase))
            {
                Response.StatusCode = 401;
                Response.ContentType = "application/json";
                var js = new JavaScriptSerializer();
                js.MaxJsonLength = int.MaxValue;
                Response.Write(js.Serialize(new { error = true, message = "Not authenticated." }));
                Response.End();
                return;
            }

            Response.Redirect("Default.aspx");
            return;
        }

        if (string.Equals(action, "data", StringComparison.OrdinalIgnoreCase))
        {
            WriteLicenseLookupJson();
            return;
        }

        if (string.Equals(action, "search", StringComparison.OrdinalIgnoreCase))
        {
            BindInputsFromRequest();
            Response.ContentType = "text/html";
            Response.Write(RenderResultsHtml());
            Response.End();
            return;
        }

        if (string.Equals(action, "toggleStar", StringComparison.OrdinalIgnoreCase))
        {
            WriteToggleStarJson();
            return;
        }

        BindInputsFromRequest();
    }

    private void WriteLicenseLookupJson()
    {
        Response.ContentType = "application/json";

        try
        {
            string userError;
            int userId = GetCurrentUserId(out userError);
            if (userId <= 0)
                throw new InvalidOperationException("Unable to resolve current user. " + (userError ?? ""));

            var rows = new List<LicenseLookupRow>();

            using (var conn = new SqlConnection(ConnStr))
            using (var cmd = new SqlCommand(LicenseLookupSql, conn))
            {
                cmd.CommandTimeout = 60;
                cmd.Parameters.Add("@UserId", System.Data.SqlDbType.Int).Value = userId;
                conn.Open();

                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        rows.Add(new LicenseLookupRow
                        {
                            County = ToTitleCase(reader["County"] as string ?? ""),
                            City = ToTitleCase(reader["City"] as string ?? ""),
                            LicenseNumber = reader["LicenseNumber"] as string ?? "",
                            FullName = ToTitleCase(reader["FullName"] as string ?? ""),
                            IsStarred = reader["IsStarred"] != DBNull.Value ? Convert.ToInt32(reader["IsStarred"]) : 0
                        });
                    }
                }
            }

            var payload = new { rows = rows };

            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(payload));
        }
        catch (Exception ex)
        {
            // Always return JSON (even on error) so the client doesn't end up showing an IIS HTML error page.
            Response.ContentType = "application/json";
            Response.StatusCode = 200;

            var err = new { error = true, message = ex.Message, rows = new LicenseLookupRow[0] };
            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(err));
        }
        finally
        {
            Response.End();
        }
    }

    private string ToTitleCase(string s) 
    {
        if (string.IsNullOrEmpty(s)) return "";

        try { 
            s = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(s.ToLowerInvariant()); 
        } catch { }
        return s;
    }

    private void WriteToggleStarJson()
    {
        Response.ContentType = "application/json";

        try
        {
            string userError;
            int userId = GetCurrentUserId(out userError);
            if (userId <= 0)
                throw new InvalidOperationException("Unable to resolve current user. " + (userError ?? ""));

            var license = (Request.Form["license"] ?? Request.Form["md"] ?? Request.QueryString["license"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(license) || license.Length > 50)
                throw new InvalidOperationException("Invalid license number.");

            bool isStarred;
            ToggleUserDoc(userId, license, out isStarred);

            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(new { ok = true, license = license, isStarred = isStarred }));
        }
        catch (Exception ex)
        {
            Response.ContentType = "application/json";
            Response.StatusCode = 200;

            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(new { error = true, message = ex.Message }));
        }
        finally
        {
            Response.End();
        }
    }

    private int GetCurrentUserId(out string error)
    {
        error = null;

        try
        {
            var email = (Context != null && Context.User != null && Context.User.Identity != null)
                ? (Context.User.Identity.Name ?? "")
                : "";

            email = (email ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email))
                return 0;

            using (var conn = new SqlConnection(ConnStr))
            using (var cmd = new SqlCommand("select top 1 UserId from AppUser where Email = @Email", conn))
            {
                cmd.Parameters.AddWithValue("@Email", email);
                conn.Open();
                object o = cmd.ExecuteScalar();
                if (o == null || o == DBNull.Value) return 0;
                return Convert.ToInt32(o);
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return 0;
        }
    }

    private void ToggleUserDoc(int userId, string licenseNumber, out bool isStarred)
    {
        isStarred = false;

        using (var conn = new SqlConnection(ConnStr))
        {
            conn.Open();
            using (var tx = conn.BeginTransaction())
            {
                bool exists = false;
                using (var check = new SqlCommand("select top 1 1 from UserDoc where UserId = @UserId and LicenseNumber = @LicenseNumber", conn, tx))
                {
                    check.Parameters.Add("@UserId", System.Data.SqlDbType.Int).Value = userId;
                    check.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.NVarChar, 50).Value = licenseNumber;
                    object o = check.ExecuteScalar();
                    exists = (o != null && o != DBNull.Value);
                }

                if (exists)
                {
                    using (var del = new SqlCommand("delete from UserDoc where UserId = @UserId and LicenseNumber = @LicenseNumber", conn, tx))
                    {
                        del.Parameters.Add("@UserId", System.Data.SqlDbType.Int).Value = userId;
                        del.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.NVarChar, 50).Value = licenseNumber;
                        del.ExecuteNonQuery();
                    }
                    isStarred = false;
                }
                else
                {
                    using (var ins = new SqlCommand("insert into UserDoc (UserId, LicenseNumber) values (@UserId, @LicenseNumber)", conn, tx))
                    {
                        ins.Parameters.Add("@UserId", System.Data.SqlDbType.Int).Value = userId;
                        ins.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.NVarChar, 50).Value = licenseNumber;
                        ins.ExecuteNonQuery();
                    }
                    isStarred = true;
                }

                tx.Commit();
            }
        }
    }

    private void BindInputsFromRequest()
    {
        // Prefer form input (search box) over query string.
        // This lets users open md.aspx?md=ME83126 and still type a new value and search.
        var fromForm = (Request.Form["md"] ?? "").Trim();
        var fromQuery = (Request.QueryString["md"] ?? "").Trim();
        LicenseNumber = (!string.IsNullOrWhiteSpace(fromForm) ? fromForm : fromQuery).ToUpperInvariant();
    }

    protected string RenderResultsHtml()
    {
        if (string.IsNullOrWhiteSpace(LicenseNumber))
        {
            return "<p>Enter a license number to view practitioner procedure history.</p>";
        }

        // Validate license number format (basic alphanumeric check)
        if (LicenseNumber.Length < 2 || LicenseNumber.Length > 20)
        {
            return "<p style='color:#b02a37'>Invalid license number format.</p>";
        }

        var showSql = string.Equals(Request.QueryString["showSql"], "1", StringComparison.OrdinalIgnoreCase);

        var sb = new StringBuilder();

        // Practitioner header
        string profileUrl;
        var fullName = GetPractitionerFullName(LicenseNumber, out profileUrl, out _profileError);
        fullName = ToTitleCase(fullName);

        sb.Append("<div class='card mb-4'>");
        sb.Append("<div class='card-body'>");
        sb.Append("<div class='d-flex flex-wrap align-items-center justify-content-between gap-2'>");
        sb.Append("<div>");
        sb.Append("<div class='text-muted small'>Practitioner</div>");
        if (!string.IsNullOrWhiteSpace(fullName))
        {
            sb.Append("<h4 class='mb-0'>").Append(Html(fullName)).Append("</h4>");
        }
        else
        {
            sb.Append("<h4 class='mb-0'>").Append(Html(LicenseNumber)).Append("</h4>");
        }
        if (!string.IsNullOrWhiteSpace(profileUrl))
        {
            sb.Append("<div class='mt-1'>");
            sb.Append("<a class='small link-primary' href='").Append(Html(profileUrl)).Append("' target='_blank' rel='noopener noreferrer'>");
            sb.Append("<i class='bi bi-box-arrow-up-right me-1'></i>Florida MQA profile</a>");
            sb.Append("</div>");
        }
        sb.Append("</div>");
        sb.Append("</div>");
        if (!string.IsNullOrWhiteSpace(_profileError) && showSql)
        {
            sb.Append("<div class='alert alert-warning mt-3 mb-0' role='alert'>");
            sb.Append("Profile query failed. See SQL (debug) below for details.");
            sb.Append("</div>");
        }
        sb.Append("</div>");
        sb.Append("</div>");

        // Inpatient (InpProc) section
        sb.Append("<div class='card mb-4'>");
        sb.Append("<div class='card-header bg-primary text-white'>");
        sb.Append("<h5 class='mb-0'><i class='bi bi-building me-2'></i>Inpatient Procedures (ICD-10 Codes)</h5>");
        sb.Append("</div>");
        sb.Append("<div class='card-body'>");

        var inpatientData = GetInpatientData(LicenseNumber, out _inpatientError);
        if (!string.IsNullOrWhiteSpace(_inpatientError) && showSql)
        {
            sb.Append("<div class='alert alert-warning' role='alert'>");
            sb.Append("Inpatient query failed. See SQL (debug) below for details.");
            sb.Append("</div>");
        }
        if (inpatientData.Count > 0)
        {
            sb.Append("<div class='table-responsive'>");
            sb.Append("<table class='table table-hover table-striped'>");
            sb.Append("<thead class='table-light'>");
            sb.Append("<tr>");
            sb.Append("<th>Procedure Description</th>");
            sb.Append("<th class='text-end'>Total</th>");
            sb.Append("<th class='text-end'>Trend</th>");
            sb.Append("<th class='text-end'>2020</th>");
            sb.Append("<th class='text-end'>2021</th>");
            sb.Append("<th class='text-end'>2022</th>");
            sb.Append("<th class='text-end'>2023</th>");
            sb.Append("<th class='text-end'>2024</th>");
            sb.Append("</tr>");
            sb.Append("</thead>");
            sb.Append("<tbody>");

            foreach (var row in inpatientData)
            {
                sb.Append("<tr>");
                sb.Append("<td>").Append(Html(row.ProcDesc)).Append("</td>");
                sb.Append("<td class='text-end'><strong>").Append(row.Count).Append("</strong></td>");
                sb.Append("<td class='text-end'>").Append(RenderSparkline(row.Year2020, row.Year2021, row.Year2022, row.Year2023, row.Year2024)).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2020).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2021).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2022).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2023).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2024).Append("</td>");
                sb.Append("</tr>");
            }

            sb.Append("</tbody>");
            sb.Append("</table>");
            sb.Append("</div>");
        }
        else
        {
            sb.Append("<p class='text-muted'>No inpatient procedure records found for this license number.</p>");
        }

        sb.Append("</div>");
        sb.Append("</div>");

        // Outpatient (AmbCpt) section
        sb.Append("<div class='card mb-4'>");
        sb.Append("<div class='card-header bg-primary text-white'>");
        sb.Append("<h5 class='mb-0'><i class='bi bi-hospital me-2'></i>Outpatient Procedures (CPT Codes)</h5>");
        sb.Append("</div>");
        sb.Append("<div class='card-body'>");

        var outpatientData = GetOutpatientData(LicenseNumber, out _outpatientError);
        if (!string.IsNullOrWhiteSpace(_outpatientError) && showSql)
        {
            sb.Append("<div class='alert alert-warning' role='alert'>");
            sb.Append("Outpatient query failed. See SQL (debug) below for details.");
            sb.Append("</div>");
        }
        if (outpatientData.Count > 0)
        {
            sb.Append("<div class='table-responsive'>");
            sb.Append("<table class='table table-hover table-striped'>");
            sb.Append("<thead class='table-light'>");
            sb.Append("<tr>");
            sb.Append("<th>Procedure Description</th>");
            sb.Append("<th class='text-end'>Total</th>");
            sb.Append("<th class='text-end'>Trend</th>");
            sb.Append("<th class='text-end'>2020</th>");
            sb.Append("<th class='text-end'>2021</th>");
            sb.Append("<th class='text-end'>2022</th>");
            sb.Append("<th class='text-end'>2023</th>");
            sb.Append("<th class='text-end'>2024</th>");
            sb.Append("</tr>");
            sb.Append("</thead>");
            sb.Append("<tbody>");

            foreach (var row in outpatientData)
            {
                sb.Append("<tr>");
                sb.Append("<td>").Append(Html(row.ProcDesc)).Append("</td>");
                sb.Append("<td class='text-end'><strong>").Append(row.Count).Append("</strong></td>");
                sb.Append("<td class='text-end'>").Append(RenderSparkline(row.Year2020, row.Year2021, row.Year2022, row.Year2023, row.Year2024)).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2020).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2021).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2022).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2023).Append("</td>");
                sb.Append("<td class='text-end'>").Append(row.Year2024).Append("</td>");
                sb.Append("</tr>");
            }

            sb.Append("</tbody>");
            sb.Append("</table>");
            sb.Append("</div>");
        }
        else
        {
            sb.Append("<p class='text-muted'>No outpatient procedure records found for this license number.</p>");
        }

        sb.Append("</div>");
        sb.Append("</div>");

        if (showSql)
        {
            sb.Append("<div class='mt-3'>");
            sb.Append("<h6 class='mb-2'>SQL (debug)</h6>");
            sb.Append("<pre style='white-space:pre-wrap;'>");
            if (!string.IsNullOrWhiteSpace(_profileError))
            {
                sb.Append("-- Profile error\n");
                sb.Append(Html(_profileError)).Append("\n\n");
            }
            if (!string.IsNullOrWhiteSpace(_outpatientError))
            {
                sb.Append("-- Outpatient error\n");
                sb.Append(Html(_outpatientError)).Append("\n\n");
            }
            if (!string.IsNullOrWhiteSpace(_inpatientError))
            {
                sb.Append("-- Inpatient error\n");
                sb.Append(Html(_inpatientError)).Append("\n\n");
            }
            sb.Append("-- Params\n");
            sb.Append("@LicenseNumber = '").Append(Html(LicenseNumber)).Append("'\n\n");

            sb.Append("-- Profile\n");
            sb.Append(Html(ProfileSql)).Append("\n\n");
            sb.Append("-- Outpatient\n");
            sb.Append(Html(OutpatientSql)).Append("\n\n");
            sb.Append("-- Inpatient\n");
            sb.Append(Html(InpatientSql));
            sb.Append("</pre>");
            sb.Append("</div>");
        }

        return sb.ToString();
    }

    private string GetPractitionerFullName(string licenseNumber, out string profileUrl, out string error)
    {
        profileUrl = null;
        error = null;
        try
        {
            using (var conn = new SqlConnection(ConnStr))
            using (var cmd = new SqlCommand(ProfileSql, conn))
            {
                var p = cmd.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.VarChar, 20);
                p.Value = licenseNumber;
                conn.Open();

                using (var rdr = cmd.ExecuteReader())
                {
                    if (!rdr.Read()) return null;

                    var full = rdr["FullName"] != DBNull.Value ? Convert.ToString(rdr["FullName"]) : null;
                    var url = rdr["URL"] != DBNull.Value ? Convert.ToString(rdr["URL"]) : null;

                    if (!string.IsNullOrWhiteSpace(url)) profileUrl = url.Trim();
                    return string.IsNullOrWhiteSpace(full) ? null : full.Trim();
                }
            }
        }
        catch (Exception ex)
        {
            error = ex.ToString();
            System.Diagnostics.Debug.WriteLine("Error fetching profile full name: " + ex);
            return null;
        }
    }

    private List<ProcedureRow> GetOutpatientData(string licenseNumber, out string error)
    {
        error = null;
        var results = new List<ProcedureRow>();

        try
        {
            using (var conn = new SqlConnection(ConnStr))
            using (var cmd = new SqlCommand(OutpatientSql, conn))
            {
                var p = cmd.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.VarChar, 20);
                p.Value = licenseNumber;
                conn.Open();

                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        results.Add(new ProcedureRow
                        {
                            ProcDesc = reader["Proc_Desc"] as string ?? "",
                            Count = reader["cnt"] != DBNull.Value ? Convert.ToInt32(reader["cnt"]) : 0,
                            Year2020 = reader["2020"] != DBNull.Value ? Convert.ToInt32(reader["2020"]) : 0,
                            Year2021 = reader["2021"] != DBNull.Value ? Convert.ToInt32(reader["2021"]) : 0,
                            Year2022 = reader["2022"] != DBNull.Value ? Convert.ToInt32(reader["2022"]) : 0,
                            Year2023 = reader["2023"] != DBNull.Value ? Convert.ToInt32(reader["2023"]) : 0,
                            Year2024 = reader["2024"] != DBNull.Value ? Convert.ToInt32(reader["2024"]) : 0
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            // Log error (in production, use proper logging)
            error = ex.ToString();
            System.Diagnostics.Debug.WriteLine("Error fetching outpatient data: " + ex);
        }

        return results;
    }

    private List<ProcedureRow> GetInpatientData(string licenseNumber, out string error)
    {
        error = null;
        var results = new List<ProcedureRow>();

        try
        {
            using (var conn = new SqlConnection(ConnStr))
            using (var cmd = new SqlCommand(InpatientSql, conn))
            {
                var p = cmd.Parameters.Add("@LicenseNumber", System.Data.SqlDbType.VarChar, 20);
                p.Value = licenseNumber;
                conn.Open();

                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        results.Add(new ProcedureRow
                        {
                            ProcDesc = reader["Proc_Desc"] as string ?? "",
                            Count = reader["cnt"] != DBNull.Value ? Convert.ToInt32(reader["cnt"]) : 0,
                            Year2020 = reader["2020"] != DBNull.Value ? Convert.ToInt32(reader["2020"]) : 0,
                            Year2021 = reader["2021"] != DBNull.Value ? Convert.ToInt32(reader["2021"]) : 0,
                            Year2022 = reader["2022"] != DBNull.Value ? Convert.ToInt32(reader["2022"]) : 0,
                            Year2023 = reader["2023"] != DBNull.Value ? Convert.ToInt32(reader["2023"]) : 0,
                            Year2024 = reader["2024"] != DBNull.Value ? Convert.ToInt32(reader["2024"]) : 0
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            // Log error (in production, use proper logging)
            error = ex.ToString();
            System.Diagnostics.Debug.WriteLine("Error fetching inpatient data: " + ex);
        }

        return results;
    }

    private static string Html(string value)
    {
        return HttpUtility.HtmlEncode(value ?? "");
    }

    private static string RenderSparkline(int y2020, int y2021, int y2022, int y2023, int y2024)
    {
        int[] vals = new int[] { y2020, y2021, y2022, y2023, y2024 };
        int max = 0;
        for (int i = 0; i < vals.Length; i++)
            if (vals[i] > max) max = vals[i];
        if (max == 0) max = 1;

        int sw = 140, sh = 40, pad = 4;
        var svgSb = new StringBuilder();
        svgSb.Append("<svg width='140' height='40' viewBox='0 0 140 40' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='trend'>");
        svgSb.Append("<polyline fill='none' stroke='#2b7cff' stroke-width='2' points='");

        double[] xs = new double[5];
        double[] ys = new double[5];

        for (int i = 0; i < 5; i++)
        {
            double x = pad + ((sw - 2 * pad) * i / 4.0);
            double y = pad + ((sh - 2 * pad) * (1.0 - (vals[i] / (double)max)));
            xs[i] = x;
            ys[i] = y;
            svgSb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "{0},{1} ", x, y);
        }

        svgSb.Append("'/>");
        for (int i = 0; i < 5; i++)
        {
            svgSb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "<circle cx='{0}' cy='{1}' r='2.2' fill='#2b7cff' />", xs[i], ys[i]);
        }
        svgSb.Append("</svg>");

        return svgSb.ToString();
    }

    private class ProcedureRow
    {
        public string ProcDesc { get; set; }
        public int Count { get; set; }
        public int Year2020 { get; set; }
        public int Year2021 { get; set; }
        public int Year2022 { get; set; }
        public int Year2023 { get; set; }
        public int Year2024 { get; set; }
    }

    private class LicenseLookupRow
    {
        public string County { get; set; }
        public string City { get; set; }
        public string LicenseNumber { get; set; }
        public string FullName { get; set; }
        public int IsStarred { get; set; }
    }
}
