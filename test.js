
  let isRunning = false;
  let lanUrl = '';
  let localUrl = '';
  let currentPort = 3000;
  let isFirstRun = false;
  let qrLoaded = false;

  // Store the real version so the badge can restore it after "Checking…"
  // The outer template literal interpolates app.getVersion() at window-creation time.
  window._appVersion = '${app.getVersion()}' || document.getElementById('version-badge')?.textContent?.replace(/^v/, '') || '';

  function openBrowser()  { window.electronAPI?.openBrowser(); }
  function openSetup()    { window.electronAPI?.openBrowserPage('/setup'); }
  function openLan()      { if (lanUrl) window.electronAPI?.openBrowserLan(lanUrl); }

  function toggleServer() {
    if (isRunning) window.electronAPI?.stopServer();
    else           window.electronAPI?.startServer();
  }

  function copyUrl(which) {
    const url = which === 'lan' ? lanUrl : localUrl;
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    const btn = document.querySelector('.copy-btn[onclick="copyUrl(\\''+which+'\\')"]');
    if (btn) {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    }
  }

  function clearLog() {
    const box = document.getElementById('log-box');
    box.innerHTML = '<div class="empty-log">Log cleared</div>';
  }

  function appendLog(entry) {
    const box = document.getElementById('log-box');
    const empty = box.querySelector('.empty-log');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML =
      '<span class="log-time">' + entry.time + '</span>' +
      '<span class="log-line ' + entry.level + '">' + escHtml(entry.line) + '</span>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    // Detect first run from log message
    if (entry.line && entry.line.includes('First run detected')) {
      isFirstRun = true;
      document.getElementById('first-run-banner').classList.add('visible');
    }
    // Auto-open crash log panel when a crash loop is detected
    if (entry.level === 'error' && entry.line && (entry.line.includes('fast crash') || entry.line.includes('crash loop') || entry.line.includes('Watchdog'))) {
      if (!crashPanelOpen) toggleCrashLog();
    }
  }

  function loadQrCode(networkUrl) {
    if (qrLoaded || !networkUrl) return;
    qrLoaded = true;
    const wrap = document.getElementById('qr-wrap');
    // Fetch QR JSON from the server — format=png returns a base64 data URL
    fetch(networkUrl + '/api/remote/qr?format=png')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (!data.qr) throw new Error('no qr');
        const img = document.createElement('img');
        img.src = data.qr; // base64 data URL
        img.alt = 'QR code';
        img.style.width = '68px';
        img.style.height = '68px';
        img.style.display = 'block';
        wrap.innerHTML = '';
        wrap.appendChild(img);
      })
      .catch(() => {
        wrap.innerHTML = '<div class="qr-placeholder">Open network URL on phone</div>';
      });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateStatus(status) {
    isRunning = status.running;
    lanUrl = status.lanUrl || '';
    localUrl = status.localUrl || '';
    currentPort = status.port || 3000;

    const dot        = document.getElementById('dot');
    const text       = document.getElementById('status-text');
    const localChip  = document.getElementById('local-url');
    const accessPanel = document.getElementById('access-panel');
    const localLink  = document.getElementById('local-link');
    const lanLink    = document.getElementById('lan-link');
    const btnOpen    = document.getElementById('btn-open');
    const btnSetup   = document.getElementById('btn-setup');
    const btnStop    = document.getElementById('btn-stop');

    dot.className = 'status-dot' + (isRunning ? ' running' : '');
    text.innerHTML = isRunning
      ? '<strong>Running</strong> — ready to stream'
      : '<strong>Stopped</strong>';

    if (isRunning) {
      localChip.style.display = 'block';
      localChip.textContent = \`localhost:\${currentPort}\`;
      accessPanel.classList.add('visible');
      localLink.textContent = localUrl;
      if (lanUrl) {
        lanLink.textContent = lanUrl;
        loadQrCode(lanUrl);
      } else {
        lanLink.textContent = 'Not connected to a network';
      }
    } else {
      localChip.style.display = 'none';
      accessPanel.classList.remove('visible');
    }

    btnOpen.disabled  = !isRunning;
    btnSetup.disabled = !isRunning;
    btnStop.disabled  = false;
    btnStop.textContent = isRunning ? 'Stop Server' : 'Start Server';
    btnStop.className   = isRunning ? 'btn-danger' : 'btn-secondary';
  }

  window.electronAPI?.onStatus(updateStatus);
  window.electronAPI?.onLog(appendLog);
  window.electronAPI?.requestStatus();

  // ── Auto-updater UI ────────────────────────────────────────────────────────

  let updateState = 'idle';

  function checkForUpdate() {
    window.electronAPI?.checkForUpdate();
    // Briefly disable the button and show feedback
    const btn = document.getElementById('btn-check-update');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Check for Updates'; }, 6_000);
    }
    // Show a brief "checking" indicator on the version badge, then restore.
    // Capture the current text BEFORE overwriting so we always restore correctly
    // even if window._appVersion is somehow empty.
    const badge = document.getElementById('version-badge');
    if (badge) {
      const prev = badge.textContent || ('v' + (window._appVersion || ''));
      badge.textContent = 'Checking…';
      setTimeout(() => { badge.textContent = prev || ('v' + window._appVersion) || 'v?'; }, 4000);
    }
  }

  function handleUpdateStatus(data) {
    updateState = data.state;
    const panel    = document.getElementById('update-panel');
    const title    = document.getElementById('update-title');
    const sub      = document.getElementById('update-sub');
    const icon     = document.getElementById('update-icon');
    const progress = document.getElementById('update-progress');
    const bar      = document.getElementById('update-progress-bar');
    const actions  = document.getElementById('update-actions');

    // Reset panel classes
    panel.className = 'update-panel';
    progress.style.display = 'none';
    actions.innerHTML = '';

    switch (data.state) {
      case 'checking':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '🔄';
        title.textContent = 'Checking for updates…';
        sub.textContent = '';
        break;

      case 'available':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '⬆️';
        title.textContent = \`Update available — v\${data.version}\`;
        sub.textContent = 'A delta update is ready. Download is small — no reinstall needed.';
        actions.innerHTML =
          '<button class="btn-update btn-update-primary" onclick="window.electronAPI?.downloadUpdate()">Download Update</button>' +
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Later</button>';
        break;

      case 'downloading': {
        panel.classList.add('visible', 'state-downloading');
        icon.textContent = '⬇️';
        const pct = data.percent ?? 0;
        title.textContent = \`Downloading update — \${pct}%\`;
        const mbps = data.bytesPerSecond ? (data.bytesPerSecond / 1_048_576).toFixed(1) + ' MB/s' : '';
        sub.textContent = mbps ? \`Downloading at \${mbps}\` : 'Downloading…';
        progress.style.display = 'block';
        bar.style.width = pct + '%';
        break;
      }

      case 'ready':
        panel.classList.add('visible', 'state-ready');
        icon.textContent = '✅';
        title.textContent = \`v\${data.version} ready to install\`;
        sub.textContent = 'HomeStream will restart and apply the update automatically. No reinstall needed.';
        actions.innerHTML =
          '<button class="btn-update btn-update-success" onclick="window.electronAPI?.installUpdate()">Restart & Update</button>' +
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Later</button>';
        break;

      case 'not-available':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '✓';
        title.textContent = 'HomeStream is up to date';
        sub.textContent = '';
        // Auto-dismiss after 4 seconds
        setTimeout(dismissUpdate, 4_000);
        break;

      case 'error':
        panel.classList.add('visible', 'state-error');
        icon.textContent = '⚠️';
        title.textContent = 'Update check failed';
        sub.textContent = data.error ?? 'Could not reach update server.';
        actions.innerHTML =
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Dismiss</button>';
        break;

      case 'idle':
      default:
        // Hide panel
        break;
    }
  }

  function dismissUpdate() {
    const panel = document.getElementById('update-panel');
    panel.className = 'update-panel'; // remove 'visible'
    updateState = 'idle';
  }

  window.electronAPI?.onUpdateStatus(handleUpdateStatus);

  // ── Beta channel toggle ────────────────────────────────────────────────────
  let betaEnabled = false;

  async function initBetaToggle() {
    try {
      betaEnabled = await window.electronAPI?.getBetaChannel?.() ?? false;
      updateBetaBtn();
    } catch { /* ignore */ }
  }

  function updateBetaBtn() {
    const btn = document.getElementById('btn-beta-toggle');
    if (!btn) return;
    btn.textContent = betaEnabled ? 'Beta Channel: ON' : 'Beta Channel: OFF';
    btn.style.borderColor = betaEnabled ? '#f59e0b' : '';
    btn.style.color       = betaEnabled ? '#f59e0b' : '';
  }

  function toggleBetaChannel() {
    betaEnabled = !betaEnabled;
    window.electronAPI?.setBetaChannel?.(betaEnabled);
    updateBetaBtn();
  }

  initBetaToggle();

  // ── Crash log panel ────────────────────────────────────────────────────────
  let crashPanelOpen = false;

  function toggleCrashLog() {
    crashPanelOpen = !crashPanelOpen;
    const panel = document.getElementById('crash-panel');
    panel.style.display = crashPanelOpen ? 'flex' : 'none';
    if (crashPanelOpen) refreshCrashLog();
  }

  function openCrashFolder() {
    window.electronAPI?.openCrashLogFolder();
  }

  async function refreshCrashLog() {
    const box = document.getElementById('crash-box');
    box.innerHTML = '<div style="color:#555;font-style:italic;">Loading…</div>';
    try {
      const result = await window.electronAPI?.readCrashLog();
      const pathEl = document.getElementById('crash-path');
      if (pathEl && result?.path) pathEl.textContent = result.path;

      if (!result || result.entries.length === 0) {
        box.innerHTML = '<div style="color:#22c55e;font-style:italic;">No crashes recorded — server is healthy.</div>';
        return;
      }
      box.innerHTML = '';
      result.entries.forEach(e => {
        const div = document.createElement('div');
        div.style.cssText = 'margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #1a0a0a;';
        const ts = new Date(e.timestamp).toLocaleString();
        const typeColor = e.type === 'uncaughtException' ? '#ef4444' : e.type === 'startup' ? '#f59e0b' : '#f87171';
        div.innerHTML =
          '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px;">' +
            '<span style="color:' + typeColor + ';font-weight:700;font-size:0.65rem;text-transform:uppercase;">' + escHtml(e.type) + '</span>' +
            '<span style="color:#444;font-size:0.62rem;">' + escHtml(ts) + '</span>' +
            '<span style="color:#333;font-size:0.6rem;">uptime:' + e.uptime + 's</span>' +
          '</div>' +
          '<div style="color:#ef4444;margin-bottom:3px;">' + escHtml(e.message) + '</div>' +
          (e.stack ? '<div style="color:#555;font-size:0.62rem;white-space:pre-wrap;word-break:break-all;">' + escHtml(e.stack.split('\\n').slice(0,4).join('\\n')) + '</div>' : '') +
          (e.context ? '<div style="color:#444;font-size:0.6rem;margin-top:2px;">context: ' + escHtml(e.context) + '</div>' : '');
        box.appendChild(div);
      });
    } catch(err) {
      box.innerHTML = '<div style="color:#ef4444;">Failed to read crash log: ' + escHtml(String(err)) + '</div>';
    }
  }

