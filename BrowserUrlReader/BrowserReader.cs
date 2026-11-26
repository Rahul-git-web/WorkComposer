using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Interop.UIAutomationClient;

public class BrowserReader
{

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId);

    public BrowserInfo? GetActiveBrowser()
    {
        try
        {
            var automation = new CUIAutomation8();

            IntPtr hwnd = GetForegroundWindow();

            if (hwnd == IntPtr.Zero)
                return null;

            var root = automation.ElementFromHandle(hwnd);

            if (root == null)
                return null;

            GetWindowThreadProcessId(hwnd, out uint pid);

            string processName;

            try
            {
                processName = Process
                    .GetProcessById((int)pid)
                    .ProcessName
                    .ToLowerInvariant();
            }
            catch
            {
                return null;
            }

            return processName switch
            {
                // Existing Chromium browsers
                "chrome" =>
                    ReadChromiumBrowser(
                        root,
                        automation,
                        processName,
                        "OmniboxViewViews"),

                "brave" =>
                    ReadChromiumBrowser(
                        root,
                        automation,
                        processName,
                        "BraveOmniboxViewViews"),

                "msedge" =>
                    ReadChromiumBrowser(
                        root,
                        automation,
                        processName,
                        "OmniboxViewViews"),

                "opera" =>
                    ReadChromiumBrowser(
                        root,
                        automation,
                        processName,
                        "OmniboxViewViews"),

                // Vivaldi
                "vivaldi" =>
                    ReadVivaldiBrowser(
                        root,
                        automation),

                // Firefox
                "firefox" =>
                    ReadFirefoxBrowser(
                        root,
                        automation),

                // Unsupported process
                _ => null
            };
        }
        catch
        {
            // Browser reader must NEVER crash WorkComposer.
            return null;
        }
    }

    // ================================================================
    // CHROMIUM
    // ================================================================

    private BrowserInfo ReadChromiumBrowser(
        IUIAutomationElement root,
        IUIAutomation automation,
        string processName,
        string omniboxClass)
    {
        var browser = new BrowserInfo
        {
            Browser = processName,
            Title = CleanTitle(
                root.CurrentName,
                processName)
        };

        if (string.IsNullOrEmpty(omniboxClass))
            return browser;

        var omnibox = FindElementByClass(
            root,
            automation,
            omniboxClass);

        if (omnibox == null)
            return browser;

        try
        {
            var valuePattern =
                (IUIAutomationValuePattern)
                omnibox.GetCurrentPattern(
                    UIA_PatternIds.UIA_ValuePatternId);

            browser.Url =
                (valuePattern.CurrentValue ?? "").Trim();

            browser.Domain =
                ExtractDomain(browser.Url);
        }
        catch
        {
            browser.Domain = browser.Url;
        }

        return browser;
    }

    // ================================================================
    // VIVALDI
    // ================================================================

    private BrowserInfo ReadVivaldiBrowser(
       IUIAutomationElement root,
       IUIAutomation automation)
    {
        var browser = new BrowserInfo
        {
            Browser = "vivaldi",
            Title = CleanTitle(
                root.CurrentName,
                "vivaldi")
        };

        try
        {
            var urlBar = FindElementByAutomationId(
                root,
                automation,
                "urlFieldInput");

            if (urlBar == null)
                return browser;

            try
            {
                var valuePattern =
                    (IUIAutomationValuePattern)
                    urlBar.GetCurrentPattern(
                        UIA_PatternIds.UIA_ValuePatternId);

                browser.Url =
                    (valuePattern.CurrentValue ?? "").Trim();

                browser.Domain =
                    ExtractDomain(browser.Url);
            }
            catch
            {
                browser.Domain = browser.Url;
            }
        }
        catch
        {
            browser.Domain = browser.Url;
        }

        return browser;
    }

    // ================================================================
    // FIREFOX
    // ================================================================

    private BrowserInfo ReadFirefoxBrowser(
        IUIAutomationElement root,
        IUIAutomation automation)
    {
        var browser = new BrowserInfo
        {
            Browser = "firefox",
            Title = CleanTitle(
                root.CurrentName,
                "firefox")
        };

        IUIAutomationElement? urlBar = null;

        try
        {
            // --------------------------------------------------------
            // Strategy 1:
            // Firefox normally exposes its URL input as:
            //
            // AutomationId = "urlbar-input"
            //
            // This is the preferred method because it is not dependent
            // on the user's language.
            // --------------------------------------------------------

            urlBar = FindElementByAutomationId(
                root,
                automation,
                "urlbar-input");

            // --------------------------------------------------------
            // Strategy 2:
            // Look inside Firefox's navigation toolbar.
            //
            // This gives us another layer of protection if Firefox
            // exposes the URL bar differently.
            // --------------------------------------------------------

            if (urlBar == null)
            {
                var navigationBar =
                    FindElementByAutomationId(
                        root,
                        automation,
                        "nav-bar");

                if (navigationBar != null)
                {
                    urlBar = FindEditControl(
                        navigationBar,
                        automation);
                }
            }

            // --------------------------------------------------------
            // Strategy 3:
            // Firefox has historically exposed the address field with
            // the name "Search or enter address".
            //
            // This is only a fallback because the name can vary by
            // Firefox language/version.
            // --------------------------------------------------------

            if (urlBar == null)
            {
                urlBar = FindFirefoxAddressEdit(
                    root,
                    automation);
            }

            if (urlBar == null)
                return browser;

            // --------------------------------------------------------
            // Read URL
            // --------------------------------------------------------

            var valuePattern =
                (IUIAutomationValuePattern)
                urlBar.GetCurrentPattern(
                    UIA_PatternIds.UIA_ValuePatternId);

            string url = valuePattern.CurrentValue ?? "";

            browser.Url = url.Trim();

            browser.Domain = ExtractDomain(
                browser.Url);
        }
        catch
        {
            // Firefox URL reading failure must not break tracking.
            browser.Domain = browser.Url;
        }

        return browser;
    }

    // ================================================================
    // FIREFOX HELPERS
    // ================================================================

    private IUIAutomationElement? FindElementByAutomationId(
        IUIAutomationElement element,
        IUIAutomation automation,
        string automationId)
    {
        try
        {
            var condition =
                automation.CreatePropertyCondition(
                    UIA_PropertyIds.UIA_AutomationIdPropertyId,
                    automationId);

            return element.FindFirst(
                TreeScope.TreeScope_Descendants,
                condition);
        }
        catch
        {
            return null;
        }
    }

    private IUIAutomationElement? FindEditControl(
        IUIAutomationElement element,
        IUIAutomation automation)
    {
        try
        {
            var condition =
                automation.CreatePropertyCondition(
                    UIA_PropertyIds.UIA_ControlTypePropertyId,
                    UIA_ControlTypeIds.UIA_EditControlTypeId);

            return element.FindFirst(
                TreeScope.TreeScope_Descendants,
                condition);
        }
        catch
        {
            return null;
        }
    }

    private IUIAutomationElement? FindFirefoxAddressEdit(
        IUIAutomationElement element,
        IUIAutomation automation)
    {
        try
        {
            var nameCondition =
                automation.CreatePropertyCondition(
                    UIA_PropertyIds.UIA_NamePropertyId,
                    "Search or enter address");

            var typeCondition =
                automation.CreatePropertyCondition(
                    UIA_PropertyIds.UIA_ControlTypePropertyId,
                    UIA_ControlTypeIds.UIA_EditControlTypeId);

            var condition =
                automation.CreateAndCondition(
                    nameCondition,
                    typeCondition);

            return element.FindFirst(
                TreeScope.TreeScope_Descendants,
                condition);
        }
        catch
        {
            return null;
        }
    }

    // ================================================================
    // EXISTING CHROMIUM ELEMENT SEARCH
    // ================================================================

    private IUIAutomationElement? FindElementByClass(
        IUIAutomationElement element,
        IUIAutomation automation,
        string className)
    {
        try
        {
            if (element.CurrentClassName == className)
                return element;

            var children = element.FindAll(
                TreeScope.TreeScope_Children,
                automation.CreateTrueCondition());

            for (int i = 0; i < children.Length; i++)
            {
                var result = FindElementByClass(
                    children.GetElement(i),
                    automation,
                    className);

                if (result != null)
                    return result;
            }
        }
        catch
        {
            // Ignore individual UI Automation failures.
        }

        return null;
    }

    // ================================================================
    // DOMAIN
    // ================================================================

    private string ExtractDomain(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return "";

        try
        {
            string normalizedUrl = url.Trim();

            if (!normalizedUrl.StartsWith(
                    "http://",
                    StringComparison.OrdinalIgnoreCase) &&
                !normalizedUrl.StartsWith(
                    "https://",
                    StringComparison.OrdinalIgnoreCase))
            {
                normalizedUrl = "https://" + normalizedUrl;
            }

            return new Uri(normalizedUrl).Host;
        }
        catch
        {
            return url;
        }
    }

    // ================================================================
    // TITLE CLEANING
    // ================================================================

    private string CleanTitle(
        string title,
        string browser)
    {
        if (string.IsNullOrWhiteSpace(title))
            return "";

        return browser switch
        {
            "chrome" =>
                title.Replace(
                    " - Google Chrome",
                    ""),

            "brave" =>
                title.Replace(
                    " - Brave",
                    ""),

            "msedge" =>
                title
                    .Replace(
                        " - Microsoft Edge",
                        "")
                    .Replace(
                        " - Microsoft​ Edge",
                        ""),

            "opera" =>
                title.Replace(
                    " - Opera",
                    ""),

            "vivaldi" =>
    title.Replace(
    " - Vivaldi",
    ""),

            "firefox" =>
                title
                    .Replace(
                        " - Mozilla Firefox",
                        "")
                    .Replace(
                        " — Mozilla Firefox",
                        ""),

            _ => title
        };
    }
}