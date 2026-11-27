// Guide screen (Bootstrap accordion): numbered steps, then tips. Content is in js/data/guide.js.
(function (K) {
  function init() {
    document.getElementById("guideList").innerHTML = K.data().guideTopics.map((t, i) => `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button ${i ? "collapsed" : ""}" type="button" data-bs-toggle="collapse"
                  data-bs-target="#g-${t.id}" aria-expanded="${i ? "false" : "true"}" aria-controls="g-${t.id}">
            <span class="k-icon me-3"><i class="bi ${t.icon}"></i></span>
            <span><span class="fw-semibold d-block">${K.esc(K.L(t.title))}</span>
            <span class="small text-muted">${K.esc(K.L(t.subtitle))}</span></span>
          </button>
        </h2>
        <div id="g-${t.id}" class="accordion-collapse collapse ${i ? "" : "show"}" data-bs-parent="#guideList">
          <div class="accordion-body">
            <ol class="k-steps">${K.L(t.steps).map((x) => `<li>${K.esc(x)}</li>`).join("")}</ol>
            <h3 class="h6 mt-3"><i class="bi bi-lightbulb"></i> ${K.esc(K.t("guide.good"))}</h3>
            <ul class="mb-0">${K.L(t.tips).map((x) => `<li class="mb-1">${K.esc(x)}</li>`).join("")}</ul>
          </div>
        </div>
      </div>`).join("");
  }
  K.guide = { init, show() {}, relabel: init };
})(window.Komute);
