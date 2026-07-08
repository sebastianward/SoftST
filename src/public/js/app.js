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
const entryStatusFilter = document.querySelector("#entryStatusFilter");
const entrySearchShell = document.querySelector("[data-entry-search-shell]");
const entrySearchToggle = document.querySelector("[data-entry-search-toggle]");
const entryRows = document.querySelectorAll("[data-entry-row]");
const entrySortButtons = document.querySelectorAll(".table-sort-button");
const vehicleHistoryDate = document.querySelector("#vehicleHistoryDate");
const vehicleHistoryDateClear = document.querySelector("#vehicleHistoryDateClear");
const vehicleHistoryRows = document.querySelectorAll("[data-vehicle-history-row]");
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
const headerMenus = Array.from(document.querySelectorAll("[data-menu-toggle]")).map((toggle) => ({
  toggle,
  panel: toggle.parentElement?.querySelector("[data-menu-panel]"),
})).filter((menu) => menu.panel);
let activeTextInput = null;
let activeTextForm = null;
const workerSearchField = document.querySelector("#workerSearchField");
const workerPickerMenu = document.querySelector("#workerPickerMenu");
const workerPickerList = document.querySelector("#workerPickerList");
const workerPickerEmpty = document.querySelector("#workerPickerEmpty");
const workerIdInput = document.querySelector("#workerId");
const workerNameInput = document.querySelector("#workerName");
const workerOptions = workerPickerList ? Array.from(workerPickerList.querySelectorAll(".worker-picker-option")) : [];
const vehicleWorkerPickers = document.querySelectorAll("[data-vehicle-worker-picker]");
const entriesTable = document.querySelector("#entriesTable");
const entriesTableWrap = document.querySelector(".entries-table-wrap");
const entriesScrollbarTop = document.querySelector("[data-entries-scrollbar-top]");
const entriesScrollbarTopTrack = document.querySelector("[data-entries-scrollbar-top-track]");
let activeEntrySort = { key: "id", direction: "desc" };

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

function getEntrySortValue(row, key) {
  if (!row) {
    return "";
  }

  if (key === "entry_status") {
    const statusSelect = row.querySelector('select[name="entryStatus"]');
    if (statusSelect) {
      return String(statusSelect.value || "").toLowerCase();
    }
  }

  return String(row.dataset[`sort${key.charAt(0).toUpperCase()}${key.slice(1)}`] || "").toLowerCase();
}

function compareEntryRows(leftRow, rightRow, key, direction) {
  const leftValue = getEntrySortValue(leftRow, key);
  const rightValue = getEntrySortValue(rightRow, key);
  const isNumeric = ["id", "image_count"].includes(key);
  const leftComparable = isNumeric ? Number(leftValue || 0) : leftValue;
  const rightComparable = isNumeric ? Number(rightValue || 0) : rightValue;

  if (leftComparable < rightComparable) {
    return direction === "asc" ? -1 : 1;
  }

  if (leftComparable > rightComparable) {
    return direction === "asc" ? 1 : -1;
  }

  return 0;
}

function sortEntryRows() {
  if (!entriesTable) {
    return;
  }

  const tableBody = entriesTable.tBodies[0];
  if (!tableBody) {
    return;
  }

  const rows = Array.from(tableBody.querySelectorAll("[data-entry-row]"));
  rows
    .sort((leftRow, rightRow) =>
      compareEntryRows(leftRow, rightRow, activeEntrySort.key, activeEntrySort.direction)
    )
    .forEach((row) => tableBody.appendChild(row));

  entrySortButtons.forEach((button) => {
    const isActive = button.dataset.sortKey === activeEntrySort.key;
    button.dataset.sortDirection = isActive ? activeEntrySort.direction : "";
  });
}

function applyEntryFilters() {
  if (entryRows.length === 0) {
    return;
  }

  const query = entrySearch?.value.trim().toLowerCase() || "";
  const selectedStatus = entryStatusFilter?.value || "all";

  entryRows.forEach((row) => {
    const searchable = row.dataset.search || "";
    const statusValue = getEntrySortValue(row, "entry_status");
    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = selectedStatus === "all" || statusValue === selectedStatus;
    row.style.display = matchesSearch && matchesStatus ? "" : "none";
  });
}

if (entryRows.length > 0) {
  entrySearch?.addEventListener("input", applyEntryFilters);
  entryStatusFilter?.addEventListener("change", applyEntryFilters);

  entrySortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.dataset.sortKey || "id";

      if (activeEntrySort.key === nextKey) {
        activeEntrySort.direction = activeEntrySort.direction === "asc" ? "desc" : "asc";
      } else {
        activeEntrySort = {
          key: nextKey,
          direction: nextKey === "id" || nextKey === "created_at" ? "desc" : "asc",
        };
      }

      sortEntryRows();
      applyEntryFilters();
    });
  });

  sortEntryRows();
  applyEntryFilters();
}

