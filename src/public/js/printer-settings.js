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
  const status = document.getElementById("printer-status");
  const lastError = document.getElementById("printer-last-error");
  if (!status) return;
  const refresh = async () => {
    try {
      const response = await fetch("/settings/printer/status", { headers: { Accept: "application/json" } });
      if (!response.ok || response.redirected) throw new Error();
      const result = await response.json();
      status.textContent = "Conexion guardada: " + result.message;
      status.dataset.available = String(result.available);
      lastError.textContent = result.lastError ? "Ultimo envio en espera: " + result.lastError : "";
    } catch { status.textContent = "No se pudo actualizar el estado de la conexion."; }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  const check = document.getElementById("check-printer-network");
  check.addEventListener("click", async () => {
    const result = document.getElementById("printer-network-result");
    check.disabled = true;
    result.textContent = "Comprobando conexion...";
    try {
      const response = await fetch("/settings/printer/check", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ host: form.querySelector('[name="host"]').value, port: form.querySelector('[name="port"]').value })
      });
      if (!response.ok || response.redirected) throw new Error();
      result.textContent = (await response.json()).message;
    } catch { result.textContent = "No se pudo comprobar la conexion."; }
    finally { check.disabled = false; }
  });
})();
