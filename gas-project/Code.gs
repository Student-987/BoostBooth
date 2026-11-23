/**
 * BoostBooth — 2-File Google Apps Script Edition (Code.gs + Index.html)
 *
 * Includes:
 * - Auto-creating Google Sheets (SETTINGS, FRAMES, SESSIONS, MEDIA, LOGS)
 * - Auto-creating Google Drive folders (PHOTO_BOOTH/FRAMES, SESSIONS/YYYY/MM, TEMP, LOGS)
 * - Canva Transparent PNG Frame Manager & Percentage Layout Storage
 * - Photo + 3s Countdown GIF Session & Cryptographic Token QR Download (?page=download&token=...)
 * - JSON API (doPost / doGet?action=...) for BoostBooth Web App sync + Standalone HTML Web App
 */

var BOOTH_CONFIG = {
  ROOT_FOLDER_NAME: 'PHOTO_BOOTH',
  SUBFOLDERS: { FRAMES: 'FRAMES', SESSIONS: 'SESSIONS', TEMP: 'TEMP', LOGS: 'LOGS' },
  SHEETS: { SETTINGS: 'SETTINGS', FRAMES: 'FRAMES', SESSIONS: 'SESSIONS', MEDIA: 'MEDIA', LOGS: 'LOGS' },
  HEADERS: {
    SETTINGS: ['key', 'value', 'updated_at'],
    FRAMES: ['frame_id', 'frame_name', 'category', 'description', 'drive_file_id', 'preview_url', 'width', 'height', 'frame_layout', 'is_active', 'created_at'],
    SESSIONS: ['session_id', 'created_at', 'selected_frame_id', 'shooting_mode', 'session_status', 'drive_folder_id', 'download_token', 'qr_url', 'expires_at'],
    MEDIA: ['media_id', 'session_id', 'media_type', 'original_file_id', 'processed_file_id', 'file_name', 'file_size', 'mime_type', 'created_at', 'upload_status'],
    LOGS: ['log_id', 'timestamp', 'session_id', 'action', 'status', 'message'],
  },
  DEFAULT_SETTINGS: {
    booth_name: 'BoostBooth Studio',
    event_name: 'Signature Event 2026',
    logo_url: '',
    welcome_headline: 'Step in, strike a pose, and take the moment home.',
    welcome_subtitle: '',
    welcome_cta_label: 'START',
    welcome_bg_url: '',
    welcome_hero_0: '',
    welcome_hero_1: '',
    welcome_hero_2: '',
    drive_folder_id: '1803j-lPX2WNhkXJaPRbU5JUhRK8z74cj',
    retention_days: '7',
    default_countdown_sec: '10',
    gif_burst_seconds: '3',
    system_status: 'active',
    privacy_mode: 'anyone_with_link',
  },
};

function extractDriveFolderId(raw) {
  var val = String(raw || '').trim();
  if (!val) return '';
  var m = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  var idM = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idM && idM[1]) return idM[1];
  return val.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getScriptProp(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback || '';
}

function setScriptProp(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value || ''));
}

