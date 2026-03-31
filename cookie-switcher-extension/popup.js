const API_URL_KEY = "cloudApiUrl";
const DEFAULT_API_URL = "https://extension-convert-cookie-freepik--thuan18092003.replit.app/";
let runtimeProfiles = [];
let currentActiveProfileId = "";
let currentActiveProfileName = "";
let currentActiveIsExpired = false;

const profileNameInput = document.getElementById("profileName");
const cookieJsonInput = document.getElementById("cookieJson");
const saveBtn = document.getElementById("saveBtn");
const captureBtn = document.getElementById("captureBtn");
const importFileInput = document.getElementById("importFile");
const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");
const apiUrlInput = document.getElementById("apiUrl");
const saveApiBtn = document.getElementById("saveApiBtn");
const capturePushBtn = document.getElementById("capturePushBtn");
const pushCloudBtn = document.getElementById("pushCloudBtn");
const pullCloudBtn = document.getElementById("pullCloudBtn");
const profilesContainer = document.getElementById("profiles");
const statusEl = document.getElementById("status");
const currentAccountEl = document.getElementById("currentAccount");
const currentAccountTextEl = document.getElementById("currentAccountText");

const ACTIVE_BY_HOST_KEY = "activeByHostProfile";
const CURRENT_ACCOUNT_RECHECK_DELAY_MS = 1500;

init();

function init() {
  if (saveBtn) saveBtn.addEventListener("click", onSaveProfile);
  if (captureBtn)
    captureBtn.addEventListener("click", onCaptureCurrentTabCookies);
  if (importFileInput) importFileInput.addEventListener("change", onImportFile);
  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", () => importFileInput.click());
  }
  if (exportBtn) exportBtn.addEventListener("click", onExportBackup);
  if (saveApiBtn) saveApiBtn.addEventListener("click", onSaveApiUrl);
  if (capturePushBtn)
    capturePushBtn.addEventListener("click", onCaptureAndPushCloud);
  if (pushCloudBtn) pushCloudBtn.addEventListener("click", onPushCloud);
  if (pullCloudBtn) pullCloudBtn.addEventListener("click", onPullCloud);
  bootstrapCloudData();
}

async function bootstrapCloudData() {
  await loadApiUrl();
  setStatus("Dang tai danh sach ho so...");
  await onPullCloud();
  await updateCurrentAccountIndicator();
  // Cap nhat label nut theo tai khoan dang dung.
  await renderProfiles();
}

async function loadApiUrl() {
  const stored = await chrome.storage.local.get(API_URL_KEY);
  if (apiUrlInput) {
    apiUrlInput.value = (stored[API_URL_KEY] || DEFAULT_API_URL).trim();
  }
}

async function onSaveProfile() {
  let parsed = null;
  let suggestedName = profileNameInput.value.trim();

  if (cookieJsonInput.value.trim()) {
    try {
      parsed = validateCookiePayload(JSON.parse(cookieJsonInput.value));
    } catch (error) {
      setStatus(`JSON khong hop le: ${error.message}`, true);
      return;
    }
  } else {
    const captured = await captureCurrentTabData();
    if (!captured) {
      return;
    }
    parsed = captured.payload;
    cookieJsonInput.value = JSON.stringify(parsed, null, 2);
    if (!suggestedName) {
      suggestedName = buildAutoProfileName(captured.identity, captured.baseUrl);
      profileNameInput.value = suggestedName;
    }
  }

  if (!suggestedName) {
    let baseUrl;
    try {
      baseUrl = new URL(parsed.url);
    } catch (error) {
      setStatus("Khong the tao ten ho so tu URL.", true);
      return;
    }
    suggestedName = buildAutoProfileName(null, baseUrl);
    profileNameInput.value = suggestedName;
  }

  const profile = {
    id: generateCloudId(),
    name: suggestedName,
    createdAt: new Date().toISOString(),
    data: parsed,
    transactionDate: new Date().toISOString(),
    accountNumber: suggestedName,
    status: "active",
  };

  const saved = await saveProfileToCloud(profile);
  if (!saved) {
    return;
  }

  cookieJsonInput.value = "";
  profileNameInput.value = "";
  await onPullCloud();
  setStatus("Da luu len Database va dong bo danh sach.");
}

async function onCaptureCurrentTabCookies() {
  const captured = await captureCurrentTabData();
  if (!captured) {
    return;
  }

  cookieJsonInput.value = JSON.stringify(captured.payload, null, 2);
  const autoName = buildAutoProfileName(captured.identity, captured.baseUrl);
  if (!profileNameInput.value.trim() && autoName) {
    profileNameInput.value = autoName;
  }

  if (captured.identity?.email) {
    setStatus(
      `Da lay ${captured.payload.cookies.length} cookie va tim thay email ${captured.identity.email}.`,
    );
  } else {
    setStatus(
      `Da lay ${captured.payload.cookies.length} cookie tu ${captured.baseUrl.hostname}. Chua tim thay email.`,
    );
  }
}

