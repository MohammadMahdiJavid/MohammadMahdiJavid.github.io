param(
  [string]$BaseUri = "http://127.0.0.1:4000",
  [string]$OutputDirectory = "",
  [ValidateSet("Auto", "Chrome", "Edge", "Chromium")]
  [string]$Browser = "Auto",
  [int[]]$HomeWidths = @(320, 375, 390, 414, 454, 767, 768, 819, 820, 821, 1024),
  [int[]]$HobbiesWidths = @(320, 375, 390, 414, 559, 560, 561, 768, 1024),
  [int[]]$ThemeWidths = @(320, 375, 390, 414, 454, 559, 560, 561, 767, 768, 819, 820, 821, 1024, 1280),
  [string[]]$DisplayViewports = @("1920x1080@1", "2560x1440@1", "3440x1440@1", "3840x2160@1", "1920x1080@2", "2560x1440@1.5"),
  [int]$DebugPort = 0,
  [switch]$SkipScreenshots,
  [switch]$SkipVisualValidation,
  [string]$VisualBaselineDirectory = "",
  [decimal]$MaxPixelDiffPercent = 0.3,
  [switch]$UpdateVisualBaselines,
  [switch]$RequireVisualBaselines,
  [switch]$KeepBrowser
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

function Get-FreeTcpPort {
  $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $Listener.Start()
    return $Listener.LocalEndpoint.Port
  } finally {
    $Listener.Stop()
  }
}

function Wait-BrowserDebugEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [int]$TimeoutSeconds = 20
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -eq 200) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  } while ((Get-Date) -lt $Deadline)

  throw "Browser debug endpoint did not start on port $Port"
}

$BaseUri = $BaseUri.TrimEnd("/")
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $VerificationOutputPath ("browser-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
}

if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  $OutputPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRootPath $OutputDirectory))
}
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

$Node = Get-NodeInvocation
$BrowserInfo = Get-BrowserInvocation -Browser $Browser
if ($DebugPort -eq 0) {
  $DebugPort = Get-FreeTcpPort
}

$CdpRoot = Join-Path $ToolCachePath "cdp-client"
$CdpModules = Join-Path $CdpRoot "node_modules"
$CdpPackage = Join-Path $CdpModules "chrome-remote-interface"
New-Item -ItemType Directory -Force -Path $CdpRoot | Out-Null

if (-not (Test-Path -LiteralPath $CdpPackage -PathType Container)) {
  Write-Host "Installing Chrome DevTools client into $CdpRoot"
  Invoke-Native { & $Node.Npm install --prefix $CdpRoot chrome-remote-interface@0.33.3 }
}

$ProfilePath = Join-Path $ToolCachePath ("browser-profile-{0}" -f $DebugPort)
New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null

$BrowserArgs = @(
  "--headless=new",
  "--remote-debugging-port=$DebugPort",
  "--user-data-dir=$ProfilePath",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1024,768",
  "about:blank"
)

Write-Host "Using browser $($BrowserInfo.Path)"
$BrowserProcess = Start-Process -FilePath $BrowserInfo.Path -ArgumentList $BrowserArgs -WindowStyle Hidden -PassThru

$PreviousNodePath = $env:NODE_PATH
$env:NODE_PATH = $CdpModules
$env:CDP_PORT = "$DebugPort"
$env:BASE_URI = $BaseUri
$env:OUTPUT_DIR = $OutputPath
$env:HOME_WIDTHS = ($HomeWidths | ConvertTo-Json -Compress)
$env:HOBBIES_WIDTHS = ($HobbiesWidths | ConvertTo-Json -Compress)
$env:THEME_WIDTHS = ($ThemeWidths | ConvertTo-Json -Compress)
$env:DISPLAY_VIEWPORTS = ($DisplayViewports | ConvertTo-Json -Compress)
$env:SKIP_SCREENSHOTS = if ($SkipScreenshots) { "1" } else { "0" }

$NodeScript = @'
const fs = require("fs");
const path = require("path");
const CDP = require("chrome-remote-interface");

const cdpPort = Number(process.env.CDP_PORT || 9222);
const baseUri = (process.env.BASE_URI || "http://127.0.0.1:4000").replace(/\/+$/, "");
const outputDir = process.env.OUTPUT_DIR;
const skipScreenshots = process.env.SKIP_SCREENSHOTS === "1";

