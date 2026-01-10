using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data.SqlClient;
using System.Globalization;
using System.Text;
using System.Web;
using System.Web.Script.Serialization;

public partial class outPatient : System.Web.UI.Page
{
    private static readonly string ConnStr = GetConnStr();

    private static string GetConnStr()
    {
        var cs = ConfigurationManager.ConnectionStrings["MedDb"];
        if (cs == null || string.IsNullOrWhiteSpace(cs.ConnectionString))
            throw new InvalidOperationException("Missing connection string 'MedDb' in web.config <connectionStrings>.");
        return cs.ConnectionString;
    }

    // Use fields (not auto-property initializers) for ASP.NET's C# 5 compiler compatibility.
    protected List<string> Counties = new List<string>();
    protected string[] CountiesSelected = new string[0];
    protected string CenterZip = "";
    protected string RadiusMilesRaw = "10";
    protected double RadiusMiles = 10;
    protected string CptRaw = "";

    protected List<string> ZipWithinRadius = new List<string>();
    protected string ZipModeError = null;
    protected bool ZipFilterRequested = false;

    protected void Page_Load(object sender, EventArgs e)
    {
        if (string.Equals(Request.QueryString["action"], "data", StringComparison.OrdinalIgnoreCase))
        {
            WriteCptDataJson();
            return;
        }

        if (string.Equals(Request.QueryString["action"], "search", StringComparison.OrdinalIgnoreCase))
        {
            // Needed so we can validate posted county selections even for AJAX searches.
            LoadCounties();
            BindInputsFromRequest();

            Response.ContentType = "text/html";
            Response.Write(RenderResultsHtml());
            Response.End();
            return;
        }

        LoadCounties();
        BindInputsFromRequest();
    }

    private void BindInputsFromRequest()
    {
        CountiesSelected = Request.Form.GetValues("county") ?? new string[0];
        CenterZip = (Request.Form["centerZip"] ?? "").ToString();
        RadiusMilesRaw = (Request.Form["radiusMiles"] ?? "10").ToString();
        CptRaw = (Request.Form["cpt"] ?? "").Trim();

        RadiusMiles = ParseRadiusMiles(Request.Form["radiusMiles"]);
        PrepareZipRadiusFilter();
    }

    protected string RenderCountyOptions()
    {
        var selected = new HashSet<string>(CountiesSelected ?? new string[0], StringComparer.OrdinalIgnoreCase);
        var sb = new StringBuilder();
        foreach (var c in Counties)
        {
            if (string.IsNullOrEmpty(c)) continue;
            var sel = selected.Contains(c) ? " selected" : "";
            sb.Append("<option value=\"")
              .Append(Html(c))
              .Append("\"")
              .Append(sel)
              .Append(">")
              .Append(Html(c))
              .Append("</option>");
        }
        return sb.ToString();
    }