function verifyApiSecret(providedSecret) {
  var configured = getScriptProp('GAS_API_SECRET', '');
  if (!configured) return true;
  return String(providedSecret || '') === configured;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// --- Web App Entry Points ---
function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.action) {
    try {
      if (!verifyApiSecret(params.secret)) return jsonResponse({ ok: false, error: 'Unauthorized GAS secret' });
      if (params.action === 'ping') return jsonResponse({ ok: true, service: 'BoostBooth 2-File GAS', time: new Date().toISOString() });
      if (params.action === 'getConfig') return jsonResponse({ ok: true, settings: getSettingsMap(), frames: getAllFrames(true) });
      if (params.action === 'getDownload' && params.token) {
        var session = getSessionByToken(params.token);
        if (!session) return jsonResponse({ ok: false, error: 'Session not found' });
        return jsonResponse({ ok: true, session: session, media: getMediaForSession(session.session_id) });
      }
      if (params.action === 'getDashboard') return jsonResponse({ ok: true, data: getAdminDashboardPayload() });
      return jsonResponse({ ok: false, error: 'Unknown action: ' + params.action });
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err) });
    }
  }

  var tpl = HtmlService.createTemplateFromFile('Index');
  tpl.initialPage = params.page || 'kiosk';
  tpl.initialToken = params.token || '';
  tpl.webAppUrl = ScriptApp.getService().getUrl() || '';
  return tpl
    .evaluate()
    .setTitle('BoostBooth — Digital Studio Photo Booth')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!verifyApiSecret(body.secret)) return jsonResponse({ ok: false, error: 'Unauthorized GAS API secret' });

    var action = body.action;
    var payload = body.payload || {};

    switch (action) {
      case 'init': return jsonResponse({ ok: true, result: initializeDatabase(payload) });
      case 'getDashboard': return jsonResponse({ ok: true, result: getAdminDashboardPayload() });
      case 'updateSettings': return jsonResponse({ ok: true, result: updateSettingsBatch(payload) });
      case 'saveFrame': return jsonResponse({ ok: true, result: saveFrameRecord(payload) });
      case 'toggleFrame': return jsonResponse({ ok: true, result: toggleFrameActive(payload.frame_id, payload.is_active) });
      case 'deleteFrame': return jsonResponse({ ok: true, result: deleteFrameRecord(payload.frame_id) });
      case 'createSession': return jsonResponse({ ok: true, result: createBoothSession(payload) });
      case 'updateSessionStatus': return jsonResponse({ ok: true, result: updateSessionStatus(payload.session_id, payload.session_status) });
      case 'uploadMedia': return jsonResponse({ ok: true, result: saveMediaUpload(payload) });
      case 'deleteMedia': return jsonResponse({ ok: true, result: deleteMediaRecordAndDriveFile(payload.media_id) });
      case 'purgeExpired': return jsonResponse({ ok: true, result: purgeExpiredSessionsAndMedia() });
      default: return jsonResponse({ ok: false, error: 'Unsupported action: ' + action });
    }
  } catch (err) {
    writeLog('SYSTEM', 'DOPOST_ERROR', 'error', String(err));
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// --- Client-Callable Helpers for Standalone Index.html ---
function getStandaloneBootstrap(token) {
  initializeIfNeeded();
  var settings = getSettingsMap();
  var frames = getAllFrames(true);
  var downloadData = null;
  if (token) {
    var session = getSessionByToken(token);
    if (session) {
      downloadData = {
        session: session,
        media: getMediaForSession(session.session_id),
        booth_name: settings.booth_name,
        event_name: settings.event_name,
      };
    }
  }
  return {
    settings: settings,
    frames: frames,
    webAppUrl: ScriptApp.getService().getUrl() || '',
    downloadData: downloadData,
  };
}

function uploadWelcomeAsset(payload) {
  var folders = ensureFolderStructure();
  var fileName = payload.fileName || ('welcome_' + Utilities.getUuid().slice(0, 6) + '.png');
  var mimeType = payload.mimeType || 'image/png';
  var up = uploadBase64ToDrive(folders.framesId, fileName, mimeType, payload.base64Data, true);
  if (payload.settingKey) {
    updateSettingValue(payload.settingKey, up.viewUrl);
  }
  return { url: up.viewUrl, fileId: up.fileId };
}

function getStationFeedPayload() {
  var settings = getSettingsMap();
  var sessions = readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS).reverse().slice(0, 40);
  var allMedia = readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA);
  var framesById = {};
  getAllFrames(false).forEach(function (f) { framesById[f.frame_id] = f.frame_name; });

  var enriched = sessions.map(function (s) {
    var items = allMedia
      .filter(function (m) { return String(m.session_id) === String(s.session_id); })
      .map(function (m) {
        var fid = m.processed_file_id || m.original_file_id;
        m.drive_download_url = fid ? 'https://drive.google.com/uc?export=download&id=' + fid : '';
        m.drive_view_url = fid ? 'https://lh3.googleusercontent.com/d/' + fid + '=s1600' : '';
        return m;
      });
    s.selected_frame_name = framesById[s.selected_frame_id] || s.selected_frame_id;
    s.media = items;
    return s;
  });

  return {
    booth_name: settings.booth_name || 'BoostBooth Studio',
    event_name: settings.event_name || '',
    sessions: enriched,
  };
}

