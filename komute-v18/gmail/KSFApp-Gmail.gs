/**
 * KSFApp (Gmail) - links your Gmail to Komute. Free. Runs inside your own Google account.
 *
 * What it does, every minute:
 *   1. Reads GCash "you received money" emails in YOUR Gmail and tells Komute (amount + reference number).
 *   2. Sends the 6-digit unlock codes from YOUR Gmail to the people who paid.
 *
 * Setup: see README.md, "Gmail verification code". Change only the two lines marked CHANGE ME.
 */
const KOMUTE_URL = "https://komute.onrender.com";          // CHANGE ME if your site address is different
const KEY = "PUT_YOUR_PAY_SMS_KEY_HERE";                    // CHANGE ME: the same value as PAY_SMS_KEY in Render

// Only emails from these senders count as money from GCash (this stops fake emails from anyone else).
// Open one real GCash email in Gmail, tap the sender, and make sure its address ends with one of these.
const ALLOWED_SENDERS = ["@gcash.com", "@globe.com.ph"];

const DONE_LABEL = "komute-done";

function komuteSync() {
  readGcashEmails_();
  sendCodes_();
}

function readGcashEmails_() {
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = GmailApp.search("(from:gcash OR subject:gcash) newer_than:3d -label:" + DONE_LABEL, 0, 20);
  threads.forEach(function (thread) {
    let ok = true;
    thread.getMessages().forEach(function (m) {
      const from = String(m.getFrom()).toLowerCase();
      if (!ALLOWED_SENDERS.some(function (s) { return from.indexOf(s) !== -1; })) return; // not from GCash: ignore
      const text = m.getSubject() + "\n" + m.getPlainBody();
      try {
        const r = UrlFetchApp.fetch(KOMUTE_URL + "/api/gcash-sms?key=" + encodeURIComponent(KEY), {
          method: "post", contentType: "application/json", muteHttpExceptions: true,
          payload: JSON.stringify({ from: "gmail", text: text })
        });
        if (r.getResponseCode() >= 300) ok = false;
      } catch (e) { ok = false; }
    });
    if (ok) thread.addLabel(label); // done, never read twice
  });
}

function sendCodes_() {
  const url = KOMUTE_URL + "/api/gmail-outbox?key=" + encodeURIComponent(KEY);
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return;
  const mails = (JSON.parse(r.getContentText()).mails) || [];
  const sent = [];
  mails.forEach(function (m) {
    try { GmailApp.sendEmail(m.to, m.subject, m.body, { name: "Komute" }); sent.push(m.id); } catch (e) { /* tries again next minute */ }
  });
  if (sent.length) {
    UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ sent: sent }) });
  }
}

/** Run this ONCE (Run button) to make the script start by itself every minute. */
function setupTimer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("komuteSync").timeBased().everyMinutes(1).create();
}
