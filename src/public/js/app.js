const input = document.querySelector("#images");
const galleryInput = document.querySelector("#imagesGallery");
const cameraInput = document.querySelector("#imagesCamera");
const openGalleryButton = document.querySelector("#openGalleryButton");
const openCameraButton = document.querySelector("#openCameraButton");
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
const passwordModal = document.querySelector("#passwordModal");
const passwordModalOpeners = document.querySelectorAll("[data-open-password-modal]");
const passwordModalClosers = document.querySelectorAll("[data-close-password-modal]");
let activeTextInput = null;
let activeTextForm = null;
const workerSearchField = document.querySelector("#workerSearchField");
const workerPickerMenu = document.querySelector("#workerPickerMenu");
const workerPickerList = document.querySelector("#workerPickerList");
const workerPickerEmpty = document.querySelector("#workerPickerEmpty");
const workerIdInput = document.querySelector("#workerId");
const workerNameInput = document.querySelector("#workerName");
const workerOptions = workerPickerList ? Array.from(workerPickerList.querySelectorAll(".worker-picker-option")) : [];
const entriesVisibilityForm = document.querySelector(".entries-visibility-form");
const visibilityCheckboxes = document.querySelectorAll(".entries-visibility-form input[type='checkbox']");
const entriesTable = document.querySelector("#entriesTable");
const entriesTableWrap = document.querySelector(".entries-table-wrap");
const entriesScrollbarTop = document.querySelector("[data-entries-scrollbar-top]");
const entriesScrollbarTopTrack = document.querySelector("[data-entries-scrollbar-top-track]");

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

if (entriesVisibilityForm && visibilityCheckboxes.length > 0) {
  const syncEntriesVisibility = () => {
    const params = new URLSearchParams(window.location.search);

    visibilityCheckboxes.forEach((checkbox) => {
      params.set(checkbox.name, checkbox.checked ? "1" : "0");
    });

    const query = params.toString();
    window.location.assign(`${entriesVisibilityForm.action}?${query}`);
  };

  visibilityCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      syncEntriesVisibility();
    });
  });
}