async function captureCurrentTabData() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url) {
      setStatus("Khong the doc URL cua tab hien tai.", true);
      return;
    }

    const baseUrl = new URL(tab.url);
    if (!/^https?:$/.test(baseUrl.protocol)) {
      setStatus("Chi ho tro tab http/https.", true);
      return null;
    }

    const allCookies = await chrome.cookies.getAll({});
    const matchedCookies = allCookies.filter((cookie) => {
      if (!cookie?.domain) return false;
      return cookieDomainMatchesHost(cookie.domain, baseUrl.hostname);
    });
    const payload = {
      url: `${baseUrl.protocol}//${baseUrl.hostname}`,
      cookies: matchedCookies,
    };

    const identity = await extractAccountIdentityFromPage(tab.id);
    return { payload, identity, baseUrl };
  } catch (error) {
    setStatus(`Lay cookie that bai: ${error.message}`, true);
    return null;
  }
}

async function onImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const profilesToSave = parseImportPayload(raw);
    if (!profilesToSave.length) {
      setStatus("File khong dung dinh dang profile cookie.", true);
      return;
    }

    const saved = await saveProfilesToCloud(profilesToSave);
    if (!saved) {
      return;
    }
    await onPullCloud();
    setStatus(
      `Da nhap file va luu ${profilesToSave.length} ho so len Database.`,
    );
  } catch (error) {
    setStatus(`Nhap that bai: ${error.message}`, true);
  } finally {
    importFileInput.value = "";
  }
}

async function onSaveApiUrl() {
  const rawInput = apiUrlInput.value.trim();
  if (!rawInput) {
    setStatus("Vui long nhap URL API.", true);
    return;
  }

  const normalizedUrl = normalizeApiInput(rawInput);
  if (!normalizedUrl) {
    setStatus("Gia tri khong hop le. Vui long nhap URL API hop le.", true);
    return;
  }

  await chrome.storage.local.set({ [API_URL_KEY]: normalizedUrl });
  if (apiUrlInput) {
    apiUrlInput.value = normalizedUrl;
  }
  setStatus("Da luu URL API.");
  await onPullCloud();
}

async function onPushCloud() {
  const profiles = runtimeProfiles;
  if (!profiles.length) {
    setStatus("Chua co ho so de day len Database.", true);
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const profile of profiles) {
    const ok = await updateProfileInCloud(profile);
    if (ok) {
      updated += 1;
    } else {
      failed += 1;
    }
  }
  if (failed > 0) {
    setStatus(`Update that bai ${failed}/${profiles.length} profile.`, true);
    return;
  }
  setStatus(`Da update ${updated} profile len Database.`);
}

async function onCaptureAndPushCloud() {
  const captured = await captureCurrentTabData();
  if (!captured) {
    return;
  }

  const autoName = buildAutoProfileName(captured.identity, captured.baseUrl);
  const profile = {
    id: generateCloudId(),
    name: autoName,
    createdAt: new Date().toISOString(),
    data: captured.payload,
    transactionDate: new Date().toISOString(),
    accountNumber: autoName || true,
    status: "active",
  };

  const saved = await saveProfileToCloud(profile);
  if (!saved) {
    return;
  }

  await onPullCloud();
  setStatus(`Da lay cookie va day len Database: ${profile.name}`);
}

async function onPullCloud() {
  const apiUrl = await getSavedApiUrl();
  if (!apiUrl) {
    setStatus("Chua co URL API.", true);
    return;
  }

  try {
    let data = null;
    const candidates = [apiUrl, `${apiUrl}?action=list_profiles`];
    let lastError = "";
    for (const endpoint of candidates) {
      try {
        const result = await requestJsonWithRaw(endpoint, { method: "GET" });
        if (!result.ok) {
          lastError = `HTTP ${result.status} | ${shortenText(result.rawText)}`;
          continue;
        }
        if (!result.jsonData) {
          lastError = `JSON khong hop le | ${shortenText(result.rawText)}`;
          continue;
        }
        data = result.jsonData;
        break;
      } catch (error) {
        lastError = error.message;
      }
    }

    if (!data) {
      setStatus(
        `Lay du lieu that bai: ${lastError || "Khong co du lieu"}`,
        true,
      );
      return;
    }

    const pulledProfiles = normalizeRemoteProfiles(data);
    if (!pulledProfiles.length) {
      setStatus("API khong tra ve profile hop le.", true);
      return;
    }

    runtimeProfiles = pulledProfiles;
    await renderProfiles();
    setStatus(`Da tai ${pulledProfiles.length} ho so.`);
  } catch (error) {
    setStatus(`Tai danh sach that bai: ${error.message}`, true);
  }
}

