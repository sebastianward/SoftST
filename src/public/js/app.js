const input = document.querySelector("#images");
const preview = document.querySelector("#imagePreview");
const themeButtons = document.querySelectorAll("[data-theme-toggle]");
const themeLabels = document.querySelectorAll("[data-theme-label]");
const workerSearch = document.querySelector("#workerSearch");
const workerCards = document.querySelectorAll("[data-worker-name]");
const entrySearch = document.querySelector("#entrySearch");
const entryRows = document.querySelectorAll("[data-entry-row]");
const imageModal = document.querySelector("#imageModal");
const imageModalGrid = document.querySelector("#imageModalGrid");
const imageModalTriggers = document.querySelectorAll(".image-modal-trigger");
const imageModalClosers = document.querySelectorAll("[data-close-image-modal]");
const textModal = document.querySelector("#textModal");
const textModalTitle = document.querySelector("#textModalTitle");
const textModalTextarea = document.querySelector("#textModalTextarea");
const textModalSave = document.querySelector("#textModalSave");
const textModalTriggers = document.querySelectorAll(".comment-modal-trigger, .text-modal-trigger");
const textModalClosers = document.querySelectorAll("[data-close-text-modal]");
let activeTextInput = null;
let activeTextForm = null;
const workerNameInput = document.querySelector("#workerName");
const workerIdInput = document.querySelector("#workerId");
const workerOptions = document.querySelectorAll("#workersList option");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("softst-theme", theme);
  const nextLabel = theme === "dark" ? "Modo claro" : "Modo oscuro";
  themeLabels.forEach((label) => {
    label.textContent = nextLabel;
  });
}

const initialTheme = localStorage.getItem("softst-theme") || "dark";
applyTheme(initialTheme);

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme || "dark";
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
});

if (workerSearch && workerCards.length > 0) {
  workerSearch.addEventListener("input", () => {
    const query = workerSearch.value.trim().toLowerCase();

    workerCards.forEach((card) => {
      const workerName = card.dataset.workerName || "";
      card.style.display = workerName.includes(query) ? "" : "none";
    });
  });
}

if (entrySearch && entryRows.length > 0) {
  entrySearch.addEventListener("input", () => {
    const query = entrySearch.value.trim().toLowerCase();

    entryRows.forEach((row) => {
      const searchable = row.dataset.search || "";
      row.style.display = searchable.includes(query) ? "" : "none";
    });
  });
}

if (imageModal && imageModalGrid && imageModalTriggers.length > 0) {
  const closeImageModal = () => {
    imageModal.hidden = true;
    imageModalGrid.innerHTML = "";
  };

  imageModalTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const images = (trigger.dataset.images || "")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);

      imageModalGrid.innerHTML = "";

      images.forEach((imagePath) => {
        const link = document.createElement("a");
        link.href = `/${imagePath}`;
        link.target = "_blank";
        link.rel = "noreferrer";

        const image = document.createElement("img");
        image.src = `/${imagePath}`;
        image.alt = "Imagen del ingreso";

        link.appendChild(image);
        imageModalGrid.appendChild(link);
      });

      imageModal.hidden = false;
    });
  });

  imageModalClosers.forEach((element) => {
    element.addEventListener("click", closeImageModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !imageModal.hidden) {
      closeImageModal();
    }
  });
}

if (textModal && textModalTextarea && textModalTriggers.length > 0) {
  const closeTextModal = () => {
    textModal.hidden = true;
    textModalTextarea.value = "";
    textModalTextarea.readOnly = false;
    activeTextInput = null;
    activeTextForm = null;
  };

  textModalTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const isReadonly =
        trigger.dataset.commentReadonly === "true" || trigger.dataset.textReadonly === "true";
      const value = trigger.dataset.commentValue || trigger.dataset.textValue || "";
      const formId = trigger.dataset.commentForm || trigger.dataset.textForm || "";
      const fieldName = trigger.dataset.textField || "comment";
      const title = trigger.dataset.textTitle || "Comentario";

      activeTextInput = formId
        ? document.querySelector(`input[name="${fieldName}"][form="${formId}"]`)
        : null;
      activeTextForm = formId ? document.querySelector(`#${formId}`) : null;

      textModalTitle.textContent = title;
      textModalTextarea.value = value;
      textModalTextarea.readOnly = isReadonly;
      textModalSave.hidden = isReadonly;
      textModal.hidden = false;
    });
  });

  textModalClosers.forEach((element) => {
    element.addEventListener("click", closeTextModal);
  });

  textModalSave?.addEventListener("click", () => {
    if (activeTextInput) {
      activeTextInput.value = textModalTextarea.value;
    }
    if (activeTextForm) {
      activeTextForm.requestSubmit();
      return;
    }
    closeTextModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !textModal.hidden) {
      closeTextModal();
    }
  });
}

if (workerNameInput && workerIdInput && workerOptions.length > 0) {
  const workerMap = new Map(
    Array.from(workerOptions).map((option) => [option.value.toLowerCase(), option.dataset.id])
  );

  const syncWorkerSelection = () => {
    const value = workerNameInput.value.trim().toLowerCase();
    workerIdInput.value = workerMap.get(value) || "";
  };

  workerNameInput.addEventListener("input", syncWorkerSelection);
  workerNameInput.addEventListener("change", syncWorkerSelection);
  syncWorkerSelection();
}

if (input && preview) {
  input.addEventListener("change", () => {
    preview.innerHTML = "";

    Array.from(input.files || []).forEach((file) => {
      const wrapper = document.createElement("figure");
      wrapper.className = "preview-card";

      const image = document.createElement("img");
      image.alt = file.name;
      image.src = URL.createObjectURL(file);

      const caption = document.createElement("figcaption");
      caption.textContent = file.name;

      wrapper.appendChild(image);
      wrapper.appendChild(caption);
      preview.appendChild(wrapper);
    });
  });
}
