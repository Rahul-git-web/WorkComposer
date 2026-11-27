# Native Browser URL & Location Readers (.NET 8)

Lightweight **.NET 8** console helpers that return structured JSON to **WorkComposer Desktop** (`electron/main.js`) for active-browser URL inspection (Windows & macOS) and Windows device geolocation.

> Desktop integration guide: see [../WorkComposer Desktop/README.md](../WorkComposer%20Desktop/README.md) · Root guide: see [../README.md](../README.md)

---

## Overview of Native Helpers

| Helper | Project File | Target Framework | Platform Mechanism | Consumer (`WorkComposer Desktop/electron/main.js`) |
| --- | --- | --- | --- | --- |
| **BrowserUrlReader (Windows)** | [`BrowserUrlReader.csproj`](./BrowserUrlReader.csproj) | `net8.0-windows` (`win-x64`, self-contained single file) | Windows UIAutomation (`Interop.UIAutomationClient` `10.19041.0`) | `BrowserUrlReader.exe` |
| **MacBrowserReader (macOS)** | [`Mac/Mac.csproj`](./Mac/Mac.csproj) | `net8.0` | AppleScript (`System Events` + browser tabs) | `MacBrowserReader/<arm64\|x64>/Mac` |
| **LocationReader (Windows)** | [`../WorkComposer Desktop/resources/LocationReader/LocationReader.csproj`](../WorkComposer%20Desktop/resources/LocationReader/LocationReader.csproj) | `net8.0-windows10.0.19041.0` | WinRT `Windows.Devices.Geolocation.Geolocator` (`Microsoft.Windows.CsWinRT` `2.2.0`) | `LocationReader/LocationReader.exe` |

---

## 1. Windows Browser URL Reader (`BrowserUrlReader/`)

### Supported Browsers (`BrowserReader.cs`)
Inspects the active foreground window via UIAutomation without crashing (`GetActiveBrowser()` catches errors and returns `null`):
- **Google Chrome** (`chrome`)
- **Brave** (`brave`)
- **Microsoft Edge** (`msedge`)
- **Opera** (`opera`)
- **Vivaldi** (`vivaldi`)
- **Mozilla Firefox** (`firefox`)

### Output Contract (`BrowserInfo.cs`)
Returns JSON `{}` if no supported browser is focused, or:
```json
{
  "Browser": "chrome",
  "Title": "WorkComposer Dashboard",
  "Url": "https://app.workcomposer.com/dashboard",
  "Domain": "app.workcomposer.com"
}
```

> **Note (`Program.cs`):** The standalone `BrowserUrlReader/Program.cs` console wrapper waits 5 seconds (`Thread.Sleep(5000)`) so a developer can switch to a browser window during manual CLI testing before invoking `BrowserReader.GetActiveBrowser()`.

### Build & Publish (Windows)
```bash
dotnet publish BrowserUrlReader/BrowserUrlReader.csproj -c Release -r win-x64
```
Because `BrowserUrlReader.csproj` sets `<PublishSingleFile>true</PublishSingleFile>`, `<SelfContained>true</SelfContained>`, and `<RuntimeIdentifier>win-x64</RuntimeIdentifier>`, copy the resulting `BrowserUrlReader.exe` into:
```text
WorkComposer Desktop/resources/BrowserUrlReader.exe
```

---

## 2. macOS Browser URL Reader (`BrowserUrlReader/Mac/`)

[`Mac/Mac.csproj`](./Mac/Mac.csproj) targets `net8.0` and compiles `../BrowserInfo.cs` alongside [`MacBrowserReader.cs`](./MacBrowserReader.cs), running via `Mac/Program.cs` with no artificial startup delay.

### Supported Browsers (`MacBrowserReader.cs`)
Checks the frontmost application bundle identifier via `System Events` AppleScript (guarded by `OperatingSystem.IsMacOS()`):
- **Safari** (`com.apple.Safari`)
- **Google Chrome** (`com.google.Chrome`)
- **Microsoft Edge** (`com.microsoft.edgemac`)
- **Brave Browser** (`com.brave.Browser`)
- **Opera** (`com.operasoftware.Opera`)
- **Mozilla Firefox** (`org.mozilla.firefox`)

### Build & Publish (macOS)
Publish for Apple Silicon (`osx-arm64`) and/or Intel (`osx-x64`) on macOS (or cross-publish):
```bash
# Apple Silicon
dotnet publish BrowserUrlReader/Mac/Mac.csproj -c Release -r osx-arm64 --self-contained

# Intel macOS
dotnet publish BrowserUrlReader/Mac/Mac.csproj -c Release -r osx-x64 --self-contained
```
`WorkComposer Desktop/electron/main.js` resolves the executable at:
- `WorkComposer Desktop/resources/MacBrowserReader/arm64/Mac`
- `WorkComposer Desktop/resources/MacBrowserReader/x64/Mac`

---

## 3. Windows Geolocation Reader (`LocationReader/`)

Located at [`WorkComposer Desktop/resources/LocationReader/`](../WorkComposer%20Desktop/resources/LocationReader/LocationReader.csproj), [`Program.cs`](../WorkComposer%20Desktop/resources/LocationReader/Program.cs) queries `Windows.Devices.Geolocation.Geolocator` (`DesiredAccuracyInMeters = 20`) and emits single-line JSON:

```json
{
  "Success": true,
  "Latitude": 0.0,
  "Longitude": 0.0,
  "Accuracy": 20.0,
  "Timestamp": "2026-01-01T00:00:00+00:00"
}
```
If location permission is denied or unavailable, it returns `{"Success":false,"Error":"..."}` gracefully.

### Build & Publish (Windows)
`WorkComposer Desktop/package.json` packages `LocationReader` directly from its Release publish folder:
```bash
dotnet publish "WorkComposer Desktop/resources/LocationReader/LocationReader.csproj" -c Release -r win-x64
```
Expected packaged source path in `WorkComposer Desktop/package.json` (`build.extraResources`):
```text
WorkComposer Desktop/resources/LocationReader/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish
```
(Mapped to `LocationReader/` inside the packaged app, alongside `WorkComposer Desktop/resources/LocationReader/LocationReader.exe` for local unpacked runs.)

