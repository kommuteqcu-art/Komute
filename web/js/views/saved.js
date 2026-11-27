// Saved places screen: use a place as Start or Destination, add your own, or remove one.
(function (K) {
  const ICONS = { HOME: "bi-house-fill", SCHOOL: "bi-mortarboard-fill", WORK: "bi-briefcase-fill", OTHER: "bi-star-fill" };
  const key = (p) => JSON.stringify([p.name, p.address, p.type, p.builtIn || false, p.lat, p.lng]);

  function init() {
    const list = document.getElementById("savedList");
    const places = K.places.all();
    const opened = new Set(Array.from(list.querySelectorAll("details[open]"), (item) => item.dataset.place));
    list.innerHTML = places.length ? places.map((p, i) => `
      <details class="k-disclosure k-saved-place" data-place="${K.esc(key(p))}"${opened.has(key(p)) ? " open" : ""}>
        <summary>
          <span class="k-icon" aria-hidden="true"><i class="bi ${ICONS[p.type] || "bi-geo-alt"}"></i></span>
          <span class="k-saved-label"><strong>${K.esc(K.places.label(p))}</strong>
            <span>${K.esc(p.address)}</span></span>
        </summary>
        <div class="k-disclosure-body k-saved-btns">
          <button type="button" class="btn btn-outline-primary" data-i="${i}" data-use="start">${K.esc(K.t("saved.useStart"))}</button>
          <button type="button" class="btn btn-primary" data-i="${i}" data-use="dest">${K.esc(K.t("saved.useDest"))}</button>
          <button type="button" class="btn btn-link" data-i="${i}" data-use="del"><i class="bi bi-trash" aria-hidden="true"></i> ${K.esc(K.t("saved.remove"))}</button>
        </div>
      </details>`).join("") : `<div class="k-card k-saved-empty">
        <p>${K.esc(K.t("saved.empty"))}</p>
        <a class="btn btn-outline-primary" href="#plan">${K.esc(K.t("saved.openPlan"))}</a>
      </div>`;
    list.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const index = Number(b.dataset.i);
        const place = places[index];
        if (b.dataset.use === "del") {
          K.places.remove(place);
          init();
          K.home.relabel();
          const summaries = list.querySelectorAll("summary");
          (summaries[Math.min(index, summaries.length - 1)] || list.querySelector("a"))?.focus();
          return;
        }
        if (b.dataset.use === "start") K.home.useSavedStart(place); else K.home.useSavedPlace(place);
        location.hash = "#plan";
      };
    });
  }
  K.saved = { init, show: init };
})(window.Komute);
