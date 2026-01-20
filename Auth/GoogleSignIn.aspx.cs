using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data.SqlClient;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Web;
using System.Web.Security;
using System.Web.Script.Serialization;

public partial class Auth_GoogleSignIn_aspx : System.Web.UI.Page
{
    private const string GOOGLE_CLIENT_ID_APPSETTING_KEY = "GoogleClientId";
    private const string MEDDB_CONNECTION_STRING_KEY = "MedDb";

    // Old cert endpoint returns PEM certificates (kid -> cert)
    private const string GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v1/certs";

    private static DateTime _certsExpireUtc = DateTime.MinValue;
    private static Dictionary<string, string> _kidToPemCert = null;

    protected void Page_Load(object sender, EventArgs e)
    {
        Response.ContentType = "text/plain";

        if (Request.HttpMethod != "POST")
        {
            Response.StatusCode = 405;
            Response.Write("POST only");
            Response.End();
            return;
        }

        string jwt = Request.Form["credential"];
        if (string.IsNullOrEmpty(jwt))
        {
            Response.StatusCode = 400;
            Response.Write("Missing credential");
            Response.End();
            return;
        }

        Dictionary<string, object> payload;
        try
        {
            payload = ValidateGoogleJwt(jwt);
        }
        catch (Exception ex)
        {
            Response.StatusCode = 401;
            Response.Write("Invalid: " + ex.Message);
            Response.End();
            return;
        }

        string email = payload.ContainsKey("email") ? (string)payload["email"] : null;
        if (string.IsNullOrWhiteSpace(email))
        {
            Response.StatusCode = 401;
            Response.Write("Invalid: No email");
            Response.End();
            return;
        }

        email = NormalizeEmail(email);

        try
        {
            string ip = GetClientIpAddress(Request);
            SaveUserAndLogin(email, ip);

            FormsAuthentication.SetAuthCookie(email, true);
            Response.StatusCode = 200;
            Response.Write("OK");
        }
        catch (Exception ex)
        {
            Response.StatusCode = 500;
            Response.Write("DB error: " + ex.Message);
        }

        Response.End();
    }

    private static string NormalizeEmail(string email)
    {
        email = (email ?? "").Trim();
        if (email.Length > 500) email = email.Substring(0, 500);
        return email.ToLowerInvariant();
    }

    private static string GetClientIpAddress(HttpRequest request)
    {
        if (request == null) return "";

        // Prefer first X-Forwarded-For value if present.
        string xff = request.ServerVariables["HTTP_X_FORWARDED_FOR"];
        string ip = null;
        if (!string.IsNullOrWhiteSpace(xff))
        {
            string[] parts = xff.Split(',');
            if (parts != null && parts.Length > 0)
                ip = (parts[0] ?? "").Trim();
        }

        if (string.IsNullOrWhiteSpace(ip))
            ip = request.UserHostAddress;

        ip = (ip ?? "").Trim();
        if (ip.Length > 200) ip = ip.Substring(0, 200);
        return ip;
    }

    private static string GetConnStr()
    {
        var cs = ConfigurationManager.ConnectionStrings[MEDDB_CONNECTION_STRING_KEY];
        if (cs == null || string.IsNullOrWhiteSpace(cs.ConnectionString))
            throw new InvalidOperationException("Missing connection string '" + MEDDB_CONNECTION_STRING_KEY + "' in web.config <connectionStrings>.");
        return cs.ConnectionString;
    }