function numberList(value, fallback) {
  const parsed = JSON.parse(value || fallback);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function displayViewportList(value, fallback) {
  const parsed = JSON.parse(value || fallback);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((item, index) => {
    const spec = String(item || "").trim();
    const match = spec.match(/^(\d+)\s*x\s*(\d+)(?:\s*@\s*([0-9]+(?:\.[0-9]+)?))?$/i);
    if (!match) {
      throw new Error(`DisplayViewports[${index}] must use WIDTHxHEIGHT@DPR; got "${spec}"`);
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    const deviceScaleFactor = match[3] ? Number(match[3]) : 1;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
      throw new Error(`DisplayViewports[${index}] has invalid dimensions or DPR: "${spec}"`);
    }

    const dprText = String(deviceScaleFactor).replace(/\.0+$/, "");
    const label = `${width}x${height}@${dprText}`;
    const fileLabel = `${width}x${height}_dpr${dprText.replace(/[^0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    return { width, height, deviceScaleFactor, label, fileLabel };
  });
}

const homeWidths = numberList(process.env.HOME_WIDTHS, "[320,375,390,414,454,767,768,819,820,821,1024]");
const hobbiesWidths = numberList(process.env.HOBBIES_WIDTHS, "[320,375,390,414,559,560,561,768,1024]");
const themeWidths = numberList(process.env.THEME_WIDTHS, "[320,375,390,414,454,559,560,561,767,768,819,820,821,1024,1280]");
const displayViewports = displayViewportList(process.env.DISPLAY_VIEWPORTS, `["1920x1080@1","2560x1440@1","3440x1440@1","3840x2160@1","1920x1080@2","2560x1440@1.5"]`);

fs.mkdirSync(outputDir, { recursive: true });

const failures = [];
const consoleMessages = [];
const networkMessages = [];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function settleWithin(promise, ms) {
  try {
    await Promise.race([
      promise,
      delay(ms)
    ]);
  } catch (error) {
    return;
  }
}

function assertCheck(condition, message) {
  if (!condition) failures.push(message);
}

function isLocalUrl(value) {
  try {
    return new URL(value).origin === new URL(baseUri).origin;
  } catch (error) {
    return false;
  }
}

function shouldIgnoreUrl(value) {
  return !value || String(value).endsWith("/favicon.ico");
}

function isCanceledManifestAbort(event, value) {
  try {
    return !!event.canceled &&
      event.errorText === "net::ERR_ABORTED" &&
      event.type === "Manifest" &&
      new URL(value).pathname.endsWith("/site.webmanifest");
  } catch (error) {
    return false;
  }
}

async function withTarget(width, height, mobile, callback, options = {}) {
  const target = await CDP.New({ port: cdpPort, url: "about:blank" });
  const client = await CDP({ port: cdpPort, target });
  try {
    const { Page, Runtime, Emulation, Input, Log, Network } = client;
    const requestUrls = new Map();
    const requestedDeviceScaleFactor = Number(options.deviceScaleFactor);
    const deviceScaleFactor = Number.isFinite(requestedDeviceScaleFactor) && requestedDeviceScaleFactor > 0 ? requestedDeviceScaleFactor : 1;
    await Page.enable();
    await Page.addScriptToEvaluateOnNewDocument({
      source: `(() => {
        let seed = 123456789;
        Math.random = () => {
          seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
      })();`
    });
    await Runtime.enable();
    await Log.enable();
    await Network.enable();
    await Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor, mobile });
    const mediaFeatures = [];
    if (options.colorScheme) {
      mediaFeatures.push({ name: "prefers-color-scheme", value: options.colorScheme });
    }

    if (options.reducedMotion) {
      mediaFeatures.push({ name: "prefers-reduced-motion", value: options.reducedMotion });
    }

    if (mediaFeatures.length) {
      await Emulation.setEmulatedMedia({
        features: mediaFeatures
      });
    }

    Runtime.exceptionThrown(event => {
      consoleMessages.push({ type: "exception", width, text: event.exceptionDetails && event.exceptionDetails.text });
    });

    Runtime.consoleAPICalled(event => {
      if (event.type === "warning" || event.type === "error") {
        consoleMessages.push({
          type: event.type,
          width,
          text: event.args ? event.args.map(arg => arg.value || arg.description || "").join(" ") : "",
          url: event.stackTrace && event.stackTrace.callFrames && event.stackTrace.callFrames[0] ? event.stackTrace.callFrames[0].url : ""
        });
      }
    });

    Log.entryAdded(event => {
      const entry = event.entry;
      if ((entry.level === "error" || entry.level === "warning") && !String(entry.url || "").endsWith("/favicon.ico")) {
        consoleMessages.push({ type: entry.level, width, text: entry.text, url: entry.url || "" });
      }
    });

    Network.requestWillBeSent(event => {
      if (event.request && event.request.url) {
        requestUrls.set(event.requestId, event.request.url);
      }
    });

    Network.loadingFailed(event => {
      const url = requestUrls.get(event.requestId) || "";
      if (!shouldIgnoreUrl(url) && isLocalUrl(url) && !isCanceledManifestAbort(event, url)) {
        networkMessages.push({
          type: "loadingFailed",
          width,
          url,
          resourceType: event.type,
          errorText: event.errorText || "",
          canceled: !!event.canceled
        });
      }
    });

    Network.responseReceived(event => {
      const response = event.response || {};
      const url = response.url || "";
      if (!shouldIgnoreUrl(url) && isLocalUrl(url) && response.status >= 400) {
        networkMessages.push({
          type: "badStatus",
          width,
          url,
          status: response.status,
          resourceType: event.type
        });
      }
    });

    return await callback({ Page, Runtime, Input });
  } finally {
    await settleWithin(CDP.Close({ port: cdpPort, id: target.id }), 1000);
    await settleWithin(client.close(), 1000);
  }
}

async function evaluate(Runtime, expression) {
  const result = await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function navigate(Page, Runtime, url) {
  const load = Page.loadEventFired();
  await Page.navigate({ url });
  await settleWithin(load, 7000);
  await Runtime.evaluate({ expression: "window.scrollTo(0, 0)" });
  await delay(900);
}

async function capture(Page, name) {
  if (skipScreenshots) return null;
  const png = await Page.captureScreenshot({ format: "png", captureBeyondViewport: false });
  const file = path.join(outputDir, name);
  fs.writeFileSync(file, Buffer.from(png.data, "base64"));
  return file;
}

async function stabilizeHobbiesCanvasForScreenshot(Runtime) {
  if (skipScreenshots) return;
  await Runtime.evaluate({
    expression: `(() => {
      const canvas = document.getElementById("hq-bg");
      if (!canvas || !canvas.getContext) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "rgba(56, 189, 248, 0.16)");
      gradient.addColorStop(0.48, "rgba(251, 191, 36, 0.10)");
      gradient.addColorStop(1, "rgba(192, 132, 252, 0.16)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
      ctx.lineWidth = Math.max(1, Math.round(width / 1200));
      const step = Math.max(24, Math.round(width / 28));
      for (let x = step / 2; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - step, height);
        ctx.stroke();
      }
      for (let y = step / 2; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y - step);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
      const radius = Math.max(4, Math.round(Math.min(width, height) / 110));
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 97 + 53) % width);
        const y = ((i * 59 + 31) % height);
        ctx.beginPath();
        ctx.arc(x, y, radius + (i % 4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      canvas.dataset.verificationStable = "true";
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
}

async function sendMouse(Input, options) {
  await settleWithin(Input.dispatchMouseEvent(options), 1000);
}

async function clickMenu(Runtime, Input) {
  const point = await evaluate(Runtime, `(() => {
    const button = document.querySelector(".greedy-nav__toggle");
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) return;
  await sendMouse(Input, { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sendMouse(Input, { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await delay(350);
}

async function hoverSecondMenuItem(Runtime, Input) {
  const point = await evaluate(Runtime, `(() => {
    const hiddenItems = [...document.querySelectorAll(".hidden-links a")];
    const visibleItems = [...document.querySelectorAll(".visible-links a")].filter(item => {
      const value = item.getBoundingClientRect();
      return value.width > 0 && value.height > 0;
    });
    const item = hiddenItems[1] || hiddenItems[0] || visibleItems[1] || visibleItems[0];
    if (!item) return null;
    const rect = item.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) return;
  await sendMouse(Input, { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
  await delay(350);
}

async function clickThemeToggle(Runtime, Input) {
  const point = await evaluate(Runtime, `(() => {
    const button = document.querySelector("[data-theme-toggle]");
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) return false;
  await sendMouse(Input, { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sendMouse(Input, { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await delay(250);
  return true;
}

async function prepareTheme(Page, Runtime, Input, route, storedMode) {
  const prepRoute = route === "/" ? "/links.html" : "/";
  await navigate(Page, Runtime, `${baseUri}${prepRoute}#theme-prep-${Date.now()}`);
  if (storedMode === null) {
    await Runtime.evaluate({ expression: `localStorage.removeItem("mmj-theme-mode")` });
  } else {
    await Runtime.evaluate({ expression: `localStorage.setItem("mmj-theme-mode", ${JSON.stringify(storedMode)})` });
  }

  await navigate(Page, Runtime, `${baseUri}${route}#themecheck-${Date.now()}`);
}

async function sendKey(Input, key, code, virtualKeyCode) {
  await settleWithin(Input.dispatchKeyEvent({
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  }), 1000);
}

function parseRgb(value) {
  const match = String(value).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return match ? match.slice(1).map(Number) : null;
}

function isNearDarkText(value) {
  const rgb = parseRgb(value);
  return !!rgb && rgb[0] >= 17 && rgb[0] <= 20 && rgb[1] >= 24 && rgb[1] <= 28 && rgb[2] >= 39 && rgb[2] <= 43;
}

function isExpectedMenuIconColor(value) {
  return value === "rgb(55, 65, 81)" || isNearDarkText(value);
}

function rectInsideViewport(rect, width, height, tolerance = 1) {
  return !!rect &&
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= width + tolerance &&
    rect.bottom <= height + tolerance;
}

function rectInsideViewportHorizontally(rect, width, tolerance = 1) {
  return !rect || (rect.left >= -tolerance && rect.right <= width + tolerance);
}

function rectAtLeast(rect, size) {
  return !!rect && rect.width >= size && rect.height >= size;
}

function rectCluster(rects) {
  const visible = rects.filter(rect => rect && rect.width > 0 && rect.height > 0);
  if (!visible.length) return null;
  return {
    left: Math.min(...visible.map(rect => rect.left)),
    top: Math.min(...visible.map(rect => rect.top)),
    right: Math.max(...visible.map(rect => rect.right)),
    bottom: Math.max(...visible.map(rect => rect.bottom)),
    width: Math.max(...visible.map(rect => rect.right)) - Math.min(...visible.map(rect => rect.left)),
    height: Math.max(...visible.map(rect => rect.bottom)) - Math.min(...visible.map(rect => rect.top))
  };
}

function rectSeparated(rect, cluster, gap = 8) {
  if (!rect || !cluster) return false;
  return rect.right <= cluster.left - gap ||
    rect.left >= cluster.right + gap ||
    rect.bottom <= cluster.top - gap ||
    rect.top >= cluster.bottom + gap;
}

function rectBetween(rect, leftRect, rightRect, tolerance = 6) {
  return !!rect && !!leftRect && !!rightRect &&
    rect.left >= leftRect.right - tolerance &&
    rect.right <= rightRect.left + tolerance;
}

function rectsOverlap(a, b, tolerance = 0) {
  return !!a && !!b &&
    a.left < b.right - tolerance &&
    a.right > b.left + tolerance &&
    a.top < b.bottom - tolerance &&
    a.bottom > b.top + tolerance;
}

function rectClearOf(rect, blockers, tolerance = 0) {
  return !!rect && blockers.every(blocker => !rectsOverlap(rect, blocker, tolerance));
}

function minVisibleLinkGap(width) {
  if (width >= 2200) return 40;
  if (width >= 1440) return 28;
  return 20;
}

function minTitleToFirstPillGap(width) {
  if (width >= 2200) return 180;
  if (width >= 1440) return 140;
  return 96;
}

function expectedDisplayMainMaxWidth(route, width) {
  if (route === "/hobbies/") return null;
  if (route !== "/") return 1282;
  if (width >= 2200) return Math.min(width * 0.78, 1720) + 2;
  if (width >= 1440) return Math.min(width * 0.90, 1520) + 2;
  return 1282;
}

function expectedHomeSidebarPostGap(width) {
  if (width >= 2200) return Math.min(Math.max(width * 0.07, 170), 260);
  if (width >= 1440) return Math.min(Math.max(width * 0.065, 112), 180);
  return Math.min(Math.max(width * 0.05, 72), 104);
}

function closeTo(value, expected, tolerance = 0.01) {
  return Math.abs(Number(value) - Number(expected)) <= tolerance;
}

function nextThemeMode(mode) {
  return mode === "night" ? "light" : "night";
}

const menuMetricsExpression = `(() => {
  const menu = document.querySelector(".hidden-links");
  const button = document.querySelector(".greedy-nav__toggle");
  const search = document.querySelector(".search__toggle");
  const theme = document.querySelector("[data-theme-toggle]");
  const title = document.querySelector(".site-title.pcb-cpu");
  const masthead = document.querySelector(".masthead.pcb-masthead");
  const rect = element => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  };
  const hiddenLinks = [...document.querySelectorAll(".hidden-links a")];
  const visibleLinks = [...document.querySelectorAll(".visible-links a")].filter(item => rect(item).width > 0 && rect(item).height > 0);
  const links = [...visibleLinks, ...hiddenLinks];
  const checkedLinks = hiddenLinks.length ? hiddenLinks : visibleLinks;
  const menuLink = hiddenLinks[0] || visibleLinks[0] || null;
  const navMode = hiddenLinks.length ? "hidden" : "visible";
  const labels = links.map(item => item.textContent.trim().replace(/\\s+/g, " "));
  const style = element => getComputedStyle(element);
  const menuStyle = style(menu);
  const firstStyle = menuLink ? style(menuLink) : null;
  const defaultIcon = (hiddenLinks.find(item => item.querySelector(".pcb-menu-icon")) || visibleLinks.find(item => item.querySelector(".pcb-menu-icon")) || null)?.querySelector(".pcb-menu-icon");
  const defaultIconStyle = defaultIcon ? style(defaultIcon) : null;
  const hitResults = checkedLinks.map(item => {
    const value = item.getBoundingClientRect();
    const element = document.elementFromPoint(value.left + value.width / 2, value.top + value.height / 2);
    return element && (element === item || item.contains(element)) ? "ok" : (element ? element.tagName + "." + String(element.className) : "none");
  });
  const maxRight = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, ...[...document.body.querySelectorAll("*")].map(element => element.getBoundingClientRect().right));
  return {
    scrollY,
    viewport: { width: innerWidth, height: innerHeight },
    visualOverflow: maxRight - innerWidth,
    mastheadOverflow: style(masthead).overflow,
    mastheadZIndex: style(masthead).zIndex,
    navMode,
    hiddenLinkCount: hiddenLinks.length,
    visibleLinkCount: visibleLinks.length,
    title: rect(title),
    menu: rect(menu),
    menuDisplay: menuStyle.display,
    menuPosition: menuStyle.position,
    menuZIndex: menuStyle.zIndex,
    menuBackground: menuStyle.backgroundColor,
    menuBorderColor: menuStyle.borderTopColor,
    menuBorderRadius: menuStyle.borderTopLeftRadius,
    menuBoxShadow: menuStyle.boxShadow,
    labels,
    linkRects: links.map(rect),
    hitResults,
    linkDisplay: firstStyle ? firstStyle.display : null,
    linkPadding: firstStyle ? [firstStyle.paddingTop, firstStyle.paddingRight, firstStyle.paddingBottom, firstStyle.paddingLeft] : [],
    linkTextColor: firstStyle ? firstStyle.color : null,
    defaultIconColor: defaultIconStyle ? defaultIconStyle.color : null,
    defaultIconSize: defaultIconStyle ? [defaultIconStyle.width, defaultIconStyle.height] : [],
    buttonExpanded: button ? button.getAttribute("aria-expanded") : null,
    buttonRect: button ? rect(button) : null,
    searchRect: rect(search),
    themeRect: theme ? rect(theme) : null,
    menuRole: menu.getAttribute("role"),
    itemRoles: hiddenLinks.map(item => item.getAttribute("role"))
  };
})()`;

const hoverMetricsExpression = `(() => {
  const hiddenItems = [...document.querySelectorAll(".hidden-links a")];
  const visibleItems = [...document.querySelectorAll(".visible-links a")].filter(item => {
    const value = item.getBoundingClientRect();
    return value.width > 0 && value.height > 0;
  });
  const item = hiddenItems[1] || hiddenItems[0] || visibleItems[1] || visibleItems[0];
  if (!item) return { background: null, color: null, iconColor: null };
  const icon = item.querySelector(".pcb-menu-icon");
  return {
    background: getComputedStyle(item).backgroundColor,
    color: getComputedStyle(item).color,
    iconColor: icon ? getComputedStyle(icon).color : getComputedStyle(item).color
  };
})()`;

const hobbiesMetricsExpression = `(() => {
  const footer = document.querySelector(".hq-footer");
  const buttons = [...document.querySelectorAll(".hq-footer .hq-btn")];
  const rect = element => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  };
  const maxRight = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, ...[...document.body.querySelectorAll("*")].map(element => element.getBoundingClientRect().right));
  return {
    scrollY,
    viewport: { width: innerWidth, height: innerHeight },
    visualOverflow: maxRight - innerWidth,
    footerDisplay: footer ? getComputedStyle(footer).display : null,
    footerGridTemplateColumns: footer ? getComputedStyle(footer).gridTemplateColumns : null,
    labels: buttons.map(button => button.textContent.trim().replace(/\\s+/g, " ")),
    buttons: buttons.map(rect),
    hitResults: buttons.map(button => {
      const value = button.getBoundingClientRect();
      const element = document.elementFromPoint(value.left + value.width / 2, value.top + value.height / 2);
      return element && (element === button || button.contains(element)) ? "ok" : (element ? element.tagName + "." + String(element.className) : "none");
    })
  };
})()`;

const themeMetricsExpression = `(() => {
  const root = document.documentElement;
  const button = document.querySelector("[data-theme-toggle]");
  const link = document.querySelector(".page__content a, .archive__item-title a, a");
  const footer = document.querySelector(".page__footer");
  const rect = element => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  };
  const maxRight = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, ...[...document.body.querySelectorAll("*")].map(element => element.getBoundingClientRect().right));
  const buttonStyle = button ? getComputedStyle(button) : null;
  const footerStyle = footer ? getComputedStyle(footer) : null;
  const hitElement = button ? document.elementFromPoint(button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2, button.getBoundingClientRect().top + button.getBoundingClientRect().height / 2) : null;

  return {
    mode: root.getAttribute("data-theme-mode"),
    theme: root.getAttribute("data-theme"),
    source: root.getAttribute("data-theme-source"),
    stored: localStorage.getItem("mmj-theme-mode"),
    colorScheme: getComputedStyle(root).colorScheme,
    visualOverflow: maxRight - innerWidth,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    linkColor: link ? getComputedStyle(link).color : null,
    footerBackground: footerStyle ? footerStyle.backgroundColor : null,
    button: button ? rect(button) : null,
    buttonDisplay: buttonStyle ? buttonStyle.display : null,
    buttonVisible: !!button && button.getBoundingClientRect().width > 20 && button.getBoundingClientRect().height > 20,
    buttonMode: button ? button.getAttribute("data-theme-mode") : null,
    buttonActive: button ? button.getAttribute("data-theme-active") : null,
    buttonLabel: button ? button.getAttribute("aria-label") : null,
    buttonPressed: button ? button.getAttribute("aria-pressed") : null,
    hitResult: button && hitElement && (hitElement === button || button.contains(hitElement)) ? "ok" : (hitElement ? hitElement.tagName + "." + String(hitElement.className) : "none")
  };
})()`;

const displayMetricsExpression = `(() => {
  const root = document.documentElement;
  const main = document.querySelector("#main");
  const masthead = document.querySelector(".masthead.pcb-masthead");
  const cpu = document.querySelector("#pcb-cpu");
  const button = document.querySelector(".greedy-nav__toggle");
  const search = document.querySelector(".search__toggle");
  const theme = document.querySelector("[data-theme-toggle]");
  const sidebar = document.querySelector(".sidebar");
  const authorLinks = document.querySelector(".author__urls");
  const content = document.querySelector(".page__content, .archive");
  const footer = document.querySelector(".page__footer");
  const hobby = document.querySelector("#hobby-quest");
  const hobbyStage = document.querySelector(".hq-stage");
  const hobbyCanvas = document.querySelector("#hq-bg");
  const rect = element => {
    if (!element || element.nodeType !== 1) return null;
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height, centerX: value.left + value.width / 2 };
  };
  const style = element => element && element.nodeType === 1 ? getComputedStyle(element) : null;
  const isVisible = element => {
    const value = rect(element);
    const computed = style(element);
    return !!value && value.width > 0 && value.height > 0 && computed.display !== "none" && computed.visibility !== "hidden";
  };
  const hiddenLinks = [...document.querySelectorAll(".hidden-links a")];
  const visibleLinks = [...document.querySelectorAll(".visible-links a")].filter(isVisible);
  const visibleLinkRects = visibleLinks.map(rect);
  const visibleLinkGaps = visibleLinkRects.slice(1).map((value, index) => value.left - visibleLinkRects[index].right);
  const sidebarRect = rect(sidebar);
  const contentRect = rect(content);
  const componentInfo = selector => [...document.querySelectorAll(selector)].map(element => {
    const computed = style(element);
    return {
      ref: element.dataset.pcbRef || element.dataset.pcbComponent || "",
      rect: rect(element),
      visible: isVisible(element),
      opacity: computed ? Number.parseFloat(computed.opacity) : 0
    };
  });
  const navMode = hiddenLinks.length ? "hidden" : "visible";
  const themeRect = rect(theme);
  const themeHitElement = themeRect ? document.elementFromPoint(themeRect.left + themeRect.width / 2, themeRect.top + themeRect.height / 2) : null;
  const allRights = [...document.body.querySelectorAll("*")].map(element => {
    const value = element.getBoundingClientRect();
    return Number.isFinite(value.right) ? value.right : 0;
  });
  const maxRight = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, ...allRights);
  const hobbyStyle = style(hobby);
  const canvasRect = rect(hobbyCanvas);
  return {
    mode: root.getAttribute("data-theme-mode"),
    theme: root.getAttribute("data-theme"),
    source: root.getAttribute("data-theme-source"),
    stored: localStorage.getItem("mmj-theme-mode"),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    visualOverflow: maxRight - innerWidth,
    main: rect(main),
    mainMaxWidth: main ? style(main).maxWidth : null,
    masthead: rect(masthead),
    cpu: rect(cpu),
    navMode,
    hiddenLinkCount: hiddenLinks.length,
    visibleLinkCount: visibleLinks.length,
    visibleLinkRects,
    visibleLinkGaps,
    pcbComponents: {
      capacitors: componentInfo(".pcb-component--capacitor"),
      resistors: componentInfo(".pcb-component--resistor"),
      labels: componentInfo(".pcb-label")
    },
    controls: [
      { name: "menu", rect: rect(button), visible: isVisible(button) },
      { name: "search", rect: rect(search), visible: isVisible(search) },
      { name: "theme", rect: themeRect, visible: isVisible(theme) }
    ].filter(item => item.rect),
    sidebar: sidebarRect,
    authorLinks: rect(authorLinks),
    content: contentRect,
    footer: rect(footer),
    homeLayout: {
      sidebarToContentGap: sidebarRect && contentRect ? contentRect.left - sidebarRect.right : null
    },
    themeButtonVisible: isVisible(theme),
    themeButtonHitResult: theme && themeHitElement && (themeHitElement === theme || theme.contains(themeHitElement)) ? "ok" : (themeHitElement ? themeHitElement.tagName + "." + String(themeHitElement.className) : "none"),
    hobby: hobby ? {
      isPage: true,
      shell: rect(hobby),
      shellBackgroundImage: hobbyStyle ? hobbyStyle.backgroundImage : null,
      shellBackgroundColor: hobbyStyle ? hobbyStyle.backgroundColor : null,
      shellOverflow: hobbyStyle ? hobbyStyle.overflow : null,
      stage: rect(hobbyStage),
      canvas: canvasRect,
      canvasWidth: hobbyCanvas ? hobbyCanvas.width : 0,
      canvasHeight: hobbyCanvas ? hobbyCanvas.height : 0
    } : { isPage: false }
  };
})()`;

const robotBlinkExpression = `(() => {
  const robot = document.querySelector('[data-pcb-robot="auto"]');
  if (typeof window.pcbRobotBlink === "function") {
    return window.pcbRobotBlink('[data-pcb-robot="auto"]');
  }

  const api = window.MMJ && window.MMJ.header && window.MMJ.header.robotBlink;
  if (api && typeof api.blinkRobot === "function") {
    window.__browserVerifyRobotBlinkState = window.__browserVerifyRobotBlinkState || {};
    return api.blinkRobot(window.__browserVerifyRobotBlinkState, robot, false);
  }

  return false;
})()`;

const robotReducedBlinkExpression = `(() => {
  const robot = document.querySelector('[data-pcb-robot="auto"]');
  if (typeof window.pcbRobotBlink === "function") {
    return window.pcbRobotBlink('[data-pcb-robot="auto"]');
  }

  const api = window.MMJ && window.MMJ.header && window.MMJ.header.robotBlink;
  if (api && typeof api.blinkRobot === "function") {
    window.__browserVerifyRobotBlinkState = window.__browserVerifyRobotBlinkState || {};
    return api.blinkRobot(window.__browserVerifyRobotBlinkState, robot, true);
  }

  return false;
})()`;

const robotMetricsExpression = `(() => {
  const robot = document.querySelector('[data-pcb-robot="auto"]');
  const title = document.querySelector(".site-title.pcb-cpu");
  const masthead = document.querySelector(".masthead.pcb-masthead");
  const capacitor = document.querySelector(".pcb-component--capacitor");
  const capacitorFlow = capacitor ? capacitor.querySelector(".pcb-c__flow") : null;
  const capacitorMount = document.querySelector(".pcb-component--capacitor-top");
  const resistor = document.querySelector(".pcb-component--resistor");
  const openEyes = robot ? robot.querySelector(".pcb-cpu__open-eyes") : null;
  const lashes = robot ? robot.querySelector(".pcb-cpu__blink-lashes") : null;
  const lash = robot ? robot.querySelector(".pcb-cpu__lash") : null;
  const mouth = robot ? robot.querySelector(".pcb-cpu__robot-mouth") : null;
  const blush = robot ? robot.querySelector(".pcb-cpu__robot-blush") : null;
  const traces = robot ? robot.querySelector(".pcb-cpu__robot-traces") : null;
  const pins = robot ? [...robot.querySelectorAll(".pcb-cpu__robot-pins")] : [];
  const rect = element => {
    if (!element || element.nodeType !== 1) return null;
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  };
  const style = element => element && element.nodeType === 1 ? getComputedStyle(element) : null;
  const durationMs = value => {
    const first = String(value || "0s").split(",")[0].trim();
    if (!first) return 0;
    const numeric = Number.parseFloat(first);
    if (!Number.isFinite(numeric)) return 0;
    return first.endsWith("ms") ? numeric : numeric * 1000;
  };
  const robotStyle = style(robot);
  const capacitorStyle = style(capacitor);
  const capacitorFlowStyle = style(capacitorFlow);
  const openEyesStyle = style(openEyes);
  const lashesStyle = style(lashes);
  const lashStyle = style(lash);
  const mouthStyle = style(mouth);
  const blushStyle = style(blush);
  const tracesStyle = style(traces);
  return {
    hasRobot: !!robot,
    hasApi: typeof window.pcbRobotBlink === "function" || !!(window.MMJ && window.MMJ.header && window.MMJ.header.robotBlink && typeof window.MMJ.header.robotBlink.blinkRobot === "function"),
    blinkReturn: null,
    isBlinking: !!robot && robot.classList.contains("is-blinking"),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    robotDisplay: robotStyle ? robotStyle.display : null,
    robotVisible: !!robot && rect(robot).width > 0 && rect(robot).height > 0 && robotStyle.display !== "none",
    blinkSpeed: robotStyle ? Number.parseFloat(robotStyle.getPropertyValue("--pcb-robot-blink-speed")) : null,
    openEyesOpacity: openEyesStyle ? Number.parseFloat(openEyesStyle.opacity) : null,
    openEyesTransform: openEyesStyle ? openEyesStyle.transform : null,
    openEyesAnimationDurationMs: openEyesStyle ? durationMs(openEyesStyle.animationDuration) : 0,
    lashesOpacity: lashesStyle ? Number.parseFloat(lashesStyle.opacity) : null,
    lashesAnimationDurationMs: lashesStyle ? durationMs(lashesStyle.animationDuration) : 0,
    lashDashOffset: lashStyle ? lashStyle.strokeDashoffset : null,
    mouthTransform: mouthStyle ? mouthStyle.transform : null,
    blushOpacity: blushStyle ? Number.parseFloat(blushStyle.opacity) : null,
    traceAnimation: tracesStyle ? tracesStyle.animationName : null,
    pinAnimations: pins.map(pin => {
      const pinStyle = style(pin);
      return pinStyle ? pinStyle.animationName : null;
    }),
    hasCapacitor: !!capacitor,
    capacitorVisible: !!capacitor && rect(capacitor).width > 0 && rect(capacitor).height > 0,
    capacitorAnimation: capacitorStyle ? capacitorStyle.animationName : null,
    capacitorFlowAnimation: capacitorFlowStyle ? capacitorFlowStyle.animationName : null,
    hasCapMount: !!capacitorMount,
    hasResistor: !!resistor,
    masthead: rect(masthead),
    title: rect(title),
    robot: rect(robot),
    capacitor: rect(capacitor)
  };
})()`;

async function main() {
const report = {
  baseUri,
  outputDir,
  home: [],
  hobbies: [],
  theme: [],
  display: [],
  themeScreenshots: [],
  robot: null,
  keyboard: null,
  consoleMessages,
  networkMessages,
  failures
};

report.robot = {};

report.robot.states = await withTarget(1024, 720, false, async ({ Page, Runtime, Input }) => {
  await navigate(Page, Runtime, `${baseUri}/#robotcheck-${Date.now()}`);
  await evaluate(Runtime, `(() => {
    const robot = document.querySelector('[data-pcb-robot="auto"]');
    if (!robot) return false;
    robot.classList.remove("is-blinking");
    robot.dataset.blinkMin = "999999";
    robot.dataset.blinkMax = "999999";
    void robot.offsetWidth;
    return true;
  })()`);
  await delay(80);
  const open = await evaluate(Runtime, robotMetricsExpression);
  const openScreenshot = await capture(Page, "robot_open.png");
  await evaluate(Runtime, `(() => {
    const robot = document.querySelector('[data-pcb-robot="auto"]');
    if (!robot) return false;
    robot.classList.remove("is-blinking");
    void robot.offsetWidth;
    return true;
  })()`);
  const blinkReturn = await evaluate(Runtime, robotBlinkExpression);
  await delay(180);
  const blink = await evaluate(Runtime, robotMetricsExpression);
  blink.blinkReturn = blinkReturn;
  const blinkScreenshot = await capture(Page, "robot_blink.png");
  await delay(190);
  const reopen = await evaluate(Runtime, robotMetricsExpression);
  reopen.blinkReturn = blinkReturn;
  const reopenScreenshot = await capture(Page, "robot_reopen.png");
  await delay(260);
  const point = await evaluate(Runtime, `(() => {
    const title = document.querySelector(".site-title.pcb-cpu");
    const rect = title.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await sendMouse(Input, { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
  await delay(280);
  const hover = await evaluate(Runtime, robotMetricsExpression);
  const hoverScreenshot = await capture(Page, "robot_hover.png");
  return {
    open,
    blink,
    reopen,
    hover,
    screenshots: {
      open: openScreenshot,
      blink: blinkScreenshot,
      reopen: reopenScreenshot,
      hover: hoverScreenshot
    }
  };
});

report.robot.light = await withTarget(1024, 720, false, async ({ Page, Runtime, Input }) => {
  await prepareTheme(Page, Runtime, Input, "/", "light");
  const metrics = await evaluate(Runtime, robotMetricsExpression);
  const screenshot = await capture(Page, "robot_light.png");
  return { metrics, screenshot };
}, { colorScheme: "light" });

report.robot.night = await withTarget(1024, 720, false, async ({ Page, Runtime, Input }) => {
  await prepareTheme(Page, Runtime, Input, "/", "night");
  const metrics = await evaluate(Runtime, robotMetricsExpression);
  const screenshot = await capture(Page, "robot_night.png");
  return { metrics, screenshot };
}, { colorScheme: "dark" });

report.robot.compact = await withTarget(414, 720, true, async ({ Page, Runtime }) => {
  await navigate(Page, Runtime, `${baseUri}/#robotcompact-${Date.now()}`);
  const metrics = await evaluate(Runtime, robotMetricsExpression);
  const screenshot = await capture(Page, "robot_compact.png");
  return { metrics, screenshot };
});

report.robot.reduced = await withTarget(1024, 720, false, async ({ Page, Runtime }) => {
  await navigate(Page, Runtime, `${baseUri}/#robotreduced-${Date.now()}`);
  const blinkReturn = await evaluate(Runtime, robotReducedBlinkExpression);
  await delay(150);
  const metrics = await evaluate(Runtime, robotMetricsExpression);
  metrics.blinkReturn = blinkReturn;
  const screenshot = await capture(Page, "robot_reduced_motion.png");
  return { metrics, screenshot };
}, { reducedMotion: "reduce" });

const robotOpen = report.robot.states.open;
const robotBlink = report.robot.states.blink;
const robotReopen = report.robot.states.reopen;
const robotHover = report.robot.states.hover;
const robotLight = report.robot.light.metrics;
const robotNight = report.robot.night.metrics;
const robotCompact = report.robot.compact.metrics;
const robotReduced = report.robot.reduced.metrics;

assertCheck(robotOpen.hasRobot === true, "PCB robot markup is missing");
assertCheck(robotOpen.hasApi === true, "PCB robot manual blink API is missing");
assertCheck(robotOpen.robotVisible === true, "PCB robot is not visible on desktop");
assertCheck(robotOpen.blinkSpeed === 2, `PCB robot blink speed is ${robotOpen.blinkSpeed}`);
if (robotOpen.hasCapacitor) {
  assertCheck(robotOpen.capacitorVisible === true, "PCB capacitor is not visible");
  assertCheck(robotOpen.capacitorAnimation === "pcbCapIdleBreath", `PCB capacitor idle animation is ${robotOpen.capacitorAnimation}`);
  assertCheck(robotOpen.capacitorFlowAnimation === "pcbCapCurrent", `PCB capacitor current animation is ${robotOpen.capacitorFlowAnimation}`);
  assertCheck(robotOpen.hasCapMount === true, "PCB capacitor top mount is missing");
}
assertCheck(robotOpen.hasResistor === true, "PCB resistor is missing");
assertCheck(robotBlink.blinkReturn === true, "PCB robot manual blink did not start");
if (robotBlink.openEyesAnimationDurationMs > 0) {
  assertCheck(robotBlink.isBlinking === true, "PCB robot blink class was not applied");
  assertCheck(robotBlink.lashesOpacity > 0.5, `PCB robot lashes opacity is ${robotBlink.lashesOpacity}`);
  assertCheck(robotBlink.openEyesOpacity < 0.4, `PCB robot open eye opacity during blink is ${robotBlink.openEyesOpacity}`);
  assertCheck(robotBlink.openEyesAnimationDurationMs >= 390 && robotBlink.openEyesAnimationDurationMs <= 430, `PCB robot blink duration is ${robotBlink.openEyesAnimationDurationMs}ms`);
}
assertCheck(robotReopen.openEyesOpacity > 0.8, `PCB robot reopen eye opacity is ${robotReopen.openEyesOpacity}`);
assertCheck(robotReopen.lashesOpacity < 0.3, `PCB robot reopen lashes opacity is ${robotReopen.lashesOpacity}`);
assertCheck(robotHover.mouthTransform !== "none", "PCB robot hover mouth transform is missing");
assertCheck(robotHover.blushOpacity > 0.1, `PCB robot hover blush opacity is ${robotHover.blushOpacity}`);
assertCheck(robotHover.traceAnimation === "pcbCpuTraceCharge", `PCB robot hover trace animation is ${robotHover.traceAnimation}`);
assertCheck(robotHover.pinAnimations.every(value => value === "pcbCpuPinGlow"), `PCB robot hover pin animations are ${robotHover.pinAnimations.join(",")}`);
assertCheck(robotLight.robotVisible === true, "PCB robot is missing in light theme");
assertCheck(robotNight.robotVisible === true, "PCB robot is missing in night theme");
assertCheck(robotCompact.hasRobot === true, "Compact masthead robot markup is missing");
assertCheck(robotCompact.robotVisible === false, "Compact masthead robot should be hidden");
assertCheck(robotReduced.reducedMotion === true, "Reduced motion emulation did not apply");
assertCheck(robotReduced.blinkReturn === false, "PCB robot blink should not run under reduced motion");
assertCheck(robotReduced.isBlinking === false, "PCB robot blink class should not apply under reduced motion");
assertCheck(robotReduced.openEyesOpacity > 0.9, `Reduced motion open eye opacity is ${robotReduced.openEyesOpacity}`);
assertCheck(robotReduced.lashesOpacity < 0.1, `Reduced motion lashes opacity is ${robotReduced.lashesOpacity}`);
if (robotReduced.hasCapacitor) {
  assertCheck(robotReduced.capacitorAnimation === "none", `Reduced motion capacitor animation is ${robotReduced.capacitorAnimation}`);
  assertCheck(robotReduced.capacitorFlowAnimation === "none", `Reduced motion capacitor flow animation is ${robotReduced.capacitorFlowAnimation}`);
}

report.keyboard = await withTarget(454, 900, true, async ({ Page, Runtime, Input }) => {
  await navigate(Page, Runtime, `${baseUri}/#keyboardcheck-${Date.now()}`);
  const initialExpanded = await evaluate(Runtime, `document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded")`);
  await Runtime.evaluate({ expression: `document.querySelector(".greedy-nav__toggle").focus()` });
  await delay(150);
  await sendKey(Input, "ArrowDown", "ArrowDown", 40);
  await delay(250);
  const afterOpen = await evaluate(Runtime, `(() => ({
    expanded: document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded"),
    activeText: document.activeElement.textContent.trim().replace(/\\s+/g, " "),
    activeRole: document.activeElement.getAttribute("role"),
    focusShadow: getComputedStyle(document.activeElement).boxShadow,
    focusOutline: getComputedStyle(document.activeElement).outlineStyle,
    focusBackground: getComputedStyle(document.activeElement).backgroundColor,
    menuHidden: document.querySelector(".hidden-links").classList.contains("hidden")
  }))()`);
  await sendKey(Input, "ArrowDown", "ArrowDown", 40);
  await delay(140);
  const second = await evaluate(Runtime, `document.activeElement.textContent.trim().replace(/\\s+/g, " ")`);
  await sendKey(Input, "ArrowUp", "ArrowUp", 38);
  await delay(140);
  const back = await evaluate(Runtime, `document.activeElement.textContent.trim().replace(/\\s+/g, " ")`);
  await sendKey(Input, "Escape", "Escape", 27);
  await delay(250);
  const afterEscape = await evaluate(Runtime, `(() => ({
    expanded: document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded"),
    activeTag: document.activeElement.tagName,
    activeClass: String(document.activeElement.className),
    menuHidden: document.querySelector(".hidden-links").classList.contains("hidden")
  }))()`);
  return { initialExpanded, afterOpen, second, back, afterEscape, screenshot: null };
});

const earlyThemeRoutes = ["/", "/hobbies/", "/links.html", "/soldering-101/"];
const earlyThemeCases = [
  { name: "system-light-default", system: "light", storedMode: null, expectedTheme: "light", expectedMode: "light", expectedSource: "system", expectedStored: null },
  { name: "system-dark-default", system: "dark", storedMode: null, expectedTheme: "night", expectedMode: "night", expectedSource: "system", expectedStored: null },
  { name: "saved-light-over-system-dark", system: "dark", storedMode: "light", expectedTheme: "light", expectedMode: "light", expectedSource: "stored", expectedStored: "light" },
  { name: "saved-night-over-system-light", system: "light", storedMode: "night", expectedTheme: "night", expectedMode: "night", expectedSource: "stored", expectedStored: "night" }
];

for (const testCase of earlyThemeCases) {
  for (const route of earlyThemeRoutes) {
    const result = await withTarget(454, 900, true, async ({ Page, Runtime, Input }) => {
      await prepareTheme(Page, Runtime, Input, route, testCase.storedMode);
      const metrics = await evaluate(Runtime, themeMetricsExpression);
      const clicked = await clickThemeToggle(Runtime, Input);
      const afterClick = await evaluate(Runtime, themeMetricsExpression);
      return { case: testCase.name, route, metrics, clicked, afterClick };
    }, { colorScheme: testCase.system });

    report.theme.push(result);
    const metrics = result.metrics;
    const afterClick = result.afterClick;
    const expectedClickTheme = testCase.expectedTheme === "night" ? "light" : "night";
    assertCheck(metrics.theme === testCase.expectedTheme, `${testCase.name} ${route} theme is ${metrics.theme}`);
    assertCheck(metrics.mode === testCase.expectedMode, `${testCase.name} ${route} mode is ${metrics.mode}`);
    assertCheck(metrics.source === testCase.expectedSource, `${testCase.name} ${route} source is ${metrics.source}`);
    assertCheck(metrics.stored === testCase.expectedStored, `${testCase.name} ${route} stored mode is ${metrics.stored}`);
    assertCheck(metrics.visualOverflow <= 1, `${testCase.name} ${route} has horizontal overflow ${metrics.visualOverflow}`);
    assertCheck(metrics.buttonVisible === true, `${testCase.name} ${route} theme button is not visible`);
    assertCheck(metrics.hitResult === "ok", `${testCase.name} ${route} theme button hit test failed ${metrics.hitResult}`);
    assertCheck(metrics.button && metrics.button.width >= 32 && metrics.button.height >= 32, `${testCase.name} ${route} theme button target is below 32px`);
    assertCheck(metrics.buttonMode === testCase.expectedMode, `${testCase.name} ${route} button mode is ${metrics.buttonMode}`);
    assertCheck(metrics.buttonActive === testCase.expectedTheme, `${testCase.name} ${route} button active theme is ${metrics.buttonActive}`);
    assertCheck(metrics.buttonLabel && metrics.buttonLabel.indexOf("Theme mode is") === 0, `${testCase.name} ${route} button label is missing`);
    assertCheck(result.clicked === true, `${testCase.name} ${route} theme button could not be clicked`);
    assertCheck(afterClick.theme === expectedClickTheme, `${testCase.name} ${route} clicked theme is ${afterClick.theme}`);
    assertCheck(afterClick.mode === expectedClickTheme, `${testCase.name} ${route} clicked mode is ${afterClick.mode}`);
    assertCheck(afterClick.source === "stored", `${testCase.name} ${route} clicked source is ${afterClick.source}`);
    assertCheck(afterClick.stored === expectedClickTheme, `${testCase.name} ${route} clicked stored mode is ${afterClick.stored}`);
  }
}

for (const width of homeWidths) {
  const result = await withTarget(width, 900, width <= 560, async ({ Page, Runtime, Input }) => {
    await prepareTheme(Page, Runtime, Input, "/", "light");
    await clickMenu(Runtime, Input);
    const metrics = await evaluate(Runtime, menuMetricsExpression);
    const screenshot = await capture(Page, `home_${width}_open.png`);
    await hoverSecondMenuItem(Runtime, Input);
    const hover = await evaluate(Runtime, hoverMetricsExpression);
    const hoverScreenshot = width === 454 ? await capture(Page, `home_${width}_hover.png`) : null;
    return { width, screenshot, hoverScreenshot, metrics, hover };
  });

  report.home.push(result);
  const metrics = result.metrics;
  assertCheck(metrics.visualOverflow <= 1, `Home ${width} has horizontal overflow ${metrics.visualOverflow}`);
  assertCheck(JSON.stringify(metrics.labels) === JSON.stringify(["CV", "Certifications", "Follow Me", "Hobbies"]), `Home ${width} menu labels or order changed`);
  assertCheck(metrics.hitResults.every(value => value === "ok"), `Home ${width} menu hit test failed ${metrics.hitResults.join(",")}`);
  if (metrics.navMode === "hidden") {
    assertCheck(metrics.menuBackground === "rgba(0, 0, 0, 0.78)", `Home ${width} menu background is ${metrics.menuBackground}`);
    assertCheck(metrics.menuBorderColor === "rgba(255, 255, 255, 0.14)", `Home ${width} menu border is ${metrics.menuBorderColor}`);
    assertCheck(metrics.menuBorderRadius === "4px", `Home ${width} menu radius is ${metrics.menuBorderRadius}`);
    assertCheck(metrics.menuBoxShadow !== "none", `Home ${width} menu shadow is missing`);
    const linkPadding = metrics.linkPadding.map(value => Number.parseFloat(value));
    assertCheck(linkPadding[0] >= 3.5 && linkPadding[0] <= 5 && linkPadding[1] >= 9 && linkPadding[1] <= 13 && linkPadding[2] >= 3.5 && linkPadding[2] <= 5 && linkPadding[3] >= 9 && linkPadding[3] <= 13, `Home ${width} menu padding is ${metrics.linkPadding.join(",")}`);
    assertCheck(metrics.linkTextColor === "rgba(235, 255, 246, 0.92)", `Home ${width} text color is ${metrics.linkTextColor}`);
    if (metrics.defaultIconColor) {
      assertCheck(isExpectedMenuIconColor(metrics.defaultIconColor), `Home ${width} default icon color is ${metrics.defaultIconColor}`);
    }
    assertCheck(result.hover.background === "rgba(110, 255, 210, 0.1)", `Home ${width} hover background is ${result.hover.background}`);
    assertCheck(result.hover.iconColor === "rgba(255, 255, 255, 0.98)", `Home ${width} hover icon color is ${result.hover.iconColor}`);
    assertCheck(metrics.menuRole === "menu", `Home ${width} menu role is ${metrics.menuRole}`);
    assertCheck(metrics.itemRoles.every(value => value === "menuitem"), `Home ${width} menu item roles are ${metrics.itemRoles.join(",")}`);
  } else {
    assertCheck(metrics.linkDisplay === "inline-flex" || metrics.linkDisplay === "flex" || metrics.linkDisplay === "block", `Home ${width} visible link display is ${metrics.linkDisplay}`);
  }
  const mastheadControls = [metrics.buttonRect, metrics.searchRect, metrics.themeRect].filter(rect => rect && rect.width > 0 && rect.height > 0);
  assertCheck(mastheadControls.every(rect => rect.left >= -1 && rect.right <= width + 1), `Home ${width} masthead control extends outside viewport`);
  assertCheck(mastheadControls.every(rect => rect.width >= 32 && rect.height >= 32), `Home ${width} masthead control target is below 32px`);
}

for (const width of hobbiesWidths) {
  const result = await withTarget(width, 900, width <= 560, async ({ Page, Runtime, Input }) => {
    await prepareTheme(Page, Runtime, Input, "/hobbies/", "light");
    const metrics = await evaluate(Runtime, hobbiesMetricsExpression);
    await stabilizeHobbiesCanvasForScreenshot(Runtime);
    const screenshot = await capture(Page, `hobbies_${width}.png`);
    return { width, screenshot, metrics };
  });

  report.hobbies.push(result);
  const metrics = result.metrics;
  assertCheck(metrics.visualOverflow <= 1, `Hobbies ${width} has horizontal overflow ${metrics.visualOverflow}`);
  assertCheck(metrics.buttons.length === 3, `Hobbies ${width} button count is ${metrics.buttons.length}`);
  assertCheck(metrics.hitResults.every(value => value === "ok"), `Hobbies ${width} button hit test failed ${metrics.hitResults.join(",")}`);
  assertCheck(metrics.buttons.every(button => button.left >= -1 && button.right <= width + 1), `Hobbies ${width} button extends outside viewport`);
  assertCheck(metrics.buttons.every(button => button.width >= 36 && button.height >= 36), `Hobbies ${width} button target is below 36px`);
  if (width <= 560) {
    assertCheck(metrics.footerDisplay === "grid", `Hobbies ${width} footer display is ${metrics.footerDisplay}`);
  }
}

if (!report.keyboard) report.keyboard = await withTarget(454, 900, true, async ({ Page, Runtime, Input }) => {
  await prepareTheme(Page, Runtime, Input, "/", "light");
  const initialExpanded = await evaluate(Runtime, `document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded")`);
  await Runtime.evaluate({ expression: `document.querySelector(".greedy-nav__toggle").focus()` });
  await delay(150);
  await sendKey(Input, "ArrowDown", "ArrowDown", 40);
  await delay(250);
  const afterOpen = await evaluate(Runtime, `(() => ({
    expanded: document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded"),
    activeText: document.activeElement.textContent.trim().replace(/\\s+/g, " "),
    activeRole: document.activeElement.getAttribute("role"),
    focusShadow: getComputedStyle(document.activeElement).boxShadow,
    focusOutline: getComputedStyle(document.activeElement).outlineStyle,
    focusBackground: getComputedStyle(document.activeElement).backgroundColor,
    menuHidden: document.querySelector(".hidden-links").classList.contains("hidden")
  }))()`);
  const screenshot = null;
  await sendKey(Input, "ArrowDown", "ArrowDown", 40);
  await delay(140);
  const second = await evaluate(Runtime, `document.activeElement.textContent.trim().replace(/\\s+/g, " ")`);
  await sendKey(Input, "ArrowUp", "ArrowUp", 38);
  await delay(140);
  const back = await evaluate(Runtime, `document.activeElement.textContent.trim().replace(/\\s+/g, " ")`);
  await sendKey(Input, "Escape", "Escape", 27);
  await delay(250);
  const afterEscape = await evaluate(Runtime, `(() => ({
    expanded: document.querySelector(".greedy-nav__toggle").getAttribute("aria-expanded"),
    activeTag: document.activeElement.tagName,
    activeClass: String(document.activeElement.className),
    menuHidden: document.querySelector(".hidden-links").classList.contains("hidden")
  }))()`);
  return { initialExpanded, afterOpen, second, back, afterEscape, screenshot };
});

assertCheck(report.keyboard.initialExpanded === "false", `Keyboard initial aria expanded is ${report.keyboard.initialExpanded}`);
assertCheck(report.keyboard.afterOpen.expanded === "true", "Keyboard did not open menu");
assertCheck(report.keyboard.afterOpen.activeText === "CV", `Keyboard first focus is ${report.keyboard.afterOpen.activeText}`);
assertCheck(report.keyboard.afterOpen.activeRole === "menuitem", `Keyboard focus role is ${report.keyboard.afterOpen.activeRole}`);
assertCheck(report.keyboard.afterOpen.focusShadow !== "none" || report.keyboard.afterOpen.focusOutline !== "none", "Keyboard focus style is missing");
assertCheck(report.keyboard.second === "Certifications", `Keyboard ArrowDown target is ${report.keyboard.second}`);
assertCheck(report.keyboard.back === "CV", `Keyboard ArrowUp target is ${report.keyboard.back}`);
assertCheck(report.keyboard.afterEscape.expanded === "false" && report.keyboard.afterEscape.menuHidden === true, "Keyboard Escape did not close menu");

if (report.theme.length === 0) {
const themeRoutes = ["/", "/hobbies/", "/links.html", "/soldering-101/"];
const themeCases = [
  { name: "system-light-default", system: "light", storedMode: null, expectedTheme: "light", expectedMode: "light", expectedSource: "system", expectedStored: null },
  { name: "system-dark-default", system: "dark", storedMode: null, expectedTheme: "night", expectedMode: "night", expectedSource: "system", expectedStored: null },
  { name: "saved-light-over-system-dark", system: "dark", storedMode: "light", expectedTheme: "light", expectedMode: "light", expectedSource: "stored", expectedStored: "light" },
  { name: "saved-night-over-system-light", system: "light", storedMode: "night", expectedTheme: "night", expectedMode: "night", expectedSource: "stored", expectedStored: "night" }
];

for (const testCase of themeCases) {
  for (const route of themeRoutes) {
    const result = await withTarget(454, 900, true, async ({ Page, Runtime, Input }) => {
      await prepareTheme(Page, Runtime, Input, route, testCase.storedMode);
      const metrics = await evaluate(Runtime, themeMetricsExpression);
      const clicked = await clickThemeToggle(Runtime, Input);
      const afterClick = await evaluate(Runtime, themeMetricsExpression);
      return { case: testCase.name, route, metrics, clicked, afterClick };
    }, { colorScheme: testCase.system });

    report.theme.push(result);
    const metrics = result.metrics;
    const afterClick = result.afterClick;
    const expectedClickTheme = testCase.expectedTheme === "night" ? "light" : "night";
    assertCheck(metrics.theme === testCase.expectedTheme, `${testCase.name} ${route} theme is ${metrics.theme}`);
    assertCheck(metrics.mode === testCase.expectedMode, `${testCase.name} ${route} mode is ${metrics.mode}`);
    assertCheck(metrics.source === testCase.expectedSource, `${testCase.name} ${route} source is ${metrics.source}`);
    assertCheck(metrics.stored === testCase.expectedStored, `${testCase.name} ${route} stored mode is ${metrics.stored}`);
    assertCheck(metrics.visualOverflow <= 1, `${testCase.name} ${route} has horizontal overflow ${metrics.visualOverflow}`);
    assertCheck(metrics.buttonVisible === true, `${testCase.name} ${route} theme button is not visible`);
    assertCheck(metrics.hitResult === "ok", `${testCase.name} ${route} theme button hit test failed ${metrics.hitResult}`);
    assertCheck(metrics.button && metrics.button.width >= 32 && metrics.button.height >= 32, `${testCase.name} ${route} theme button target is below 32px`);
    assertCheck(metrics.buttonMode === testCase.expectedMode, `${testCase.name} ${route} button mode is ${metrics.buttonMode}`);
    assertCheck(metrics.buttonActive === testCase.expectedTheme, `${testCase.name} ${route} button active theme is ${metrics.buttonActive}`);
    assertCheck(metrics.buttonLabel && metrics.buttonLabel.indexOf("Theme mode is") === 0, `${testCase.name} ${route} button label is missing`);
    assertCheck(result.clicked === true, `${testCase.name} ${route} theme button could not be clicked`);
    assertCheck(afterClick.theme === expectedClickTheme, `${testCase.name} ${route} clicked theme is ${afterClick.theme}`);
    assertCheck(afterClick.mode === expectedClickTheme, `${testCase.name} ${route} clicked mode is ${afterClick.mode}`);
    assertCheck(afterClick.source === "stored", `${testCase.name} ${route} clicked source is ${afterClick.source}`);
    assertCheck(afterClick.stored === expectedClickTheme, `${testCase.name} ${route} clicked stored mode is ${afterClick.stored}`);
  }
}
}

for (const mode of ["light", "night"]) {
  for (const width of themeWidths) {
    for (const routeInfo of [{ route: "/", name: "home" }, { route: "/hobbies/", name: "hobbies" }]) {
      const result = await withTarget(width, 900, width <= 560, async ({ Page, Runtime, Input }) => {
        await prepareTheme(Page, Runtime, Input, routeInfo.route, mode);
        const metrics = await evaluate(Runtime, themeMetricsExpression);
        if (routeInfo.route === "/hobbies/") {
          await stabilizeHobbiesCanvasForScreenshot(Runtime);
        }
        const screenshot = await capture(Page, `theme_${mode}_${routeInfo.name}_${width}.png`);
        return { mode, width, route: routeInfo.route, screenshot, metrics };
      }, { colorScheme: mode === "night" ? "dark" : "light" });

      report.themeScreenshots.push(result);
      assertCheck(result.metrics.theme === mode, `Theme screenshot ${mode} ${routeInfo.route} ${width} theme is ${result.metrics.theme}`);
      assertCheck(result.metrics.visualOverflow <= 1, `Theme screenshot ${mode} ${routeInfo.route} ${width} has horizontal overflow ${result.metrics.visualOverflow}`);
      assertCheck(result.metrics.buttonVisible === true, `Theme screenshot ${mode} ${routeInfo.route} ${width} button is not visible`);
      assertCheck(result.metrics.button && result.metrics.button.width >= 32 && result.metrics.button.height >= 32, `Theme screenshot ${mode} ${routeInfo.route} ${width} button target is below 32px`);
    }
  }
}

const displayRoutes = [
  { route: "/", name: "home" },
  { route: "/hobbies/", name: "hobbies" },
  { route: "/links.html", name: "links" },
  { route: "/soldering-101/", name: "soldering" }
];
const displayScreenshotRoutes = new Set(["/", "/hobbies/"]);

for (const profile of displayViewports) {
  for (const mode of ["light", "night"]) {
    for (const routeInfo of displayRoutes) {
      const result = await withTarget(profile.width, profile.height, false, async ({ Page, Runtime, Input }) => {
        await prepareTheme(Page, Runtime, Input, routeInfo.route, mode);
        const metrics = await evaluate(Runtime, displayMetricsExpression);
        if (routeInfo.route === "/hobbies/") {
          await stabilizeHobbiesCanvasForScreenshot(Runtime);
        }
        const screenshot = displayScreenshotRoutes.has(routeInfo.route)
          ? await capture(Page, `display_${mode}_${routeInfo.name}_${profile.fileLabel}.png`)
          : null;
        const clicked = await clickThemeToggle(Runtime, Input);
        const afterClick = await evaluate(Runtime, displayMetricsExpression);
        return { profile, mode, route: routeInfo.route, screenshot, metrics, clicked, afterClick };
      }, {
        colorScheme: mode === "night" ? "dark" : "light",
        deviceScaleFactor: profile.deviceScaleFactor
      });

      report.display.push(result);
      const context = `Display ${profile.label} ${mode} ${routeInfo.route}`;
      const metrics = result.metrics;
      const viewport = metrics.viewport;
      const visibleControls = metrics.controls.filter(control => control.visible);
      const layoutRects = [metrics.sidebar, metrics.authorLinks, metrics.content, metrics.footer].filter(Boolean);
      const expectedAfterClick = nextThemeMode(mode);

      assertCheck(metrics.theme === mode, `${context} theme is ${metrics.theme}`);
      assertCheck(metrics.mode === mode, `${context} mode is ${metrics.mode}`);
      assertCheck(closeTo(viewport.devicePixelRatio, profile.deviceScaleFactor), `${context} DPR is ${viewport.devicePixelRatio}`);
      assertCheck(metrics.visualOverflow <= 1, `${context} has horizontal overflow ${metrics.visualOverflow}`);
      const expectedMainMaxWidth = expectedDisplayMainMaxWidth(routeInfo.route, profile.width);
      if (expectedMainMaxWidth !== null) {
        assertCheck(metrics.main && metrics.main.width <= expectedMainMaxWidth, `${context} #main width is ${metrics.main ? metrics.main.width : "missing"} expected <= ${expectedMainMaxWidth}`);
      }
      if (routeInfo.route === "/") {
        const expectedGap = expectedHomeSidebarPostGap(profile.width);
        assertCheck(metrics.homeLayout.sidebarToContentGap !== null, `${context} home sidebar/posts gap is missing`);
        assertCheck(metrics.homeLayout.sidebarToContentGap >= expectedGap - 4, `${context} home sidebar/posts gap is ${metrics.homeLayout.sidebarToContentGap} expected >= ${expectedGap - 4}`);
      }
      assertCheck(layoutRects.every(rect => rectInsideViewportHorizontally(rect, profile.width)), `${context} page layout extends outside viewport`);
      assertCheck(metrics.themeButtonVisible === true, `${context} theme button is not visible`);
      assertCheck(metrics.themeButtonHitResult === "ok", `${context} theme button hit test failed ${metrics.themeButtonHitResult}`);
      assertCheck(result.clicked === true, `${context} theme button could not be clicked`);
      assertCheck(result.afterClick.theme === expectedAfterClick, `${context} clicked theme is ${result.afterClick.theme}`);
      assertCheck(result.afterClick.mode === expectedAfterClick, `${context} clicked mode is ${result.afterClick.mode}`);

      if (profile.width >= 1440) {
        assertCheck(metrics.navMode === "visible", `${context} masthead nav mode is ${metrics.navMode}`);
        assertCheck(metrics.hiddenLinkCount === 0, `${context} hidden masthead link count is ${metrics.hiddenLinkCount}`);
        assertCheck(metrics.visibleLinkCount > 0, `${context} visible masthead links are missing`);
        assertCheck(metrics.visibleLinkCount === 4, `${context} visible masthead link count is ${metrics.visibleLinkCount}`);
        assertCheck(metrics.visibleLinkRects.every(rect => rectInsideViewport(rect, profile.width, profile.height)), `${context} masthead link extends outside viewport`);
        assertCheck(metrics.visibleLinkGaps.length === 3, `${context} masthead link gap count is ${metrics.visibleLinkGaps.length}`);
        assertCheck(metrics.visibleLinkGaps.every(gap => gap >= minVisibleLinkGap(profile.width)), `${context} masthead link gaps are ${metrics.visibleLinkGaps.join(",")}`);
        assertCheck(visibleControls.every(control => rectInsideViewport(control.rect, profile.width, profile.height)), `${context} masthead control extends outside viewport`);
        assertCheck(visibleControls.every(control => rectAtLeast(control.rect, 32)), `${context} masthead control target is below 32px`);

        if (routeInfo.route === "/") {
          const firstVisibleLink = metrics.visibleLinkRects[0];
          const capacitors = metrics.pcbComponents.capacitors.filter(component => component.visible && component.opacity > 0.2);
          const resistors = metrics.pcbComponents.resistors.filter(component => component.visible && component.opacity > 0.2);
          const labels = metrics.pcbComponents.labels.filter(component => component.visible && component.opacity > 0.2);
          const corridorLabels = labels.filter(component => rectBetween(component.rect, metrics.cpu, firstVisibleLink, 12));
          const blockers = [
            metrics.cpu,
            ...metrics.visibleLinkRects,
            ...visibleControls.map(control => control.rect)
          ].filter(Boolean);
          assertCheck(capacitors.length > 0, `${context} PCB capacitor is missing`);
          assertCheck(resistors.length > 0, `${context} PCB resistor is missing`);
          assertCheck(firstVisibleLink.left - metrics.cpu.right >= minTitleToFirstPillGap(profile.width), `${context} title-to-first-pill gap is ${firstVisibleLink.left - metrics.cpu.right}`);
          assertCheck(capacitors.every(component => rectInsideViewport(component.rect, profile.width, profile.height)), `${context} PCB capacitor extends outside viewport`);
          assertCheck(resistors.every(component => rectInsideViewport(component.rect, profile.width, profile.height)), `${context} PCB resistor extends outside viewport`);
          assertCheck(capacitors.some(component => rectBetween(component.rect, metrics.cpu, firstVisibleLink)), `${context} PCB capacitor is not between title and first nav pill`);
          assertCheck(resistors.some(component => rectBetween(component.rect, metrics.cpu, firstVisibleLink)), `${context} PCB resistor is not between title and first nav pill`);
          assertCheck(capacitors.every(component => rectClearOf(component.rect, blockers, 1)), `${context} PCB capacitor overlaps title, pill, or control`);
          assertCheck(resistors.every(component => rectClearOf(component.rect, blockers, 1)), `${context} PCB resistor overlaps title, pill, or control`);
          assertCheck(corridorLabels.every(component => rectClearOf(component.rect, blockers, 1)), `${context} PCB title-to-pill label overlaps title, pill, or control`);
          assertCheck(capacitors.every(capacitor => resistors.every(resistor => !rectsOverlap(capacitor.rect, resistor.rect, 1))), `${context} PCB capacitor overlaps resistor`);
        }
      }

      if (routeInfo.route === "/hobbies/") {
        const hobby = metrics.hobby;
        assertCheck(hobby.isPage === true, `${context} hobby shell is missing`);
        assertCheck(hobby.shell && rectInsideViewportHorizontally(hobby.shell, profile.width, 16), `${context} hobby shell extends outside viewport`);
        assertCheck(hobby.shell && hobby.shell.width >= profile.width - 2, `${context} hobby shell width is ${hobby.shell ? hobby.shell.width : "missing"}`);
        assertCheck(hobby.shellBackgroundImage && hobby.shellBackgroundImage !== "none", `${context} hobby shell background is blank`);
        assertCheck(hobby.stage && rectInsideViewport(hobby.stage, profile.width, profile.height), `${context} hobby stage is outside viewport`);
        assertCheck(hobby.stage && hobby.shell && Math.abs(hobby.stage.centerX - hobby.shell.centerX) <= 3, `${context} hobby stage is not centered`);
        assertCheck(hobby.canvas && rectInsideViewportHorizontally(hobby.canvas, profile.width, 16), `${context} hobby canvas extends outside viewport`);
        assertCheck(hobby.canvasWidth > 0 && hobby.canvasHeight > 0, `${context} hobby canvas is blank or uninitialized`);
      }
    }
  }
}

for (const message of consoleMessages) {
  assertCheck(false, `Console ${message.type} at ${message.url || "page"} ${message.text || ""}`);
}

for (const message of networkMessages) {
  assertCheck(false, `Network ${message.type} at ${message.url || "request"} ${message.status || ""} ${message.errorText || ""}`);
}

const reportPath = path.join(outputDir, "browser-verification.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  reportPath,
  outputDir,
  homeChecks: report.home.length,
  hobbiesChecks: report.hobbies.length,
  themeChecks: report.theme.length,
  displayChecks: report.display.length,
  themeScreenshots: report.themeScreenshots.length,
  consoleMessages: consoleMessages.length,
  networkMessages: networkMessages.length,
  failures: failures.length
}, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
'@

$CdpScriptPath = Join-Path $ToolCachePath "verify-browser-pages.cjs"
Set-Content -LiteralPath $CdpScriptPath -Value $NodeScript -Encoding UTF8

try {
  Wait-BrowserDebugEndpoint -Port $DebugPort
  Write-Host "Writing verification artifacts to $OutputPath"
  Invoke-Native { & $Node.Node $CdpScriptPath }
} finally {
  $env:NODE_PATH = $PreviousNodePath
  if (-not $KeepBrowser -and $BrowserProcess -and -not $BrowserProcess.HasExited) {
    Stop-Process -Id $BrowserProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

if (-not $SkipScreenshots -and -not $SkipVisualValidation) {
  $VisualArgs = @{
    ArtifactDirectory = $OutputPath
    MaxPixelDiffPercent = $MaxPixelDiffPercent
    UpdateMissingBaselines = $true
  }

  if ($VisualBaselineDirectory) {
    $VisualArgs.BaselineDirectory = $VisualBaselineDirectory
  }

  if ($UpdateVisualBaselines) {
    $VisualArgs.UpdateBaselines = $true
  }

  if ($RequireVisualBaselines) {
    $VisualArgs.RequireBaselines = $true
  }

  & (Join-Path $ScriptDir "verify-visual-artifacts.ps1") @VisualArgs
}