function getSessionMediaDataUrls(sessionId) {
  var items = getMediaForSession(sessionId);
  return items.map(function (m) {
    var fid = m.processed_file_id || m.original_file_id;
    var base64 = '';
    var mimeType = m.mime_type || 'image/jpeg';
    if (fid) {
      try {
        var blob = DriveApp.getFileById(fid).getBlob();
        mimeType = blob.getContentType() || mimeType;
        base64 = Utilities.base64Encode(blob.getBytes());
      } catch (e) {}
    }
    return {
      file_name: m.file_name,
      mime_type: mimeType,
      base64: base64,
    };
  }).filter(function (x) { return Boolean(x.base64); });
}

function initializeIfNeeded() {
  if (!getScriptProp('SPREADSHEET_ID', '')) {
    initializeDatabase();
  }
}

// --- Google Sheets Database Layer ---
function getOrCreateSpreadsheet() {
  var ssId = getScriptProp('SPREADSHEET_ID', '');
  var ss = null;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('BoostBooth_Database');
    setScriptProp('SPREADSHEET_ID', ss.getId());
    try {
      DriveApp.getFileById(ss.getId()).moveTo(ensureRootBoothFolder());
    } catch (err) {}
  } else {
    setScriptProp('SPREADSHEET_ID', ss.getId());
  }
  return ss;
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function initializeDatabase(payload) {
  var overrideFolderId = payload && payload.drive_folder_id ? extractDriveFolderId(payload.drive_folder_id) : '';
  if (overrideFolderId) {
    setScriptProp('DRIVE_FOLDER_ID', overrideFolderId);
  }

  var ss = getOrCreateSpreadsheet();
  Object.keys(BOOTH_CONFIG.SHEETS).forEach(function (k) {
    var name = BOOTH_CONFIG.SHEETS[k];
    ensureSheetWithHeaders(ss, name, BOOTH_CONFIG.HEADERS[name]);
  });

  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  var settingsSheet = ss.getSheetByName(BOOTH_CONFIG.SHEETS.SETTINGS);
  if (settingsSheet.getLastRow() <= 1) {
    var now = new Date().toISOString();
    var rows = Object.keys(BOOTH_CONFIG.DEFAULT_SETTINGS).map(function (k) {
      return [k, BOOTH_CONFIG.DEFAULT_SETTINGS[k], now];
    });
    if (rows.length) settingsSheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }

  var folders = ensureFolderStructure(overrideFolderId);
  updateSettingValue('drive_folder_id', folders.rootId);
  writeLog('SYSTEM', 'INIT_DATABASE', 'success', 'Initialized Sheets & Drive folder: ' + folders.rootId);
  return { spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), driveFolderId: folders.rootId };
}

function readSheetRecords(sheetName) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[String(headers[j])] = data[i][j];
    rows.push(obj);
  }
  return rows;
}

function appendSheetRecord(sheetName, recordObj) {
  var ss = getOrCreateSpreadsheet();
  var headers = BOOTH_CONFIG.HEADERS[sheetName];
  var sheet = ensureSheetWithHeaders(ss, sheetName, headers);
  sheet.appendRow(headers.map(function (h) {
    var val = recordObj[h];
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val !== undefined && val !== null ? val : '';
  }));
  return recordObj;
}