async function onExportBackup() {
  const apiUrl = await getSavedApiUrl();
  if (!apiUrl) {
    setStatus("Chua co URL API.", true);
    return;
  }

  try {
    let data = null;
    const candidates = [apiUrl, `${apiUrl}?action=list_profiles`];
    let lastError = "";

    for (const endpoint of candidates) {
      try {
        const result = await requestJsonWithRaw(endpoint, { method: "GET" });
        if (!result.ok) {
          lastError = `HTTP ${result.status} | ${shortenText(result.rawText)}`;
          continue;
        }
        if (!result.jsonData) {
          lastError = `JSON khong hop le | ${shortenText(result.rawText)}`;
          continue;
        }
        data = result.jsonData;
        break;
      } catch (error) {
        lastError = error.message;
      }
    }

    if (!data) {
      setStatus(
        `Xuat backup that bai: ${lastError || "Khong co du lieu"}`,
        true,
      );
      return;
    }

    const pulledProfiles = normalizeRemoteProfiles(data);
    if (!pulledProfiles.length) {
      setStatus("Khong co du lieu de export.", true);
      return;
    }

    const exportItems = pulledProfiles
      .map((profile) => {
        const cookiePayload = profile?.data || {};
        return {
          id: profile.id,
          name: profile.name,
          createdAt: profile.createdAt,
          transactionDate: profile.transactionDate,
          accountNumber: profile.accountNumber,
          status: profile.status || "active",
          url: cookiePayload.url,
          cookies: cookiePayload.cookies,
        };
      })
      .filter(
        (item) => typeof item?.url === "string" && Array.isArray(item?.cookies),
      );

    const fileText = JSON.stringify(exportItems, null, 2);
    const safeDate = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    const filename = `cookie-backup-${safeDate}.json`;
    const blob = new Blob([fileText], {
      type: "application/json;charset=utf-8",
    });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    setStatus(`Da export ${exportItems.length} ho so backup.`);
  } catch (error) {
    setStatus(`Xuat backup that bai: ${error.message}`, true);
  }
}

function createIconSvg(kind) {
  const paths = {
    check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z",
    swap: "M7 7h10l-3-3 1.4-1.4L22 8l-6.6 5.4L14 12l3-3H7V7Zm10 10H7l3 3-1.4 1.4L2 16l6.6-5.4L10 16l-3 3h10v-2Z",
    trash: "M6 7h12l-1 14H7L6 7Zm3-3h6l1 2H8l1-2Z",
  };

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("btn-icon");

  const pathD = paths[kind] || paths.swap;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

async function renderProfiles() {
  const profiles = runtimeProfiles;
  profilesContainer.innerHTML = "";

  if (!profiles.length) {
    profilesContainer.innerHTML =
      "<p class='profile-meta'>Chua co ho so nao duoc luu.</p>";
    return;
  }

  for (const profile of profiles) {
    const wrapper = document.createElement("div");
    wrapper.className = "profile-item";

    const title = document.createElement("p");
    title.className = "profile-name";
    title.textContent = profile.name;

    const meta = document.createElement("p");
    meta.className = "profile-meta";
    const transactionText = profile.transactionDate
      ? formatTransactionDate(profile.transactionDate)
      : "khong ro ngay";
    const accountText =
      typeof profile.accountNumber === "boolean"
        ? String(profile.accountNumber)
        : profile.accountNumber || "N/A";
    const statusText = profile.status || "active";
    meta.textContent = `${profile.data.cookies.length} cookie | ${profile.data.url} | ${transactionText} | account: ${accountText} | ${statusText}`;

    const actions = document.createElement("div");
    actions.className = "row";

    const applyBtn = document.createElement("button");
    const isActive = profile.id && currentActiveProfileId === profile.id;
    applyBtn.className = isActive ? "active" : "";
    applyBtn.disabled = Boolean(isActive);
    applyBtn.addEventListener("click", () => onApplyProfile(profile.id));

    const applyText = document.createElement("span");
    applyText.className = "btn-text";
    applyText.textContent = isActive ? "Dang dung" : "Chuyen";
    applyBtn.appendChild(applyText);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    const deleteText = document.createElement("span");
    deleteText.className = "btn-text";
    deleteText.textContent = "Xoa";
    deleteBtn.appendChild(deleteText);
    deleteBtn.addEventListener("click", () => onDeleteProfile(profile.id));

    actions.appendChild(applyBtn);
    actions.appendChild(deleteBtn);

    wrapper.appendChild(title);
    wrapper.appendChild(meta);
    wrapper.appendChild(actions);
    profilesContainer.appendChild(wrapper);
  }
}

async function onDeleteProfile(profileId) {
  const profiles = runtimeProfiles;
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    setStatus("Khong tim thay profile de xoa.", true);
    return;
  }

  const deleted = await deleteProfileFromCloud(profile);
  if (!deleted) {
    return;
  }

  await onPullCloud();
  setStatus("Da xoa profile tren Database.");
}

