// Saved places screen: use a place as Start or Destination, add your own, or remove one.
(function (K) {
  const ICONS = { HOME: "bi-house-fill", SCHOOL: "bi-mortarboard-fill", WORK: "bi-briefcase-fill", OTHER: "bi-star-fill" };

  function init() {
    const list = document.getElementById("savedList");
    const places = K.places.all();
    list.innerHTML = places.length ? places.map((p, i) => `
      <div class="list-group-item">
        <span class="k-icon"><i class="bi ${ICONS[p.type] || "bi-geo-alt"}"></i></span>
        <span class="flex-grow-1 min-w-0"><span class="fw-semibold d-block">${K.esc(K.places.label(p))}</span>
          <span class="text-muted small d-block text-truncate">${K.esc(p.address)}</span></span>
        <span class="k-saved-btns">
          <button type="button" class="btn btn-outline-primary btn-sm rounded-pill" data-i="${i}" data-use="start"><span class="k-dotmini a"></span> ${K.esc(K.t("saved.start"))}</button>
          <button type="button" class="btn btn-primary btn-sm rounded-pill" data-i="${i}" data-use="dest"><span class="k-dotmini b"></span> ${K.esc(K.t("saved.dest"))}</button>
          <button type="button" class="btn btn-link btn-sm text-muted" data-i="${i}" data-use="del" aria-label="${K.esc(K.t("saved.remove"))}" title="${K.esc(K.t("saved.remove"))}"><i class="bi bi-trash"></i></button>
        </span>
      </div>`).join("") : `<p class="text-muted">${K.esc(K.t("saved.empty"))}</p>`;
    list.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const place = places[Number(b.dataset.i)];
        if (b.dataset.use === "del") { K.places.remove(place); init(); K.home.relabel(); return; }
        if (b.dataset.use === "start") K.home.useSavedStart(place); else K.home.useSavedPlace(place);
        location.hash = "#plan";
      };
    });
  }
  K.saved = { init, show: init };
})(window.Komute);