function updateSheetRowById(sheetName, idColumn, idValue, updates) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return false;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idColIdx = headers.indexOf(idColumn);
  if (idColIdx === -1) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idColIdx]) === String(idValue)) {
      Object.keys(updates).forEach(function (key) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) {
          var val = updates[key];
          if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
          sheet.getRange(i + 1, colIdx + 1).setValue(val);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteSheetRowById(sheetName, idColumn, idValue) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return false;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idColIdx = headers.indexOf(idColumn);
  if (idColIdx === -1) return false;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idColIdx]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// --- Google Drive Folder & File Layer ---
function getOrCreateSubfolder(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
}

function ensureRootBoothFolder(overrideFolderId) {
  var candidateId = extractDriveFolderId(overrideFolderId)
    || extractDriveFolderId(getScriptProp('DRIVE_FOLDER_ID', ''))
    || extractDriveFolderId(BOOTH_CONFIG.DEFAULT_SETTINGS.drive_folder_id);
  if (candidateId) {
    try {
      var targetFolder = DriveApp.getFolderById(candidateId);
      setScriptProp('DRIVE_FOLDER_ID', targetFolder.getId());
      return targetFolder;
    } catch (e) {
      writeLog('SYSTEM', 'DRIVE_FOLDER_WARN', 'warning', 'Cannot access folder ' + candidateId + ': ' + String(e));
    }
  }
  var existing = DriveApp.getFoldersByName(BOOTH_CONFIG.ROOT_FOLDER_NAME);
  var root = existing.hasNext() ? existing.next() : DriveApp.createFolder(BOOTH_CONFIG.ROOT_FOLDER_NAME);
  setScriptProp('DRIVE_FOLDER_ID', root.getId());
  return root;
}

function ensureFolderStructure(overrideFolderId) {
  var root = ensureRootBoothFolder(overrideFolderId);
  return {
    rootId: root.getId(),
    framesId: getOrCreateSubfolder(root, 'FRAMES').getId(),
    sessionsId: getOrCreateSubfolder(root, 'SESSIONS').getId(),
    tempId: getOrCreateSubfolder(root, 'TEMP').getId(),
    logsId: getOrCreateSubfolder(root, 'LOGS').getId(),
  };
}

function createSessionFolder(sessionId, overrideFolderId) {
  var folders = ensureFolderStructure(overrideFolderId);
  var sessionsRoot = DriveApp.getFolderById(folders.sessionsId);
  var now = new Date();
  var yearFolder = getOrCreateSubfolder(sessionsRoot, String(now.getFullYear()));
  var monthFolder = getOrCreateSubfolder(yearFolder, ('0' + (now.getMonth() + 1)).slice(-2));
  return getOrCreateSubfolder(monthFolder, sessionId);
}

function uploadBase64ToDrive(folderId, fileName, mimeType, base64Data, makePublic) {
  var cleanBase64 = String(base64Data || '').replace(/^data:[^;]+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), mimeType, fileName);
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  if (makePublic) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: file.getId(),
    fileName: file.getName(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    viewUrl: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=s1600',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
  };
}

function deleteDriveFileById(fileId) {
  if (!fileId) return false;
  try { DriveApp.getFileById(fileId).setTrashed(true); return true; } catch (e) { return false; }
}

// --- Frame, Session, Media & QR Services ---
function getAllFrames(activeOnly) {
  var frames = readSheetRecords(BOOTH_CONFIG.SHEETS.FRAMES).map(function (r) {
    var layout = [];
    try { layout = typeof r.frame_layout === 'string' && r.frame_layout ? JSON.parse(r.frame_layout) : []; } catch (e) {}
    return {
      frame_id: String(r.frame_id),
      frame_name: String(r.frame_name),
      category: String(r.category || 'General'),
      description: String(r.description || ''),
      drive_file_id: String(r.drive_file_id || ''),
      preview_url: String(r.preview_url || ''),
      width: Number(r.width) || 1200,
      height: Number(r.height) || 1800,
      frame_layout: layout,
      is_active: r.is_active === true || String(r.is_active).toLowerCase() === 'true',
      created_at: String(r.created_at || ''),
    };
  });
  return activeOnly ? frames.filter(function (f) { return f.is_active; }) : frames;
}

function saveFrameRecord(payload) {
  var folders = ensureFolderStructure(payload && payload.drive_folder_id);
  var frameId = payload.frame_id || 'FRM_' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var driveFileId = payload.drive_file_id || '';
  var previewUrl = payload.preview_url || '';

  if (payload.pngBase64) {
    var up = uploadBase64ToDrive(folders.framesId, frameId + '.png', 'image/png', payload.pngBase64, true);
    driveFileId = up.fileId;
    previewUrl = up.viewUrl;
  }

  var record = {
    frame_id: frameId,
    frame_name: payload.frame_name || 'Untitled Frame',
    category: payload.category || 'Event',
    description: payload.description || '',
    drive_file_id: driveFileId,
    preview_url: previewUrl,
    width: Number(payload.width) || 1200,
    height: Number(payload.height) || 1800,
    frame_layout: JSON.stringify(payload.frame_layout || []),
    is_active: payload.is_active !== false,
    created_at: payload.created_at || new Date().toISOString(),
  };

  var exists = getAllFrames(false).some(function (f) { return f.frame_id === frameId; });
  if (exists) updateSheetRowById(BOOTH_CONFIG.SHEETS.FRAMES, 'frame_id', frameId, record);
  else appendSheetRecord(BOOTH_CONFIG.SHEETS.FRAMES, record);

  writeLog('ADMIN', exists ? 'UPDATE_FRAME' : 'CREATE_FRAME', 'success', 'Saved frame ' + frameId);
  record.frame_layout = payload.frame_layout || [];
  return record;
}