if (entriesTable && entriesTableWrap && entriesScrollbarTop && entriesScrollbarTopTrack) {
  let syncingTopScroll = false;
  let syncingBottomScroll = false;

  const syncEntriesScrollWidth = () => {
    entriesScrollbarTopTrack.style.width = `${entriesTable.scrollWidth}px`;
    entriesScrollbarTop.hidden = entriesTable.scrollWidth <= entriesTableWrap.clientWidth;
  };

  entriesScrollbarTop.addEventListener("scroll", () => {
    if (syncingBottomScroll) {
      syncingBottomScroll = false;
      return;
    }

    syncingTopScroll = true;
    entriesTableWrap.scrollLeft = entriesScrollbarTop.scrollLeft;
  });

  entriesTableWrap.addEventListener("scroll", () => {
    if (syncingTopScroll) {
      syncingTopScroll = false;
      return;
    }

    syncingBottomScroll = true;
    entriesScrollbarTop.scrollLeft = entriesTableWrap.scrollLeft;
  });

  window.addEventListener("resize", syncEntriesScrollWidth);
  syncEntriesScrollWidth();
  entriesScrollbarTop.scrollLeft = entriesTableWrap.scrollLeft;
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

if (passwordModal && passwordModalOpeners.length > 0) {
  const closePasswordModal = () => {
    passwordModal.hidden = true;
  };

  passwordModalOpeners.forEach((button) => {
    button.addEventListener("click", () => {
      passwordModal.hidden = false;
      passwordModal.querySelector("input[name='currentPassword']")?.focus();
    });
  });

  passwordModalClosers.forEach((button) => {
    button.addEventListener("click", closePasswordModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !passwordModal.hidden) {
      closePasswordModal();
    }
  });
}

if (workerSearchField && workerPickerMenu && workerIdInput && workerNameInput && workerOptions.length > 0) {
  const openWorkerPicker = () => {
    workerPickerMenu.hidden = false;
  };

  const closeWorkerPicker = () => {
    workerPickerMenu.hidden = true;
  };

  const syncWorkerSelection = (option) => {
    workerIdInput.value = option?.dataset.workerId || "";
    workerNameInput.value = option?.dataset.workerName || "";
    workerSearchField.value = option?.dataset.workerName || workerSearchField.value;
  };

  const filterWorkerOptions = () => {
    const query = workerSearchField.value.trim().toLowerCase();
    if (!query) {
      workerPickerMenu.hidden = true;
      workerPickerEmpty.hidden = true;
      workerOptions.forEach((option) => {
        option.parentElement.hidden = true;
      });
      return;
    }

    openWorkerPicker();
    let visibleCount = 0;

    workerOptions.forEach((option) => {
      const matches = !query || String(option.dataset.workerName || "").toLowerCase().includes(query);
      option.parentElement.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    });

    if (visibleCount === 0) {
      workerPickerEmpty.hidden = false;
    } else {
      workerPickerEmpty.hidden = true;
    }

    const selectedStillVisible = workerOptions.some(
      (option) => option.dataset.workerId === workerIdInput.value && !option.parentElement.hidden
    );
    if (workerIdInput.value && !selectedStillVisible && query) {
      workerIdInput.value = "";
      workerNameInput.value = "";
    }
  };

  workerSearchField.addEventListener("input", () => {
    filterWorkerOptions();
  });
  workerSearchField.addEventListener("focus", () => {
    if (workerSearchField.value.trim()) {
      filterWorkerOptions();
    }
  });

  workerOptions.forEach((option) => {
    option.addEventListener("click", () => {
      syncWorkerSelection(option);
      closeWorkerPicker();
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target !== workerSearchField &&
      !workerPickerMenu.contains(target)
    ) {
      closeWorkerPicker();
    }
  });

  if (workerIdInput.value) {
    const selectedOption = workerOptions.find((option) => option.dataset.workerId === workerIdInput.value);
    if (selectedOption) {
      syncWorkerSelection(selectedOption);
    }
  }

  filterWorkerOptions();
}

if (input && preview && galleryInput && cameraInput && openGalleryButton && openCameraButton) {
  const maxImages = 15;
  const selectedImageFiles = [];

  const syncSelectedFilesToInput = () => {
    const transfer = new DataTransfer();
    selectedImageFiles.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  };

  const renderSelectedImages = () => {
    preview.innerHTML = "";

    selectedImageFiles.forEach((file, index) => {
      const wrapper = document.createElement("figure");
      wrapper.className = "preview-card";

      const image = document.createElement("img");
      image.alt = file.name;
      image.src = URL.createObjectURL(file);

      const caption = document.createElement("figcaption");
      caption.textContent = file.name;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "ghost-button preview-remove";
      removeButton.textContent = "Quitar";
      removeButton.addEventListener("click", () => {
        selectedImageFiles.splice(index, 1);
        syncSelectedFilesToInput();
        renderSelectedImages();
      });

      wrapper.appendChild(image);
      wrapper.appendChild(caption);
      wrapper.appendChild(removeButton);
      preview.appendChild(wrapper);
    });
  };

  const appendIncomingFiles = (incomingFiles) => {
    Array.from(incomingFiles || []).forEach((file) => {
      const exists = selectedImageFiles.some(
        (current) =>
          current.name === file.name &&
          current.size === file.size &&
          current.lastModified === file.lastModified
      );

      if (!exists && selectedImageFiles.length < maxImages) {
        selectedImageFiles.push(file);
      }
    });

    syncSelectedFilesToInput();
    renderSelectedImages();
  };

  openGalleryButton.addEventListener("click", () => {
    galleryInput.click();
  });

  openCameraButton.addEventListener("click", () => {
    cameraInput.click();
  });

  galleryInput.addEventListener("change", () => {
    appendIncomingFiles(galleryInput.files);
    galleryInput.value = "";
  });

  cameraInput.addEventListener("change", () => {
    appendIncomingFiles(cameraInput.files);
    cameraInput.value = "";
  });
}