    private static void SaveUserAndLogin(string email, string ipAddress)
    {
        var now = DateTime.UtcNow;
        var connStr = GetConnStr();

        using (var conn = new SqlConnection(connStr))
        {
            conn.Open();
            using (var tx = conn.BeginTransaction())
            {
                int userId = 0;
                using (var cmd = new SqlCommand("select top 1 UserId from AppUser with (updlock, holdlock) where Email = @Email", conn, tx))
                {
                    cmd.Parameters.AddWithValue("@Email", email);
                    object o = cmd.ExecuteScalar();
                    if (o != null && o != DBNull.Value)
                        userId = Convert.ToInt32(o);
                }

                if (userId <= 0)
                {
                    using (var cmd = new SqlCommand(@"insert into AppUser (Email, DateCreated, LastLoginDate)
values (@Email, @Now, @Now);
select cast(scope_identity() as int);", conn, tx))
                    {
                        cmd.Parameters.AddWithValue("@Email", email);
                        cmd.Parameters.AddWithValue("@Now", now);
                        userId = Convert.ToInt32(cmd.ExecuteScalar());
                    }
                }
                else
                {
                    using (var cmd = new SqlCommand("update AppUser set LastLoginDate = @Now where UserId = @UserId", conn, tx))
                    {
                        cmd.Parameters.AddWithValue("@Now", now);
                        cmd.Parameters.AddWithValue("@UserId", userId);
                        cmd.ExecuteNonQuery();
                    }
                }

                using (var cmd = new SqlCommand("insert into UserLogin (UserId, LoginDate, IpAddress) values (@UserId, @Now, @Ip)", conn, tx))
                {
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    cmd.Parameters.AddWithValue("@Now", now);
                    cmd.Parameters.AddWithValue("@Ip", (object)(ipAddress ?? ""));
                    cmd.ExecuteNonQuery();
                }

                tx.Commit();
            }
        }
    }

    private static Dictionary<string, object> ValidateGoogleJwt(string jwt)
    {
        string[] parts = jwt.Split('.');
        if (parts.Length != 3) throw new Exception("Bad JWT");

        string headerJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]));
        string payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
        byte[] signature = Base64UrlDecode(parts[2]);
        byte[] signedData = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);

        var jss = new JavaScriptSerializer();
        var header = jss.Deserialize<Dictionary<string, object>>(headerJson);
        var payload = jss.Deserialize<Dictionary<string, object>>(payloadJson);

        // header checks
        if (!header.ContainsKey("alg") || (string)header["alg"] != "RS256") throw new Exception("alg");
        string kid = header.ContainsKey("kid") ? (string)header["kid"] : null;
        if (string.IsNullOrEmpty(kid)) throw new Exception("kid");

        // claim checks
        string iss = payload.ContainsKey("iss") ? (string)payload["iss"] : null;
        if (iss != "https://accounts.google.com" && iss != "accounts.google.com") throw new Exception("iss");

        string aud = payload.ContainsKey("aud") ? (string)payload["aud"] : null;
        string clientId = GetGoogleClientIdFromConfig();
        if (aud != clientId) throw new Exception("aud");

        long exp = payload.ContainsKey("exp") ? Convert.ToInt64(payload["exp"]) : 0;
        long now = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
        if (exp < now) throw new Exception("exp");

        // verify signature using X509 cert (works on older .NET)
        string pemCert = GetGooglePemCert(kid);
        if (pemCert == null) throw new Exception("no cert");

        if (!VerifyRs256WithX509(signedData, signature, pemCert))
            throw new Exception("sig");

        return payload;
    }

    private static string GetGoogleClientIdFromConfig()
    {
        string clientId = ConfigurationManager.AppSettings[GOOGLE_CLIENT_ID_APPSETTING_KEY];
        if (string.IsNullOrWhiteSpace(clientId))
            throw new Exception("client_id");
        return clientId.Trim();
    }

    private static string GetGooglePemCert(string kid)
    {
        if (_kidToPemCert == null || DateTime.UtcNow >= _certsExpireUtc)
            RefreshCerts();

        return (_kidToPemCert != null && _kidToPemCert.ContainsKey(kid)) ? _kidToPemCert[kid] : null;
    }

    private static void RefreshCerts()
    {
        string json = DownloadString(GOOGLE_CERTS);
        var jss = new JavaScriptSerializer();
        _kidToPemCert = jss.Deserialize<Dictionary<string, string>>(json);

        _certsExpireUtc = DateTime.UtcNow.AddHours(6);
    }

    private static bool VerifyRs256WithX509(byte[] data, byte[] sig, string pemCert)
    {
        byte[] der = PemCertToDer(pemCert);
        var cert = new X509Certificate2(der);

        // .NET 4.x friendly: cert.PublicKey.Key is an RSACryptoServiceProvider
        var rsa = (RSACryptoServiceProvider)cert.PublicKey.Key;

        // VerifyData in older .NET uses OID string
        return rsa.VerifyData(data, "SHA256", sig);
    }

    private static byte[] PemCertToDer(string pem)
    {
        // Strip BEGIN/END lines and base64-decode
        string b64 = pem
            .Replace("-----BEGIN CERTIFICATE-----", "")
            .Replace("-----END CERTIFICATE-----", "")
            .Replace("\r", "")
            .Replace("\n", "")
            .Trim();

        return Convert.FromBase64String(b64);
    }

    private static byte[] Base64UrlDecode(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }

    private static string DownloadString(string url)
    {
        var req = (HttpWebRequest)WebRequest.Create(url);
        req.UserAgent = "WebForms";
        using (var resp = (HttpWebResponse)req.GetResponse())
        using (var sr = new StreamReader(resp.GetResponseStream()))
            return sr.ReadToEnd();
    }
}