async function onApplyProfile(profileId) {
  const profiles = runtimeProfiles;
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    setStatus("Khong tim thay ho so.", true);
    return;
  }

  const target = new URL(profile.data.url);
  setStatus("Dang ap dung cookie, vui long doi...");

  try {
    // Luu "lan ap dung gan nhat" de popup co the hien thi nhanh tai khoan phu hop.
    if (target.hostname) {
      setCurrentAccountIndicator(`Dang tai: ${profile.name}`);
      await saveActiveProfileForHost(target.hostname, profile.id, profile.name);
    }
    // Hien thi ngay "Dang dung" cho profile vua duoc chuyen sang.
    currentActiveProfileId = profile.id;
    currentActiveProfileName = profile.name || "";
    await renderProfiles();

    const relatedDomains = collectRelatedDomains(
      profile.data.cookies,
      target.hostname,
    );
    for (const domain of relatedDomains) {
      const existingCookies = await chrome.cookies.getAll({ domain });
      for (const cookie of existingCookies) {
        await removeCookieByObject(cookie);
      }
    }

    let successCount = 0;
    let failedCount = 0;
    for (const cookie of profile.data.cookies) {
      try {
        await setCookieFromObject(cookie, target.origin);
        successCount += 1;
      } catch (error) {
        failedCount += 1;
      }
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id && tab.url?.includes(target.hostname)) {
      await chrome.tabs.reload(tab.id);
    } else {
      await chrome.tabs.create({ url: profile.data.url });
    }

    setStatus(
      `Da ap dung ho so ${profile.name}. Thanh cong ${successCount}, that bai ${failedCount}.`,
      failedCount > 0,
    );

    // Sau khi reload/tab open, cookie co the duoc cap nhat. Recheck de hien thi "khop cookie".
    setTimeout(() => {
      (async () => {
        await updateCurrentAccountIndicator();
        await renderProfiles();
      })().catch(() => { });
    }, CURRENT_ACCOUNT_RECHECK_DELAY_MS);
  } catch (error) {
    setStatus(`Ap dung that bai: ${error.message}`, true);
  }
}

async function setCookieFromObject(cookie, fallbackOrigin) {
  const cookieUrl = buildCookieUrl(cookie, fallbackOrigin);
  const details = {
    url: cookieUrl,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: normalizeSameSite(cookie.sameSite),
  };

  if (!cookie.session && Number.isFinite(cookie.expirationDate)) {
    details.expirationDate = Number(cookie.expirationDate);
  }
  if (cookie.domain && !cookie.hostOnly) {
    details.domain = cookie.domain;
  }
  if (typeof cookie.storeId === "string" && cookie.storeId.length > 0) {
    details.storeId = cookie.storeId;
  }

  await chrome.cookies.set(details);
}

async function removeCookieByObject(cookie) {
  const protocol = cookie.secure ? "https://" : "http://";
  const domain = (cookie.domain || "").replace(/^\./, "");
  const url = `${protocol}${domain}${cookie.path || "/"}`;
  await chrome.cookies.remove({
    url,
    name: cookie.name,
  });
}

function buildCookieUrl(cookie, fallbackOrigin) {
  const protocol = cookie.secure ? "https://" : "http://";
  const domain = (cookie.domain || new URL(fallbackOrigin).hostname).replace(
    /^\./,
    "",
  );
  const path = cookie.path || "/";
  return `${protocol}${domain}${path}`;
}

function normalizeSameSite(raw) {
  if (!raw) {
    return "unspecified";
  }
  const value = String(raw).toLowerCase();
  if (
    value === "lax" ||
    value === "strict" ||
    value === "no_restriction" ||
    value === "unspecified"
  ) {
    return value;
  }
  return "unspecified";
}

function validateCookiePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Du lieu phai la mot object.");
  }
  if (!payload.url || typeof payload.url !== "string") {
    throw new Error("Thieu truong url.");
  }
  if (!Array.isArray(payload.cookies)) {
    throw new Error("cookies phai la mot mang.");
  }
  for (const cookie of payload.cookies) {
    if (!cookie || typeof cookie !== "object") {
      throw new Error("Moi cookie phai la mot object.");
    }
    if (typeof cookie.name !== "string") {
      throw new Error("Bat buoc co ten cookie.");
    }
    if (typeof cookie.value !== "string") {
      throw new Error("Bat buoc co gia tri cookie.");
    }
  }
  return payload;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : "ok"}`;
}

function setCurrentAccountIndicator(message, isError = false) {
  if (!currentAccountEl) return;
  if (currentAccountTextEl) {
    currentAccountTextEl.textContent = message;
  } else {
    currentAccountEl.textContent = message;
  }
  currentAccountEl.className = `status ${isError ? "error" : "ok"}`;
}

async function saveActiveProfileForHost(hostname, profileId, profileName) {
  if (!hostname) return;
  const stored = await chrome.storage.local.get(ACTIVE_BY_HOST_KEY);
  const activeByHost = stored[ACTIVE_BY_HOST_KEY] || {};
  activeByHost[hostname] = {
    profileId: String(profileId || ""),
    profileName: String(profileName || ""),
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [ACTIVE_BY_HOST_KEY]: activeByHost });
}

async function getActiveTabHostname() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.url) return "";
  try {
    return new URL(tab.url).hostname || "";
  } catch (e) {
    return "";
  }
}

function buildCookieKey(cookie) {
  const path =
    typeof cookie?.path === "string" && cookie.path ? cookie.path : "/";
  return `${cookie?.name || ""}|${path}`;
}

async function matchProfileByCookies(hostname) {
  // So khop bang cookie name+path va gia tri cookie.
  // Chi loc theo hostname de tranh so sanh qua nhieu.
  const allCookies = await chrome.cookies.getAll({});
  const actualByKey = new Map();

  for (const cookie of allCookies) {
    if (!cookie) continue;
    if (typeof cookie.name !== "string" || typeof cookie.value !== "string")
      continue;
    if (typeof cookie.domain !== "string" || !cookie.domain.trim()) continue;
    if (!cookieDomainMatchesHost(cookie.domain, hostname)) continue;

    const key = buildCookieKey(cookie);
    actualByKey.set(key, cookie.value);
    if (actualByKey.size > 150) break; // gioi han de giam tai
  }

  if (actualByKey.size < 2) return null;

  let best = null;
  const MIN_MATCH_COUNT = 2;
  const MIN_RATIO = 0.55;

  for (const profile of runtimeProfiles) {
    const profileUrl = profile?.data?.url;
    const profileCookies = profile?.data?.cookies;
    if (!profileUrl || !Array.isArray(profileCookies)) continue;

    let profileHost = "";
    try {
      profileHost = new URL(profileUrl).hostname || "";
    } catch (e) { }

    if (profileHost && !cookieDomainMatchesHost(profileHost, hostname))
      continue;

    const storedByKey = new Map();
    for (const c of profileCookies) {
      if (!c) continue;
      if (typeof c.name !== "string" || typeof c.value !== "string") continue;

      if (typeof c.domain === "string" && c.domain.trim()) {
        if (!cookieDomainMatchesHost(c.domain, hostname)) continue;
      }

      const key = buildCookieKey(c);
      storedByKey.set(key, c.value);
      if (storedByKey.size > 150) break;
    }

    if (storedByKey.size < 2) continue;

    const comparedKeys = [];
    for (const key of storedByKey.keys()) {
      if (actualByKey.has(key)) comparedKeys.push(key);
    }

    if (comparedKeys.length < 2) continue;

    let matchCount = 0;
    for (const key of comparedKeys) {
      if (actualByKey.get(key) === storedByKey.get(key)) {
        matchCount += 1;
      }
    }

    const ratio = matchCount / comparedKeys.length;
    if (matchCount < MIN_MATCH_COUNT) continue;
    if (ratio < MIN_RATIO) continue;

    if (
      !best ||
      ratio > best.ratio ||
      (ratio === best.ratio && matchCount > best.matchCount)
    ) {
      best = {
        profileId: profile.id,
        profileName: profile.name,
        matchCount,
        total: comparedKeys.length,
        ratio,
      };
    }
  }

  return best;
}

async function updateCurrentAccountIndicator() {
  setCurrentAccountIndicator("Dang tai: dang xac dinh ...");
  try {
    currentActiveIsExpired = false;
    const hostname = await getActiveTabHostname();
    if (!hostname) {
      currentActiveProfileId = "";
      currentActiveProfileName = "";
      currentActiveIsExpired = false;
      setCurrentAccountIndicator(
        "Dang tai: chua xac dinh (khong tim thay tab hop le).",
        true,
      );
      return;
    }

    const stored = await chrome.storage.local.get(ACTIVE_BY_HOST_KEY);
    const activeByHost = stored[ACTIVE_BY_HOST_KEY] || {};
    const last = activeByHost[hostname];

    const best = await matchProfileByCookies(hostname);
    if (best?.profileId) {
      currentActiveProfileId = best.profileId;
      currentActiveProfileName = best.profileName || "";
      setCurrentAccountIndicator(
        `Dang tai: ${currentActiveProfileName} (khop cookie ${best.matchCount}/${best.total}${currentActiveIsExpired ? " | Het han" : ""
        }).`,
      );
      // Kiem tra trang dang mo xem co nut "Upgrade" khong (du doan het han).
      currentActiveIsExpired = await detectUpgradeButtonOnActiveTab();
      setCurrentAccountIndicator(
        `Dang tai: ${currentActiveProfileName} (khop cookie ${best.matchCount}/${best.total}${currentActiveIsExpired ? " | Het han" : ""
        }).`,
      );
      return;
    }

    // Fallback theo lan ap dung gan nhat.
    if (last?.profileId) {
      currentActiveProfileId = String(last.profileId);
      currentActiveProfileName = String(last.profileName || "");
      setCurrentAccountIndicator(
        `Dang tai: ${currentActiveProfileName} (theo lan ap dung gan nhat).`,
      );
      currentActiveIsExpired = await detectUpgradeButtonOnActiveTab();
      if (currentActiveIsExpired) {
        setCurrentAccountIndicator(
          `Dang tai: ${currentActiveProfileName} (theo lan ap dung gan nhat | Het han).`,
        );
      }
      return;
    }

    currentActiveProfileId = "";
    currentActiveProfileName = "";
    currentActiveIsExpired = false;
    setCurrentAccountIndicator("Dang tai: chua xac dinh.", true);
  } catch (error) {
    currentActiveProfileId = "";
    currentActiveProfileName = "";
    currentActiveIsExpired = false;
    setCurrentAccountIndicator("Dang tai: khong the xac dinh.", true);
  }
}

async function detectUpgradeButtonOnActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return false;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        const normalize = (s) =>
          String(s || "")
            .replace(/\s+/g, " ")
            .trim();

        const hasUpgradeText = (el) => {
          const text = normalize(el && el.textContent);
          if (!text) return false;
          return /Upgrade/i.test(text);
        };

        const byDataCy = document.querySelector('[data-cy="generate-button"]');
        if (byDataCy && hasUpgradeText(byDataCy)) return true;

        const candidates = Array.from(
          document.querySelectorAll("button,a,[role='button']"),
        );
        for (const el of candidates) {
          if (hasUpgradeText(el)) return true;
        }

        return false;
      },
    });

    return Boolean(results?.[0]?.result);
  } catch (e) {
    return false;
  }
}

async function saveProfileToCloud(profile) {
  const apiUrl = await getSavedApiUrl();
  if (!apiUrl) {
    setStatus("Chua co URL API.", true);
    return false;
  }
  try {
    const cloudPayload = {
      id: String(profile.id || generateCloudId()),
      name: profile.name || "",
      createdAt: profile.createdAt || new Date().toISOString(),
      transactionDate: profile.transactionDate || new Date().toISOString(),
      accountNumber: profile.accountNumber ?? null,
      cookie: JSON.stringify(profile.data),
      status: profile.status || "active",
    };
    const result = await requestJsonWithRaw(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudPayload),
    });
    if (!result.ok) {
      setStatus(
        `Luu len Database that bai: HTTP ${result.status} | ${shortenText(result.rawText)}`,
        true,
      );
      return false;
    }
    return true;
  } catch (error) {
    setStatus(`Luu len Database that bai: ${error.message}`, true);
    return false;
  }
}

async function saveProfilesToCloud(profiles) {
  let saved = 0;
  for (const profile of profiles) {
    if (!profile.id) {
      profile.id = generateCloudId();
    }
    const ok = await saveProfileToCloud(profile);
    if (!ok) {
      setStatus(`Luu nhieu ho so that bai tai id ${profile.id}.`, true);
      return false;
    }
    saved += 1;
  }
  return saved > 0;
}

async function deleteProfileFromCloud(profile) {
  const apiUrl = await getSavedApiUrl();
  if (!apiUrl) {
    setStatus("Chua co URL API.", true);
    return false;
  }

  try {
    const result = await requestJsonWithRaw(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        id: String(profile.id),
      }),
    });
    if (!result.ok) {
      setStatus(
        `Xoa tren Database that bai: HTTP ${result.status} | ${shortenText(result.rawText)}`,
        true,
      );
      return false;
    }
    return true;
  } catch (error) {
    setStatus(`Xoa tren Database that bai: ${error.message}`, true);
    return false;
  }
}

async function updateProfileInCloud(profile) {
  const apiUrl = await getSavedApiUrl();
  if (!apiUrl) {
    setStatus("Chua co URL API.", true);
    return false;
  }
  try {
    const result = await requestJsonWithRaw(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: String(profile.id),
        name: profile.name || "",
        createdAt: profile.createdAt || new Date().toISOString(),
        transactionDate: profile.transactionDate || new Date().toISOString(),
        accountNumber: profile.accountNumber ?? null,
        cookie: JSON.stringify(profile.data),
        status: profile.status || "active",
      }),
    });
    return result.ok;
  } catch (error) {
    return false;
  }
}

async function requestJsonWithRaw(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
  });
  const rawText = await response.text();
  let jsonData = null;
  try {
    jsonData = JSON.parse(rawText);
  } catch (error) {
    jsonData = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    rawText,
    jsonData,
  };
}

function cookieDomainMatchesHost(cookieDomain, host) {
  const normalizedCookieDomain = String(cookieDomain)
    .replace(/^\./, "")
    .toLowerCase();
  const normalizedHost = String(host).toLowerCase();
  return (
    normalizedHost === normalizedCookieDomain ||
    normalizedHost.endsWith(`.${normalizedCookieDomain}`)
  );
}

function collectRelatedDomains(cookies, fallbackHost) {
  const domains = new Set([fallbackHost]);
  for (const cookie of cookies) {
    if (typeof cookie?.domain === "string" && cookie.domain.trim()) {
      domains.add(cookie.domain.replace(/^\./, ""));
    }
  }
  return Array.from(domains);
}

function buildAutoProfileName(identity, baseUrl) {
  if (identity?.email) {
    return identity.email.trim();
  }
  if (identity?.name) {
    return identity.name.trim();
  }
  return `${baseUrl.hostname} - ${new Date().toLocaleString("vi-VN")}`;
}

async function getSavedApiUrl() {
  const stored = await chrome.storage.local.get(API_URL_KEY);
  const raw = (
    stored[API_URL_KEY] ||
    apiUrlInput?.value ||
    DEFAULT_API_URL
  ).trim();
  if (!raw) {
    return "";
  }
  return normalizeApiInput(raw) || "";
}

function normalizeRemoteProfiles(rawData) {
  let list = [];
  if (Array.isArray(rawData)) {
    list = rawData;
  } else if (rawData && Array.isArray(rawData.profiles)) {
    list = rawData.profiles;
  } else if (rawData && Array.isArray(rawData.data)) {
    list = rawData.data;
  }

  return list
    .map((item, index) => {
      if (item?.data?.url && Array.isArray(item?.data?.cookies)) {
        const stableId = item.id || buildStableProfileId(item, item.data);
        return {
          id: stableId,
          name: item.name || `Ho so ${index + 1}`,
          createdAt: item.createdAt || new Date().toISOString(),
          data: item.data,
          transactionDate: item.transactionDate || item.createdAt || "",
          accountNumber: item.accountNumber,
          status: item.status || "active",
          _sourceGatewayRaw:
            typeof item.gateway === "string"
              ? item.gateway
              : JSON.stringify(item.data),
          _sourceTransactionRaw: item.transactionDate || "",
          _sourceAccountRaw: item.accountNumber,
        };
      }

      if (item?.url && Array.isArray(item?.cookies)) {
        let hostName = "cloud";
        try {
          hostName = new URL(item.url).hostname;
        } catch (error) {
          hostName = "cloud";
        }
        return {
          id: buildStableProfileId(item, item),
          name: item.name || `${hostName} - cloud`,
          createdAt: new Date().toISOString(),
          data: item,
          transactionDate: item.transactionDate || item.createdAt || "",
          accountNumber: item.accountNumber,
          status: item.status || "active",
          _sourceGatewayRaw:
            typeof item.gateway === "string"
              ? item.gateway
              : JSON.stringify(item),
          _sourceTransactionRaw: item.transactionDate || "",
          _sourceAccountRaw: item.accountNumber,
        };
      }

      if (typeof item?.payload === "string") {
        try {
          const parsed = JSON.parse(item.payload);
          if (parsed?.url && Array.isArray(parsed?.cookies)) {
            let hostName = "cloud";
            try {
              hostName = new URL(parsed.url).hostname;
            } catch (innerError) {
              hostName = "cloud";
            }
            return {
              id: buildStableProfileId(item, parsed),
              name: item.name || `${hostName} - cloud`,
              createdAt: new Date().toISOString(),
              data: parsed,
              transactionDate: item.transactionDate || "",
              accountNumber: item.accountNumber,
              status: item.status || "active",
              _sourceGatewayRaw: item.payload,
              _sourceTransactionRaw: item.transactionDate || "",
              _sourceAccountRaw: item.accountNumber,
            };
          }
        } catch (error) {
          return null;
        }
      }

      if (typeof item?.gateway === "string") {
        try {
          const parsedGateway = JSON.parse(item.gateway);
          if (parsedGateway?.url && Array.isArray(parsedGateway?.cookies)) {
            let hostName = "cloud";
            try {
              hostName = new URL(parsedGateway.url).hostname;
            } catch (innerError) {
              hostName = "cloud";
            }
            return {
              id: buildStableProfileId(item, parsedGateway),
              name: item.name || `${hostName} - cloud`,
              createdAt: new Date().toISOString(),
              data: parsedGateway,
              transactionDate: item.transactionDate || "",
              accountNumber: item.accountNumber,
              status:
                item.status ||
                (item.accountNumber === true ? "active" : "inactive"),
              _sourceGatewayRaw: item.gateway,
              _sourceTransactionRaw: item.transactionDate || "",
              _sourceAccountRaw: item.accountNumber,
            };
          }
        } catch (error) {
          return null;
        }
      }

      // Ho tro format:
      // id = so thu tu, cookie = JSON cookie dang chuoi, date = ngay lay, status = boolean
      if (
        (typeof item?.id === "number" || typeof item?.id === "string") &&
        typeof item?.cookie === "string"
      ) {
        try {
          const parsedCookie = JSON.parse(item.cookie);
          if (parsedCookie?.url && Array.isArray(parsedCookie?.cookies)) {
            let hostName = "cloud";
            try {
              hostName = new URL(parsedCookie.url).hostname;
            } catch (innerError) {
              hostName = "cloud";
            }

            const normalizedDate =
              typeof item.date === "string"
                ? item.date
                : typeof item.status === "string"
                  ? item.status
                  : "";
            const normalizedStatus =
              typeof item.status === "boolean"
                ? item.status
                  ? "active"
                  : "inactive"
                : "active";

            return {
              id: String(item.id),
              name: item.name || `${hostName} - cloud`,
              createdAt: new Date().toISOString(),
              data: parsedCookie,
              transactionDate: normalizedDate,
              accountNumber: String(item.id),
              status: normalizedStatus,
              _sourceGatewayRaw: item.cookie,
              _sourceTransactionRaw: normalizedDate,
              _sourceAccountRaw: item.id,
            };
          }
        } catch (error) {
          return null;
        }
      }

      // Ho tro du lieu bi lech cot tu Database:
      // gateway = so thu tu, transactionDate = JSON cookie, accountNumber = ngay ISO
      if (
        (typeof item?.gateway === "number" ||
          typeof item?.gateway === "string") &&
        typeof item?.transactionDate === "string"
      ) {
        try {
          const parsedShifted = JSON.parse(item.transactionDate);
          if (parsedShifted?.url && Array.isArray(parsedShifted?.cookies)) {
            let hostName = "cloud";
            try {
              hostName = new URL(parsedShifted.url).hostname;
            } catch (innerError) {
              hostName = "cloud";
            }

            const normalizedDate =
              typeof item.accountNumber === "string" ? item.accountNumber : "";
            const normalizedAccount =
              item.gateway !== undefined && item.gateway !== null
                ? String(item.gateway)
                : true;
            const normalizedStatus =
              item.status ||
              (typeof item.subAccount === "boolean"
                ? item.subAccount
                  ? "active"
                  : "inactive"
                : "active");

            return {
              id: buildStableProfileId(item, parsedShifted),
              name: item.name || `${hostName} - cloud`,
              createdAt: new Date().toISOString(),
              data: parsedShifted,
              transactionDate: normalizedDate,
              accountNumber: normalizedAccount,
              status: normalizedStatus,
              _sourceGatewayRaw: String(item.gateway),
              _sourceTransactionRaw: item.transactionDate,
              _sourceAccountRaw: item.accountNumber,
            };
          }
        } catch (error) {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean);
}

function parseImportPayload(rawText) {
  const parsed = JSON.parse(rawText);
  const result = [];

  const pushProfile = (cookiePayload, meta = {}) => {
    const validated = validateCookiePayload(cookiePayload);
    let hostName = "profile";
    try {
      hostName = new URL(validated.url).hostname;
    } catch (error) {
      hostName = "profile";
    }
    result.push({
      id: meta?.id ? String(meta.id) : crypto.randomUUID(),
      name:
        meta.name || `${hostName} - nhap ${new Date().toLocaleString("vi-VN")}`,
      createdAt: meta.createdAt || new Date().toISOString(),
      data: validated,
      transactionDate: meta.transactionDate || new Date().toISOString(),
      accountNumber: meta.accountNumber ?? true,
      status: meta.status || "active",
    });
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item?.url && Array.isArray(item?.cookies)) {
        pushProfile(item, item);
        continue;
      }
      if (typeof item?.gateway === "string") {
        try {
          const gatewayPayload = JSON.parse(item.gateway);
          pushProfile(gatewayPayload, item);
        } catch (error) {
          continue;
        }
      }
    }
    return result;
  }

  if (parsed?.url && Array.isArray(parsed?.cookies)) {
    pushProfile(parsed, parsed);
    return result;
  }

  if (typeof parsed?.gateway === "string") {
    const gatewayPayload = JSON.parse(parsed.gateway);
    pushProfile(gatewayPayload, parsed);
    return result;
  }

  return result;
}

function formatTransactionDate(isoDate) {
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return String(isoDate);
    }
    return `lay: ${date.toLocaleString("vi-VN")}`;
  } catch (error) {
    return String(isoDate || "khong ro ngay");
  }
}

function normalizeApiInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) {
      return "";
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/api";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    }
    return raw;
  } catch (error) {
    return "";
  }
}

function buildStableProfileId(rawItem, cookieData) {
  const parts = [
    rawItem?.id || "",
    rawItem?.gateway || "",
    rawItem?.transactionDate || "",
    rawItem?.accountNumber || "",
    rawItem?.name || "",
    cookieData?.url || "",
    Array.isArray(cookieData?.cookies) ? cookieData.cookies.length : 0,
  ];
  return `p_${hashString(parts.join("|"))}`;
}

function hashString(value) {
  const text = String(value || "");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function generateCloudId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function shortenText(text) {
  const trimmed = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (trimmed.length <= 60) {
    return trimmed;
  }
  return `${trimmed.slice(0, 57)}...`;
}

async function extractAccountIdentityFromPage(tabId) {
  if (!tabId) {
    return null;
  }
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async () => {
        const sleep = (ms) =>
          new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

        const findAvatarTrigger = () => {
          const byUserAvatar = document.querySelector(
            'img[data-cy="user-avatar"]',
          );
          if (byUserAvatar) {
            return byUserAvatar.closest("button");
          }

          const byDialogButton = document.querySelector(
            'button[aria-haspopup="dialog"] img',
          );
          if (byDialogButton) {
            return byDialogButton.closest("button");
          }

          return null;
        };

        const readIdentity = () => {
          const emailCandidate = Array.from(
            document.querySelectorAll("p"),
          ).find((p) =>
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
              (p.textContent || "").trim(),
            ),
          );

          if (!emailCandidate) {
            return null;
          }

          const email = (emailCandidate.textContent || "").trim();
          const container =
            emailCandidate.closest("div") || emailCandidate.parentElement;
          let name = "";
          if (container) {
            const textNodes = Array.from(container.querySelectorAll("p"))
              .map((el) => (el.textContent || "").trim())
              .filter(Boolean);
            name =
              textNodes.find((item) => item !== email && !item.includes("@")) ||
              "";
          }
          return { email, name };
        };

        let identity = readIdentity();
        if (identity?.email) {
          return identity;
        }

        const trigger = findAvatarTrigger();
        if (trigger) {
          trigger.click();
          await sleep(550);
          identity = readIdentity();
          if (identity?.email) {
            return identity;
          }

          await sleep(700);
          identity = readIdentity();
          if (identity?.email) {
            return identity;
          }
        }

        return null;
      },
    });

    return injected?.[0]?.result || null;
  } catch (error) {
    return null;
  }
}
