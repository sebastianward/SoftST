(() => {
  const form = document.getElementById("printer-form");
  if (!form) return;
  const mode = form.querySelector('[name="mode"]');
  const update = () => {
    form.querySelectorAll("[data-printer-mode]").forEach(section => {
      const active = section.dataset.printerMode === mode.value;
      section.hidden = !active;
      section.disabled = !active;
    });
  };
  mode.addEventListener("change", update);
  update();
})();