function toggleFrameActive(frameId, isActive) {
  return updateSheetRowById(BOOTH_CONFIG.SHEETS.FRAMES, 'frame_id', frameId, { is_active: Boolean(isActive) });
}

function deleteFrameRecord(frameId) {
  var matches = getAllFrames(false).filter(function (f) { return f.frame_id === frameId; });
  if (matches.length && matches[0].drive_file_id) deleteDriveFileById(matches[0].drive_file_id);
  return deleteSheetRowById(BOOTH_CONFIG.SHEETS.FRAMES, 'frame_id', frameId);
}

function generateSecureDownloadToken() {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now());
  return digest.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function createBoothSession(payload) {
  var settings = getSettingsMap();
  var retentionDays = Number(settings.retention_days) || 7;
  var now = new Date();
  var expires = new Date(now.getTime() + retentionDays * 86400000);
  var existing = readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS);
  var sessionId = payload.session_id || 'SESSION_' + ('000' + (existing.length + 1)).slice(-3) + '_' + Utilities.getUuid().slice(0, 4).toUpperCase();
  var token = payload.download_token || generateSecureDownloadToken();
  var gasUrl = ScriptApp.getService().getUrl() || '';
  var qrUrl = gasUrl ? gasUrl + '?page=download&token=' + encodeURIComponent(token) : (payload.qr_url || '');
  var targetRootId = extractDriveFolderId(payload.drive_folder_id || settings.drive_folder_id);
  var folder = createSessionFolder(sessionId, targetRootId);

  var record = {
    session_id: sessionId,
    created_at: now.toISOString(),
    selected_frame_id: payload.selected_frame_id || '',
    shooting_mode: 'photo+gif',
    session_status: 'started',
    drive_folder_id: folder.getId(),
    download_token: token,
    qr_url: qrUrl,
    expires_at: expires.toISOString(),
  };
  appendSheetRecord(BOOTH_CONFIG.SHEETS.SESSIONS, record);
  writeLog(sessionId, 'CREATE_SESSION', 'success', 'Created session and public QR download URL');
  return record;
}

function updateSessionStatus(sessionId, status) {
  return updateSheetRowById(BOOTH_CONFIG.SHEETS.SESSIONS, 'session_id', sessionId, { session_status: status });
}

function getSessionByToken(token) {
  var sessions = readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS);
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].download_token) === String(token)) return sessions[i];
  }
  return null;
}

function saveMediaUpload(payload) {
  var settings = getSettingsMap();
  var makePublic = String(settings.privacy_mode || 'anyone_with_link') === 'anyone_with_link';
  var sessions = readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS).filter(function (s) {
    return String(s.session_id) === String(payload.session_id);
  });
  var targetRootId = extractDriveFolderId(payload.drive_folder_id || settings.drive_folder_id);
  var folderId = sessions.length && sessions[0].drive_folder_id
    ? sessions[0].drive_folder_id
    : createSessionFolder(payload.session_id || 'TEST_SESSION', targetRootId).getId();

  var dupes = readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA).filter(function (m) {
    return String(m.session_id) === String(payload.session_id) && String(m.file_name) === String(payload.file_name);
  });
  if (dupes.length) return dupes[0];

  var up = uploadBase64ToDrive(folderId, payload.file_name, payload.mime_type || 'image/jpeg', payload.base64Data, makePublic);
  var record = {
    media_id: payload.media_id || 'MED_' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    session_id: payload.session_id,
    media_type: payload.media_type || 'framed',
    original_file_id: payload.media_type === 'original' ? up.fileId : '',
    processed_file_id: payload.media_type !== 'original' ? up.fileId : '',
    file_name: up.fileName,
    file_size: up.size,
    mime_type: up.mimeType,
    created_at: new Date().toISOString(),
    upload_status: 'synced_drive',
  };
  appendSheetRecord(BOOTH_CONFIG.SHEETS.MEDIA, record);
  writeLog(payload.session_id, 'UPLOAD_MEDIA', 'success', 'Uploaded ' + up.fileName);
  record.drive_download_url = up.downloadUrl;
  record.drive_view_url = up.viewUrl;
  return record;
}

