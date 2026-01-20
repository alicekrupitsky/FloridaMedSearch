<%@ Page Language="C#" AutoEventWireup="true" %>
<%
    var returnUrl = Request.QueryString["ReturnUrl"];
    if (!string.IsNullOrEmpty(returnUrl))
        Response.Redirect("Default.aspx?ReturnUrl=" + Server.UrlEncode(returnUrl));
    else
        Response.Redirect("Default.aspx");
%>
