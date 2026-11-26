// Komute payment emails, sent from the Gmail that owns this script. Free, no extra account.
// 1. Change KEY to the same value as PAY_SMS_KEY in Render.
// 2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy and allow the permissions.
// 3. Copy the Web app URL into Render as MAIL_HOOK_URL.
const KEY = "CHANGE-ME-same-as-PAY_SMS_KEY";
const TO = "kommuteqcu@gmail.com";

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.key !== KEY) return ContentService.createTextOutput("bad key");
    MailApp.sendEmail(TO, String(d.subject || "Komute").slice(0, 200), String(d.text || "").slice(0, 4000));
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("error " + err);
  }
}

// Optional: pick "testMail" in the toolbar and press Run to check that Gmail lets the script send.
function testMail() { MailApp.sendEmail(TO, "Komute test", "If you read this, the mail script works."); }