if (entrySearchShell && entrySearchToggle && entrySearch) {
  const syncEntrySearchVisibility = (expanded) => {
    entrySearchShell.classList.toggle("is-collapsed", !expanded);

    if (expanded) {
      window.requestAnimationFrame(() => entrySearch.focus());
    }
  };

  syncEntrySearchVisibility(Boolean(entrySearch.value.trim()));

  entrySearchToggle.addEventListener("click", () => {
    const shouldExpand = entrySearchShell.classList.contains("is-collapsed");

    if (!shouldExpand && entrySearch.value.trim()) {
      entrySearch.value = "";
      applyEntryFilters();
    }

    syncEntrySearchVisibility(shouldExpand);
  });

  entrySearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !entrySearch.value.trim()) {
      syncEntrySearchVisibility(false);
      entrySearchToggle.focus();
    }
  });

  entrySearch.addEventListener("blur", () => {
    if (!entrySearch.value.trim()) {
      syncEntrySearchVisibility(false);
    }
  });
}

if (vehicleHistoryDate && vehicleHistoryRows.length > 0) {
  const syncVehicleHistoryDate = () => {
    const selectedDate = vehicleHistoryDate.value;
    vehicleHistoryRows.forEach((row) => {
      const rowDate = row.dataset.date || "";
      row.style.display = !selectedDate || rowDate === selectedDate ? "" : "none";
    });
  };

  vehicleHistoryDate.addEventListener("input", syncVehicleHistoryDate);
  vehicleHistoryDateClear?.addEventListener("click", () => {
    vehicleHistoryDate.value = "";
    syncVehicleHistoryDate();
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

if (headerMenus.length > 0) {
  const closeHeaderMenu = (menu) => {
    menu.panel.hidden = true;
    menu.toggle.setAttribute("aria-expanded", "false");
  };

  const openHeaderMenu = (menu) => {
    headerMenus.forEach((otherMenu) => {
      if (otherMenu !== menu) {
        closeHeaderMenu(otherMenu);
      }
    });

    menu.panel.hidden = false;
    menu.toggle.setAttribute("aria-expanded", "true");
  };

  headerMenus.forEach((menu) => {
    menu.toggle.addEventListener("click", () => {
      if (menu.panel.hidden) {
        openHeaderMenu(menu);
        return;
      }

      closeHeaderMenu(menu);
    });
  });

  document.addEventListener("click", (event) => {
    headerMenus.forEach((menu) => {
      if (!menu.toggle.contains(event.target) && !menu.panel.contains(event.target)) {
        closeHeaderMenu(menu);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      headerMenus.forEach((menu) => {
        if (!menu.panel.hidden) {
          closeHeaderMenu(menu);
        }
      });
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

if (vehicleWorkerPickers.length > 0) {
  vehicleWorkerPickers.forEach((picker) => {
    const searchInput = picker.querySelector("[data-worker-search-input]");
    const idInput = picker.querySelector("[data-worker-id-input]");
    const nameInput = picker.querySelector("[data-worker-name-input]");
    const menu = picker.querySelector("[data-worker-picker-menu]");
    const emptyState = picker.querySelector("[data-worker-picker-empty]");
    const options = Array.from(picker.querySelectorAll(".worker-picker-option"));

    if (!searchInput || !idInput || !nameInput || !menu || !emptyState || options.length === 0) {
      return;
    }

    const openPicker = () => {
      menu.hidden = false;
    };

    const closePicker = () => {
      menu.hidden = true;
    };

    const syncSelection = (option) => {
      idInput.value = option?.dataset.workerId || "";
      nameInput.value = option?.dataset.workerName || "";
      searchInput.value = option?.dataset.workerName || searchInput.value;
    };

    const filterOptions = () => {
      const query = searchInput.value.trim().toLowerCase();

      if (!query) {
        closePicker();
        emptyState.hidden = true;
        options.forEach((option) => {
          option.parentElement.hidden = true;
        });
        return;
      }

      openPicker();
      let visibleCount = 0;

      options.forEach((option) => {
        const matches = String(option.dataset.workerName || "").toLowerCase().includes(query);
        option.parentElement.hidden = !matches;
        if (matches) {
          visibleCount += 1;
        }
      });

      emptyState.hidden = visibleCount !== 0;

      const selectedStillVisible = options.some(
        (option) => option.dataset.workerId === idInput.value && !option.parentElement.hidden
      );

      if (idInput.value && !selectedStillVisible && query) {
        idInput.value = "";
        nameInput.value = "";
      }
    };

    searchInput.addEventListener("input", filterOptions);
    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim()) {
        filterOptions();
      }
    });

    options.forEach((option) => {
      option.addEventListener("click", () => {
        syncSelection(option);
        closePicker();
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target !== searchInput && !picker.contains(target)) {
        closePicker();
      }
    });

    if (idInput.value) {
      const selectedOption = options.find((option) => option.dataset.workerId === idInput.value);
      if (selectedOption) {
        syncSelection(selectedOption);
      }
    }

    filterOptions();
  });
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