function getMediaForSession(sessionId) {
  return readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA)
    .filter(function (m) { return String(m.session_id) === String(sessionId); })
    .map(function (m) {
      var fid = m.processed_file_id || m.original_file_id;
      m.drive_download_url = fid ? 'https://drive.google.com/uc?export=download&id=' + fid : '';
      m.drive_view_url = fid ? 'https://lh3.googleusercontent.com/d/' + fid + '=s1600' : '';
      return m;
    });
}

function deleteMediaRecordAndDriveFile(mediaId) {
  var rows = readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA).filter(function (m) { return String(m.media_id) === String(mediaId); });
  if (rows.length) {
    var fid = rows[0].processed_file_id || rows[0].original_file_id;
    if (fid) deleteDriveFileById(fid);
  }
  return deleteSheetRowById(BOOTH_CONFIG.SHEETS.MEDIA, 'media_id', mediaId);
}

function purgeExpiredSessionsAndMedia() {
  var now = Date.now();
  var expiredIds = {};
  readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS).forEach(function (s) {
    if (s.expires_at && new Date(s.expires_at).getTime() < now && s.session_status !== 'expired') {
      expiredIds[s.session_id] = true;
      updateSessionStatus(s.session_id, 'expired');
    }
  });
  var deletedCount = 0;
  readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA).forEach(function (m) {
    if (expiredIds[m.session_id]) {
      var fid = m.processed_file_id || m.original_file_id;
      if (fid && deleteDriveFileById(fid)) deletedCount++;
      deleteSheetRowById(BOOTH_CONFIG.SHEETS.MEDIA, 'media_id', m.media_id);
    }
  });
  writeLog('SYSTEM', 'PURGE_EXPIRED', 'success', 'Purged ' + deletedCount + ' expired Drive files');
  return { deletedCount: deletedCount };
}

// --- Settings, Logs & Dashboard ---
function getSettingsMap() {
  var map = {};
  Object.keys(BOOTH_CONFIG.DEFAULT_SETTINGS).forEach(function (k) { map[k] = BOOTH_CONFIG.DEFAULT_SETTINGS[k]; });
  readSheetRecords(BOOTH_CONFIG.SHEETS.SETTINGS).forEach(function (r) { if (r.key) map[String(r.key)] = String(r.value); });
  return map;
}

function updateSettingValue(key, value) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ensureSheetWithHeaders(ss, BOOTH_CONFIG.SHEETS.SETTINGS, BOOTH_CONFIG.HEADERS.SETTINGS);
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(String(value));
      sheet.getRange(i + 1, 3).setValue(now);
      return;
    }
  }
  sheet.appendRow([String(key), String(value), now]);
}

function updateSettingsBatch(updates) {
  Object.keys(updates).forEach(function (k) {
    if (k === 'drive_folder_id') {
      var cleanId = extractDriveFolderId(updates[k]);
      if (cleanId) setScriptProp('DRIVE_FOLDER_ID', cleanId);
      updateSettingValue(k, cleanId);
    } else {
      updateSettingValue(k, updates[k]);
    }
  });
  return getSettingsMap();
}

function writeLog(sessionId, action, status, message) {
  try {
    appendSheetRecord(BOOTH_CONFIG.SHEETS.LOGS, {
      log_id: 'LOG_' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      timestamp: new Date().toISOString(),
      session_id: sessionId || 'SYSTEM',
      action: action || 'INFO',
      status: status || 'info',
      message: String(message || '').slice(0, 500),
    });
  } catch (e) {}
}

function getAdminDashboardPayload() {
  var sessions = readSheetRecords(BOOTH_CONFIG.SHEETS.SESSIONS).reverse();
  var media = readSheetRecords(BOOTH_CONFIG.SHEETS.MEDIA).reverse();
  var frames = getAllFrames(false);
  var logs = readSheetRecords(BOOTH_CONFIG.SHEETS.LOGS).reverse().slice(0, 120);
  var settings = getSettingsMap();
  var bytes = 0;
  var photos = 0;
  var gifs = 0;
  media.forEach(function (m) {
    bytes += Number(m.file_size) || 0;
    if (m.media_type === 'gif') gifs++;
    else photos++;
  });
  return {
    stats: {
      total_sessions: sessions.length,
      total_photos: photos,
      total_gifs: gifs,
      storage_used_bytes: bytes,
      active_frames: frames.filter(function (f) { return f.is_active; }).length,
    },
    settings: settings,
    frames: frames,
    sessions: sessions,
    media: media,
    logs: logs,
  };
}
