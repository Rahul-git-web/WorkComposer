using System;
using System.Diagnostics;

public class MacBrowserReader
{
    public BrowserInfo? GetActiveBrowser()
    {
        // This reader is only intended for macOS.
        if (!OperatingSystem.IsMacOS())
            return null;

        try
        {
            string? frontmostApp = RunAppleScript(
    """
    tell application "System Events"
        set frontApp to first application process whose frontmost is true
        return bundle identifier of frontApp
    end tell
    """
);

            if (string.IsNullOrWhiteSpace(frontmostApp))
                return null;

            string appBundleId = frontmostApp.Trim();

            if (appBundleId.Equals("com.apple.Safari", StringComparison.OrdinalIgnoreCase))
                return ReadSafari();

            if (appBundleId.Equals("com.google.Chrome", StringComparison.OrdinalIgnoreCase))
                return ReadChromiumBrowser("Google Chrome");

            if (appBundleId.Equals("com.microsoft.edgemac", StringComparison.OrdinalIgnoreCase))
                return ReadChromiumBrowser("Microsoft Edge");

            if (appBundleId.Equals("com.brave.Browser", StringComparison.OrdinalIgnoreCase))
                return ReadChromiumBrowser("Brave Browser");

            if (appBundleId.Equals("com.operasoftware.Opera", StringComparison.OrdinalIgnoreCase))
                return ReadChromiumBrowser("Opera");

            if (appBundleId.Equals("org.mozilla.firefox", StringComparison.OrdinalIgnoreCase))
                return ReadFirefox();

            return null;
        }
        catch
        {
            // Browser reader must NEVER crash WorkComposer.
            return null;
        }
    }

    // ================================================================
    // SAFARI
    // ================================================================

    private BrowserInfo? ReadSafari()
    {
        string? result = RunAppleScript(
            """
            tell application "Safari"
                if (count of windows) is 0 then
                    return ""
                end if

                set currentTab to current tab of front window

                set pageTitle to name of currentTab
                set pageUrl to URL of currentTab

                return pageTitle & linefeed & pageUrl
            end tell
            """
        );

        return ParseBrowserResult(
            "safari",
            result
        );
    }

    // ================================================================
    // CHROMIUM BROWSERS
    // ================================================================

    private BrowserInfo? ReadChromiumBrowser(string browserName)
    {
        string? result = RunAppleScript(
            $"""
            tell application "{EscapeAppleScriptString(browserName)}"
                if (count of windows) is 0 then
                    return ""
                end if

                set currentTab to active tab of front window

                set pageTitle to title of currentTab
                set pageUrl to URL of currentTab

                return pageTitle & linefeed & pageUrl
            end tell
            """
        );

        return ParseBrowserResult(
            browserName.ToLowerInvariant(),
            result
        );
    }

    // ================================================================
    // FIREFOX
    // ================================================================

    private BrowserInfo? ReadFirefox()
    {
        // Firefox URL extraction on macOS is not implemented yet.
        // Return null rather than returning an incomplete BrowserInfo.
        return null;
    }

    // ================================================================
    // RESULT PARSER
    // ================================================================

    private BrowserInfo? ParseBrowserResult(
        string browser,
        string? result)
    {
        if (string.IsNullOrWhiteSpace(result))
            return null;

        string[] lines = result
            .Replace("\r", "")
            .Split('\n');

        if (lines.Length < 2)
            return null;

        string title = lines[0].Trim();
        string url = lines[1].Trim();

        return new BrowserInfo
        {
            Browser = browser,
            Title = title,
            Url = url,
            Domain = ExtractDomain(url)
        };
    }

    // ================================================================
    // DOMAIN
    // ================================================================

    private static string ExtractDomain(string url)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(url))
                return "";

            var uri = new Uri(url);

            return uri.Host
                .Replace("www.", "", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return url;
        }
    }

    // ================================================================
    // APPLESCRIPT
    // ================================================================

    private static string? RunAppleScript(string script)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "osascript",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            startInfo.ArgumentList.Add("-e");
            startInfo.ArgumentList.Add(script);

            using var process = Process.Start(startInfo);

            if (process == null)
                return null;

            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            if (process.ExitCode != 0)
                return null;

            return output.Trim();
        }
        catch
        {
            return null;
        }
    }

    private static string EscapeAppleScriptString(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");
    }
}