// Feedback: "Was this plan helpful?" thumbs, plus a form for comments, route corrections, bugs, and ideas.
(function (K) {
  const S = K.state, $ = (id) => document.getElementById(id);
  let modal, rating = "";

  function setRating(r) {
    rating = r;
    document.querySelectorAll("[data-fb-rate]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fbRate === r)));
  }

  function open(r, category) {
    setRating(r || "");
    $("fbCategory").value = category || (r ? "plan" : "idea");
    $("fbStatus").textContent = "";
    $("fbStatus").className = "small mt-2";
    $("fbSend").disabled = false;
    $("fbTrip").textContent = S.requested && S.destination ? `${K.fmt.first(S.origin)} → ${K.fmt.first(S.destination)}` : "";
    modal.show();
    setTimeout(() => $("fbMessage").focus(), 300);
  }

  async function send() {
    const message = $("fbMessage").value.trim();
    if (!message && !rating) { $("fbStatus").textContent = K.t("fb.needSomething"); $("fbStatus").className = "small mt-2 text-danger"; return; }
    $("fbSend").disabled = true;
    $("fbStatus").textContent = K.t("fb.sending");
    try {
      await K.api.feedback({
        rating, category: $("fbCategory").value, message, contact: $("fbContact").value.trim(), lang: K.lang,
        page: K.app.currentView(), model: S.ai && S.ai.model ? S.ai.model : "",
        trip: S.requested ? { from: S.origin, to: S.destination } : null
      });
      $("fbStatus").textContent = K.t("fb.thanks");
      $("fbStatus").className = "small mt-2 text-success fw-semibold";
      $("fbMessage").value = "";
      if (rating) { $("fbRateText").textContent = K.t("fb.thanksShort"); document.querySelectorAll("#fbRate [data-fb-quick]").forEach((b) => b.disabled = true); }
      setTimeout(() => modal.hide(), 1300);
    } catch (e) {
      $("fbStatus").textContent = e.message;
      $("fbStatus").className = "small mt-2 text-danger";
      $("fbSend").disabled = false;
    }
  }

  function reset() {
    $("fbRateText").textContent = K.t("fb.helpful");
    document.querySelectorAll("#fbRate [data-fb-quick]").forEach((b) => { b.disabled = false; });
  }

  function init() {
    modal = new bootstrap.Modal($("fbModal"));
    $("fbCategory").innerHTML = ["plan", "map", "fares", "bug", "idea"].map((c) => `<option value="${c}">${K.esc(K.t("fb.cat." + c))}</option>`).join("");
    document.querySelectorAll("[data-fb-rate]").forEach((b) => b.onclick = () => setRating(rating === b.dataset.fbRate ? "" : b.dataset.fbRate));
    document.querySelectorAll("[data-fb-quick]").forEach((b) => b.onclick = () => open(b.dataset.fbQuick, "plan"));
    document.querySelectorAll("[data-fb-open]").forEach((b) => b.onclick = (e) => { e.preventDefault(); open("", b.dataset.fbOpen || "idea"); });
    $("fbSend").onclick = send;
  }

  function relabel() {
    if (!modal) return;
    const v = $("fbCategory").value;
    $("fbCategory").innerHTML = ["plan", "map", "fares", "bug", "idea"].map((c) => `<option value="${c}">${K.esc(K.t("fb.cat." + c))}</option>`).join("");
    $("fbCategory").value = v || "plan";
  }

  K.feedback = { init, open, reset, relabel };
})(window.Komute);