    protected string RenderResultsHtml()
    {
        // Parse multiple CPT codes safely.
        // NOTE: This page intentionally builds dynamic SQL (no parameters) to avoid SQL Server's 2100-parameter limit
        // when radius searches return thousands of ZIP codes.
        var cptList = ParseCptList(CptRaw);

        var safeCounties = FilterCountiesToKnownList(CountiesSelected, Counties);
        var safeZips = FilterZips(ZipWithinRadius);

        bool countyFilterEnabled = safeCounties.Count > 0;
        bool zipFilterEnabled = ZipFilterRequested && safeZips.Count > 0;
        bool hasAnyLocationFilter = countyFilterEnabled || zipFilterEnabled;

        if (!hasAnyLocationFilter || cptList.Count == 0)
        {
            var sb = new StringBuilder();
            if (!string.IsNullOrEmpty(ZipModeError))
                sb.Append("<p style='color:#b02a37'>").Append(Html(ZipModeError)).Append("</p>");
            sb.Append("<p>Select County and/or Center ZIP + miles, enter CPT Code(s), then click Search.</p>");
            return sb.ToString();
        }

        // location filters
        var locationWhere = new StringBuilder();

        if (countyFilterEnabled)
        {
            locationWhere.Append(" and z.County in (").Append(BuildInListSql(safeCounties)).Append(")");
        }

        if (zipFilterEnabled)
        {
            locationWhere.Append(" and z.ZipCode in (").Append(BuildInListSql(safeZips)).Append(")");
        }

        string debugSql = null;

        string sql = @"
select d.FullName, count(*) cnt, 
	sum(case when year = 2020 then 1 end) [2020],
	sum(case when year = 2021 then 1 end) [2021],
	sum(case when year = 2022 then 1 end) [2022],
	sum(case when year = 2023 then 1 end) [2023],
	sum(case when year = 2024 then 1 end) [2024],
	'https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthCareProviders/Details?LicInd=' + convert(varchar, d.LicInd) + '&ProCde=' + convert(varchar, d.ProCde) AS URL
from AmbCpt a
	join Zip_Code z on z.ZIPCODE = a.ZIPCODE
	join lic_status d on d.LicenseNumber = a.OPER_PHYID
where a.OTHCPT in (" + BuildInListSql(cptList) + @")
    " + locationWhere + @"
group by d.FullName, d.LicInd, d.ProCde
order by 2 desc";

        debugSql = sql;

        var html = new StringBuilder();

        try
        {
            using (var conn = new SqlConnection(ConnStr))
            {
                conn.Open();
                using (var cmd = new SqlCommand(sql, conn))
                {
                    using (var rdr = cmd.ExecuteReader())
                    {
                        html.Append("<div class='table-responsive'>");
                        html.Append("<table class='table table-striped table-bordered sparkline-table'>");
                        html.Append("<thead><tr><th>Full Name</th><th>Count</th><th>Trend</th><th>2020</th><th>2021</th><th>2022</th><th>2023</th><th>2024</th></tr></thead><tbody>");

                        bool any = false;
                        while (rdr.Read())
                        {
                            any = true;
                            var full = rdr["FullName"] != DBNull.Value ? rdr["FullName"].ToString() : "";
                            if (!string.IsNullOrEmpty(full))
                            {
                                try { full = CultureInfo.CurrentCulture.TextInfo.ToTitleCase(full.ToLowerInvariant()); } catch { }
                            }

                            var url = rdr["URL"] != DBNull.Value ? rdr["URL"].ToString() : "";
                            var cnt = rdr["cnt"] != DBNull.Value ? rdr["cnt"].ToString() : "0";
                            var y2020 = rdr["2020"] != DBNull.Value ? rdr["2020"].ToString() : "0";
                            var y2021 = rdr["2021"] != DBNull.Value ? rdr["2021"].ToString() : "0";
                            var y2022 = rdr["2022"] != DBNull.Value ? rdr["2022"].ToString() : "0";
                            var y2023 = rdr["2023"] != DBNull.Value ? rdr["2023"].ToString() : "0";
                            var y2024 = rdr["2024"] != DBNull.Value ? rdr["2024"].ToString() : "0";

                            // build simple SVG sparkline for 5-year trend (2020-2024)
                            int v0 = 0, v1 = 0, v2 = 0, v3 = 0, v4 = 0;
                            int.TryParse(y2020, out v0);
                            int.TryParse(y2021, out v1);
                            int.TryParse(y2022, out v2);
                            int.TryParse(y2023, out v3);
                            int.TryParse(y2024, out v4);

                            int max = Math.Max(Math.Max(Math.Max(Math.Max(v0, v1), v2), v3), v4);
                            if (max == 0) max = 1;

                            int sw = 140, sh = 40, pad = 4;
                            var svgSb = new StringBuilder();
                            svgSb.Append("<svg width='140' height='40' viewBox='0 0 140 40' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='trend'>");
                            svgSb.Append("<polyline fill='none' stroke='#2b7cff' stroke-width='2' points='");

                            double[] vals = new double[] { v0, v1, v2, v3, v4 };
                            double[] xs = new double[5];
                            double[] ys = new double[5];

                            for (int i = 0; i < 5; i++)
                            {
                                double x = pad + ((sw - 2 * pad) * i / 4.0);
                                double y = pad + ((sh - 2 * pad) * (1.0 - (vals[i] / (double)max)));
                                xs[i] = x;
                                ys[i] = y;
                                svgSb.AppendFormat(CultureInfo.InvariantCulture, "{0},{1} ", x, y);
                            }

                            svgSb.Append("'/>");
                            for (int i = 0; i < 5; i++)
                            {
                                svgSb.AppendFormat(CultureInfo.InvariantCulture, "<circle cx='{0}' cy='{1}' r='2.2' fill='#2b7cff' />", xs[i], ys[i]);
                            }
                            svgSb.Append("</svg>");

                            var svg = svgSb.ToString();

                            html.Append("<tr><td>");
                            if (!string.IsNullOrEmpty(url))
                            {
                                html.Append("<a href=\"").Append(Html(url)).Append("\" target=\"_blank\" rel=\"noopener\" class=\"text-decoration-none\">");
                                html.Append(Html(full));
                                html.Append(" <i class='bi bi-box-arrow-up-right' style='font-size:0.8em'></i></a>");
                            }
                            else
                            {
                                html.Append(Html(full));
                            }
                            html.Append("</td><td>").Append(Html(cnt)).Append("</td><td>")
                                .Append(svg).Append("</td><td>").Append(Html(y2020)).Append("</td><td>").Append(Html(y2021))
                                .Append("</td><td>").Append(Html(y2022)).Append("</td><td>").Append(Html(y2023)).Append("</td><td>")
                                .Append(Html(y2024)).Append("</td></tr>");
                        }

                        if (!any)
                            html.Append("<tr><td colspan='8'>No rows returned</td></tr>");

                        html.Append("</tbody></table>");
                        html.Append("</div>");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            html.Append("<p style='color:red'>Error: ").Append(Html(ex.Message)).Append("</p>");
        }

        var showSql = string.Equals(Request.QueryString["showSql"], "1", StringComparison.OrdinalIgnoreCase);
        if (showSql && !string.IsNullOrEmpty(debugSql))
        {
            html.Append("<div class='mt-3'>");
            html.Append("<h6 class='mb-2'>SQL (debug)</h6>");
            html.Append("<pre style='white-space:pre-wrap;'>").Append(Html(debugSql)).Append("</pre>");
            html.Append("</div>");
        }

        return html.ToString();
    }

    private void LoadCounties()
    {
        Counties = new List<string>();
        try
        {
            using (var conn = new SqlConnection(ConnStr))
            {
                conn.Open();
                using (var cmd = new SqlCommand("select distinct County from Zip_Code where State = 'FL' order by 1", conn))
                using (var rdr = cmd.ExecuteReader())
                {
                    while (rdr.Read())
                    {
                        var c = rdr["County"] != DBNull.Value ? rdr["County"].ToString() : "";
                        if (!string.IsNullOrEmpty(c)) Counties.Add(c);
                    }
                }
            }
        }
        catch
        {
            // keep original behavior: swallow and show empty list
        }
    }

    private void WriteCptDataJson()
    {
        Response.ContentType = "application/json";

        var results = new List<Dictionary<string, object>>();
        try
        {
            using (var conn = new SqlConnection(ConnStr))
            {
                conn.Open();
                string sql = "select cptCode, section, subsection, coalesce(layDescription, longDesc, shortDesc) as combinedDesc, use_count from CPT where use_count > 0";
                using (var cmd = new SqlCommand(sql, conn))
                using (var rdr = cmd.ExecuteReader())
                {
                    while (rdr.Read())
                    {
                        var d = new Dictionary<string, object>();
                        d["cptCode"] = rdr["cptCode"] == DBNull.Value ? "" : rdr["cptCode"].ToString();
                        d["section"] = rdr["section"] == DBNull.Value ? "" : rdr["section"].ToString();
                        d["subsection"] = rdr["subsection"] == DBNull.Value ? "" : rdr["subsection"].ToString();
                        d["combinedDesc"] = rdr["combinedDesc"] == DBNull.Value ? "" : rdr["combinedDesc"].ToString();
                        d["use_count"] = rdr["use_count"] == DBNull.Value ? 0 : Convert.ToInt32(rdr["use_count"]);
                        results.Add(d);
                    }
                }
            }

            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(results));
        }
        catch (Exception ex)
        {
            var err = new { error = true, message = ex.Message };
            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Write(js.Serialize(err));
        }

        Response.End();
    }

    private void PrepareZipRadiusFilter()
    {
        ZipWithinRadius = new List<string>();
        ZipModeError = null;

        var centerZipInput = (Request.Form["centerZip"] ?? "").Trim();
        ZipFilterRequested = !string.IsNullOrWhiteSpace(centerZipInput);
        if (!ZipFilterRequested) return;

        // Basic cleanup: keep digits only, max 5
        var digits = new StringBuilder();
        foreach (char ch in centerZipInput)
        {
            if (ch >= '0' && ch <= '9') digits.Append(ch);
            if (digits.Length == 5) break;
        }

        var centerZipClean = digits.ToString();
        if (centerZipClean.Length != 5)
        {
            ZipModeError = "Enter a 5-digit Center ZIP.";
            return;
        }

        try
        {
            using (var conn = new SqlConnection(ConnStr))
            {
                conn.Open();
                // Dynamic SQL is safe here because Center ZIP is digits-only and RadiusMiles is clamped to [0,250].
                string zipSql = @"
;WITH Center AS (
    SELECT Latitude AS CenterLat, Longitude AS CenterLon
    FROM Zip_Code
    WHERE ZipCode = '" + centerZipClean + @"'
)
SELECT z.ZipCode
FROM Zip_Code z
CROSS JOIN Center c
WHERE 3959 * ACOS(
    CASE
        WHEN (
            COS(RADIANS(c.CenterLat)) * COS(RADIANS(z.Latitude)) * COS(RADIANS(z.Longitude) - RADIANS(c.CenterLon))
            + SIN(RADIANS(c.CenterLat)) * SIN(RADIANS(z.Latitude))
        ) > 1 THEN 1
        WHEN (
            COS(RADIANS(c.CenterLat)) * COS(RADIANS(z.Latitude)) * COS(RADIANS(z.Longitude) - RADIANS(c.CenterLon))
            + SIN(RADIANS(c.CenterLat)) * SIN(RADIANS(z.Latitude))
        ) < -1 THEN -1
        ELSE (
            COS(RADIANS(c.CenterLat)) * COS(RADIANS(z.Latitude)) * COS(RADIANS(z.Longitude) - RADIANS(c.CenterLon))
            + SIN(RADIANS(c.CenterLat)) * SIN(RADIANS(z.Latitude))
        )
    END
) <= " + RadiusMiles.ToString(CultureInfo.InvariantCulture) + @"
ORDER BY z.ZipCode;";

                using (var cmd = new SqlCommand(zipSql, conn))
                using (var rdr = cmd.ExecuteReader())
                {
                    while (rdr.Read())
                    {
                        var zc = rdr["ZipCode"] != DBNull.Value ? rdr["ZipCode"].ToString() : "";
                        if (!string.IsNullOrEmpty(zc)) ZipWithinRadius.Add(zc);
                    }
                }
            }

            if (ZipWithinRadius.Count == 0)
                ZipModeError = "No ZIP codes found within that radius (or Center ZIP not found).";
        }
        catch (Exception ex)
        {
            ZipModeError = "ZIP radius lookup error: " + ex.Message;
        }
    }

    private static double ParseRadiusMiles(string raw)
    {
        double radiusMiles = 10;
        var rm = (raw ?? "").Trim();
        double parsed;
        if (double.TryParse(rm, NumberStyles.Float, CultureInfo.CurrentCulture, out parsed) ||
            double.TryParse(rm, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
        {
            if (parsed < 0) parsed = 0;
            if (parsed > 250) parsed = 250;
            radiusMiles = parsed;
        }
        return radiusMiles;
    }

    private static List<string> ParseCptList(string cptRaw)
    {
        var cptList = new List<string>();
        if (string.IsNullOrEmpty(cptRaw)) return cptList;

        var parts = cptRaw.Split(new char[] { ',', ';', ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in parts)
        {
            var raw = (p ?? "").Trim();
            if (raw.Length == 0) continue;

            // Allow only A-Z, 0-9 to keep dynamic SQL safe.
            var sb = new StringBuilder();
            for (int i = 0; i < raw.Length; i++)
            {
                char ch = raw[i];
                if ((ch >= '0' && ch <= '9') ||
                    (ch >= 'A' && ch <= 'Z') ||
                    (ch >= 'a' && ch <= 'z'))
                {
                    sb.Append(ch);
                }
            }

            var code = sb.ToString().ToUpperInvariant();
            if (code.Length == 0) continue;
            if (code.Length > 10) continue;
            if (seen.Add(code)) cptList.Add(code);
        }

        return cptList;
    }

    private static string Html(string value)
    {
        return HttpUtility.HtmlEncode(value ?? "");
    }

    private static List<string> FilterCountiesToKnownList(string[] selected, List<string> known)
    {
        var result = new List<string>();
        if (selected == null || selected.Length == 0) return result;
        if (known == null || known.Count == 0) return result;

        var knownSet = new HashSet<string>(known, StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < selected.Length; i++)
        {
            var c = (selected[i] ?? "").Trim();
            if (c.Length == 0) continue;
            if (!knownSet.Contains(c)) continue;
            if (seen.Add(c)) result.Add(c);
        }

        return result;
    }

    private static List<string> FilterZips(List<string> zips)
    {
        var result = new List<string>();
        if (zips == null || zips.Count == 0) return result;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < zips.Count; i++)
        {
            var z = (zips[i] ?? "").Trim();
            if (z.Length != 5) continue;
            bool allDigits = true;
            for (int j = 0; j < 5; j++)
            {
                char ch = z[j];
                if (ch < '0' || ch > '9') { allDigits = false; break; }
            }
            if (!allDigits) continue;
            if (seen.Add(z)) result.Add(z);
        }

        return result;
    }

    private static string BuildInListSql(List<string> values)
    {
        // Builds: 'A','B','C'  (values are escaped for single quotes)
        // Caller must ensure values are validated/allowlisted.
        if (values == null || values.Count == 0) return "''";

        var sb = new StringBuilder();
        for (int i = 0; i < values.Count; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append(SqlStringLiteral(values[i]));
        }
        return sb.ToString();
    }

    private static string SqlStringLiteral(string value)
    {
        // Single-quoted SQL string literal with quote escaping.
        return "'" + (value ?? "").Replace("'", "''") + "'";
    }
}
