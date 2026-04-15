const SUPABASE_TABLES = {
  items: "items",
  purchases: "purchases",
  usages: "usages",
};

const state = {
  items: [],
  purchases: [],
  usages: [],
};

const skuForm = document.querySelector("#sku-form");
const purchaseForm = document.querySelector("#purchase-form");
const usageForm = document.querySelector("#usage-form");
const skuFormTitle = document.querySelector("#sku-form-title");
const skuSubmitButton = document.querySelector("#sku-submit-button");
const skuCancelButton = document.querySelector("#sku-cancel-button");
const resetDataButton = document.querySelector("#reset-data-button");
const desktopViewButton = document.querySelector("#desktop-view-button");
const mobileViewButton = document.querySelector("#mobile-view-button");
const operationsPageLink = document.querySelector("#operations-page-link");
const catalogPageLink = document.querySelector("#catalog-page-link");
const importSkusInput = document.querySelector("#import-skus-input");
const importPurchasesInput = document.querySelector("#import-purchases-input");
const importUsagesInput = document.querySelector("#import-usages-input");
const purchaseSelect = purchaseForm.elements.itemId;
const usageSelect = usageForm.elements.itemId;
const heroMetrics = document.querySelector("#hero-metrics");
const connectionStatus = document.querySelector("#connection-status");
const catalogBody = document.querySelector("#catalog-body");
const inventoryBody = document.querySelector("#inventory-body");
const purchasesBody = document.querySelector("#purchases-body");
const usageBody = document.querySelector("#usage-body");
const appShell = document.querySelector(".app-shell");
const pageSections = document.querySelectorAll(".page-section");

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = createSupabaseClient();

setTodayDefault(purchaseForm.elements.purchasedAt);
setTodayDefault(usageForm.elements.usedAt);
resetSkuForm();
bindEvents();
applyViewMode("desktop");
applyPageMode();
initializeApp();

function bindEvents() {
  skuForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      notifyMissingConfig();
      return;
    }

    const formData = new FormData(skuForm);
    const itemId = String(formData.get("itemId") || "").trim();
    const existingItem = state.items.find((item) => item.id === itemId);
    const sku = existingItem ? existingItem.sku : getNextSku();

    const payload = {
      name: String(formData.get("name")).trim(),
      sku,
      category: String(formData.get("category")).trim(),
      unit: String(formData.get("unit")).trim(),
      minimum_stock: Number(formData.get("minimumStock")),
    };

    try {
      if (existingItem) {
        await runQuery(
          supabaseClient.from(SUPABASE_TABLES.items).update(payload).eq("id", itemId),
          "No se pudo actualizar el SKU.",
        );
      } else {
        await runQuery(
          supabaseClient.from(SUPABASE_TABLES.items).insert(payload),
          "No se pudo guardar el SKU.",
        );
      }

      await refreshData();
      resetSkuForm();
      setConnectionMessage("Cambios guardados correctamente.", "success");
    } catch (error) {
      window.alert(error.message);
      setConnectionMessage(error.message, "error");
    }
  });

  purchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      notifyMissingConfig();
      return;
    }

    if (!state.items.length) {
      window.alert("Primero agrega un SKU.");
      return;
    }

    const formData = new FormData(purchaseForm);
    const itemId = String(formData.get("itemId"));

    try {
      await runQuery(
        supabaseClient.from(SUPABASE_TABLES.purchases).insert({
          item_id: itemId,
          quantity: Number(formData.get("quantity")),
          purchased_at: String(formData.get("purchasedAt")),
          supplier: String(formData.get("supplier")).trim(),
          cost: Number(formData.get("cost") || 0),
        }),
        "No se pudo guardar la compra.",
      );

      await refreshData();
      purchaseForm.reset();
      setTodayDefault(purchaseForm.elements.purchasedAt);
      setConnectionMessage("Compra guardada correctamente.", "success");
    } catch (error) {
      window.alert(error.message);
      setConnectionMessage(error.message, "error");
    }
  });

  usageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      notifyMissingConfig();
      return;
    }

    if (!state.items.length) {
      window.alert("Primero agrega un SKU.");
      return;
    }

    const formData = new FormData(usageForm);
    const itemId = String(formData.get("itemId"));
    const quantity = Number(formData.get("quantity"));
    const currentStock = getStockForItem(itemId);

    if (quantity > currentStock) {
      window.alert(`No puedes registrar ${quantity}. El stock actual es ${currentStock}.`);
      return;
    }

    try {
      await runQuery(
        supabaseClient.from(SUPABASE_TABLES.usages).insert({
          item_id: itemId,
          quantity,
          used_at: String(formData.get("usedAt")),
          note: String(formData.get("note")).trim(),
        }),
        "No se pudo guardar la salida.",
      );

      await refreshData();
      usageForm.reset();
      setTodayDefault(usageForm.elements.usedAt);
      setConnectionMessage("Salida guardada correctamente.", "success");
    } catch (error) {
      window.alert(error.message);
      setConnectionMessage(error.message, "error");
    }
  });

  skuCancelButton.addEventListener("click", () => {
    resetSkuForm();
  });

  resetDataButton.addEventListener("click", async () => {
    await resetAllData();
  });

  desktopViewButton.addEventListener("click", () => {
    applyViewMode("desktop");
  });

  mobileViewButton.addEventListener("click", () => {
    applyViewMode("mobile");
  });

  importSkusInput.addEventListener("change", async (event) => {
    await handleCsvImport(event, importItemsFromCsv);
  });

  importPurchasesInput.addEventListener("change", async (event) => {
    await handleCsvImport(event, importPurchasesFromCsv);
  });

  importUsagesInput.addEventListener("change", async (event) => {
    await handleCsvImport(event, importUsagesFromCsv);
  });

  catalogBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, itemId } = actionButton.dataset;
    if (!itemId) {
      return;
    }

    if (action === "edit") {
      startEditingItem(itemId);
      return;
    }

    if (action === "delete") {
      await deleteItem(itemId);
    }
  });
}

async function initializeApp() {
  if (!supabaseClient) {
    notifyMissingConfig();
    render();
    return;
  }

  try {
    await refreshData();
    setConnectionMessage("Conexión lista.", "success");
  } catch (error) {
    render();
    setConnectionMessage(error.message, "error");
  }
}

async function refreshData() {
  const [items, purchases, usages] = await Promise.all([
    fetchItems(),
    fetchPurchases(),
    fetchUsages(),
  ]);

  state.items = items;
  state.purchases = purchases;
  state.usages = usages;
  render();
}

async function fetchItems() {
  const data = await runQuery(
    supabaseClient
      .from(SUPABASE_TABLES.items)
      .select("id, name, sku, category, unit, minimum_stock, created_at")
      .order("created_at", { ascending: false }),
    "No se pudieron cargar los SKUs.",
  );

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    unit: item.unit,
    minimumStock: item.minimum_stock,
    createdAt: item.created_at,
  }));
}

async function fetchPurchases() {
  const data = await runQuery(
    supabaseClient
      .from(SUPABASE_TABLES.purchases)
      .select("id, item_id, quantity, purchased_at, supplier, cost, created_at")
      .order("purchased_at", { ascending: false }),
    "No se pudieron cargar las compras.",
  );

  return data.map((purchase) => ({
    id: purchase.id,
    itemId: purchase.item_id,
    quantity: purchase.quantity,
    purchasedAt: purchase.purchased_at,
    supplier: purchase.supplier || "",
    cost: Number(purchase.cost || 0),
    createdAt: purchase.created_at,
  }));
}

async function fetchUsages() {
  const data = await runQuery(
    supabaseClient
      .from(SUPABASE_TABLES.usages)
      .select("id, item_id, quantity, used_at, note, created_at")
      .order("used_at", { ascending: false }),
    "No se pudieron cargar las salidas.",
  );

  return data.map((usage) => ({
    id: usage.id,
    itemId: usage.item_id,
    quantity: usage.quantity,
    usedAt: usage.used_at,
    note: usage.note || "",
    createdAt: usage.created_at,
  }));
}

function render() {
  renderCatalog();
  renderSelectOptions();
  renderHeroMetrics();
  renderInventory();
  renderPurchases();
  renderUsages();
  syncAutoSku();
}

function renderCatalog() {
  if (!state.items.length) {
    catalogBody.innerHTML = emptyRow(6);
    return;
  }

  catalogBody.innerHTML = getItemsSortedBySku()
    .map(
      (item) => `
        <tr>
          <td>${item.sku}</td>
          <td>${item.name}</td>
          <td>${item.category || "Sin categoría"}</td>
          <td>${formatUnit(item.unit)}</td>
          <td>${item.minimumStock}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="action-button" data-action="edit" data-item-id="${item.id}">
                Editar
              </button>
              <button type="button" class="danger-button" data-action="delete" data-item-id="${item.id}">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderSelectOptions() {
  const options = getItemsSortedBySku()
    .map((item) => `<option value="${item.id}">${item.sku} · ${item.name}</option>`)
    .join("");

  const placeholder = `<option value="" disabled selected>${state.items.length ? "Selecciona un SKU" : "Primero crea un SKU"}</option>`;
  purchaseSelect.innerHTML = placeholder + options;
  usageSelect.innerHTML = placeholder + options;
}

function renderHeroMetrics() {
  if (!heroMetrics) {
    return;
  }

  const totalItems = state.items.length;
  const totalStock = state.items.reduce((accumulator, item) => accumulator + getStockForItem(item.id), 0);
  const lowStock = state.items.filter((item) => {
    const stock = getStockForItem(item.id);
    return stock > 0 && stock <= item.minimumStock;
  }).length;
  const exhausted = state.items.filter((item) => getStockForItem(item.id) === 0).length;

  heroMetrics.innerHTML = [
    metricCard(totalItems, "SKUs activos"),
    metricCard(totalStock, "Unidades disponibles"),
    metricCard(lowStock, "Con stock bajo"),
    metricCard(exhausted, "Agotados"),
  ].join("");
}

function renderInventory() {
  if (!state.items.length) {
    inventoryBody.innerHTML = emptyRow(7);
    return;
  }

  inventoryBody.innerHTML = getItemsSortedBySku()
    .map((item) => {
      const stock = getStockForItem(item.id);
      const lastPurchase = state.purchases.find((purchase) => purchase.itemId === item.id);
      const averageDuration = getAverageDurationForItem(item.id);
      const exhaustedOn = stock === 0 ? findExhaustedDate(item.id) : "";
      const status = getStatus(stock, item.minimumStock);

      return `
        <tr>
          <td>${item.sku}</td>
          <td>
            <strong>${item.name}</strong><br />
            <span>${item.category || "Sin categoría"} · ${formatUnit(item.unit)}</span>
          </td>
          <td>${stock} ${formatUnit(item.unit)}</td>
          <td>${lastPurchase ? formatDate(lastPurchase.purchasedAt) : "Sin compras"}</td>
          <td>${averageDuration}</td>
          <td>${exhaustedOn ? formatDate(exhaustedOn) : "Con existencias"}</td>
          <td><span class="status-pill ${status.className}">${status.label}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderPurchases() {
  if (!state.purchases.length) {
    purchasesBody.innerHTML = emptyRow(6);
    return;
  }

  purchasesBody.innerHTML = state.purchases
    .map((purchase) => {
      const item = findItem(purchase.itemId);
      return `
        <tr>
          <td>${formatDate(purchase.purchasedAt)}</td>
          <td>${item ? item.sku : "SKU eliminado"}</td>
          <td>${item ? item.name : "Insumo eliminado"}</td>
          <td>${purchase.quantity}</td>
          <td>${purchase.supplier || "Sin proveedor"}</td>
          <td>${purchase.cost ? formatCurrency(purchase.cost) : "Sin costo"}</td>
        </tr>
      `;
    })
    .join("");
}

function renderUsages() {
  if (!state.usages.length) {
    usageBody.innerHTML = emptyRow(4);
    return;
  }

  usageBody.innerHTML = state.usages
    .map((usage) => {
      const item = findItem(usage.itemId);
      return `
        <tr>
          <td>${formatDate(usage.usedAt)}</td>
          <td>${item ? item.sku : "SKU eliminado"}</td>
          <td>${usage.quantity}</td>
          <td>${usage.note || "Sin nota"}</td>
        </tr>
      `;
    })
    .join("");
}

function getStockForItem(itemId) {
  const purchased = state.purchases
    .filter((purchase) => purchase.itemId === itemId)
    .reduce((accumulator, purchase) => accumulator + purchase.quantity, 0);

  const used = state.usages
    .filter((usage) => usage.itemId === itemId)
    .reduce((accumulator, usage) => accumulator + usage.quantity, 0);

  return purchased - used;
}

function getAverageDurationForItem(itemId) {
  const purchases = state.purchases
    .filter((purchase) => purchase.itemId === itemId)
    .sort((left, right) => right.purchasedAt.localeCompare(left.purchasedAt));

  if (!purchases.length) {
    return "Sin compras";
  }

  const lastPurchase = purchases[0];
  const usagesAfterPurchase = state.usages
    .filter((usage) => usage.itemId === itemId && usage.usedAt >= lastPurchase.purchasedAt)
    .map((usage) => getDaysBetween(lastPurchase.purchasedAt, usage.usedAt));

  if (!usagesAfterPurchase.length) {
    return "Sin salidas";
  }

  const averageDays = usagesAfterPurchase.reduce((total, days) => total + days, 0) / usagesAfterPurchase.length;
  return `${averageDays.toFixed(1)} días`;
}

function findExhaustedDate(itemId) {
  const movements = [
    ...state.purchases
      .filter((purchase) => purchase.itemId === itemId)
      .map((purchase) => ({
        date: purchase.purchasedAt,
        delta: purchase.quantity,
      })),
    ...state.usages
      .filter((usage) => usage.itemId === itemId)
      .map((usage) => ({
        date: usage.usedAt,
        delta: usage.quantity * -1,
      })),
  ].sort((left, right) => left.date.localeCompare(right.date));

  let runningStock = 0;
  let exhaustedDate = "";

  movements.forEach((movement) => {
    runningStock += movement.delta;
    if (runningStock <= 0) {
      exhaustedDate = movement.date;
    }
  });

  return exhaustedDate;
}

function getStatus(stock, minimumStock) {
  if (stock === 0) {
    return { label: "Agotado", className: "status-empty" };
  }

  if (stock <= minimumStock) {
    return { label: "Stock bajo", className: "status-low" };
  }

  return { label: "OK", className: "status-ok" };
}

function findItem(itemId) {
  return state.items.find((item) => item.id === itemId);
}

function startEditingItem(itemId) {
  const item = findItem(itemId);
  if (!item) {
    return;
  }

  skuForm.elements.itemId.value = item.id;
  skuForm.elements.name.value = item.name;
  skuForm.elements.sku.value = item.sku;
  skuForm.elements.category.value = item.category;
  skuForm.elements.unit.value = item.unit;
  skuForm.elements.minimumStock.value = item.minimumStock;
  skuFormTitle.textContent = "Editar SKU";
  skuSubmitButton.textContent = "Guardar cambios";
  skuCancelButton.classList.remove("hidden");
  skuForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteItem(itemId) {
  const item = findItem(itemId);
  if (!item) {
    return;
  }

  const hasMovements = state.purchases.some((purchase) => purchase.itemId === itemId)
    || state.usages.some((usage) => usage.itemId === itemId);

  if (hasMovements) {
    window.alert("Este SKU tiene compras o salidas registradas. Con la estructura actual en Supabase no se puede eliminar sin afectar la relación histórica.");
    return;
  }

  const confirmed = window.confirm(`¿Eliminar el SKU ${item.sku}?`);
  if (!confirmed) {
    return;
  }

  try {
    await runQuery(
      supabaseClient.from(SUPABASE_TABLES.items).delete().eq("id", itemId),
      "No se pudo eliminar el SKU.",
    );

    await refreshData();
    if (skuForm.elements.itemId.value === itemId) {
      resetSkuForm();
    }
  } catch (error) {
    window.alert(error.message);
  }
}

function resetSkuForm() {
  skuForm.reset();
  skuForm.elements.itemId.value = "";
  skuFormTitle.textContent = "Alta de SKU";
  skuSubmitButton.textContent = "Guardar SKU";
  skuCancelButton.classList.add("hidden");
  skuForm.elements.minimumStock.value = 0;
  skuForm.elements.category.value = "Cafetería";
  syncAutoSku();
}

async function resetAllData() {
  if (!supabaseClient) {
    notifyMissingConfig();
    return;
  }

  const confirmed = window.confirm(
    "Esto borrará todo el historial, compras, salidas y productos en Supabase. ¿Quieres continuar?",
  );

  if (!confirmed) {
    return;
  }

  try {
    await runQuery(supabaseClient.from(SUPABASE_TABLES.usages).delete().gte("quantity", 1), "No se pudieron borrar las salidas.");
    await runQuery(supabaseClient.from(SUPABASE_TABLES.purchases).delete().gte("quantity", 1), "No se pudieron borrar las compras.");
    await runQuery(supabaseClient.from(SUPABASE_TABLES.items).delete().gte("minimum_stock", 0), "No se pudieron borrar los SKUs.");

    purchaseForm.reset();
    usageForm.reset();
    setTodayDefault(purchaseForm.elements.purchasedAt);
    setTodayDefault(usageForm.elements.usedAt);
    resetSkuForm();
    await refreshData();
    setConnectionMessage("Historial eliminado correctamente.", "success");
  } catch (error) {
    window.alert(error.message);
    setConnectionMessage(error.message, "error");
  }
}

async function handleCsvImport(event, importer) {
  if (!supabaseClient) {
    notifyMissingConfig();
    event.target.value = "";
    return;
  }

  const input = event.target;
  const [file] = input.files || [];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const importedCount = await importer(rows);
    await refreshData();
    resetSkuForm();
    window.alert(`Importación completada. Registros importados: ${importedCount}.`);
  } catch (error) {
    window.alert(error.message);
  } finally {
    input.value = "";
  }
}

async function importItemsFromCsv(rows) {
  const requiredHeaders = ["nombre", "categoria", "unidad", "stock_minimo"];
  validateHeaders(rows.headers, requiredHeaders);
  const nextSkuBase = getNextSkuNumber();

  const payload = rows.records.map((record, index) => {
    const name = getRequiredValue(record.nombre, "nombre", index);
    const category = getRequiredValue(record.categoria, "categoria", index);
    const unit = getRequiredValue(record.unidad, "unidad", index);
    const minimumStock = Number.parseInt(getRequiredValue(record.stock_minimo, "stock_minimo", index), 10);

    validateCategory(category, index);
    validateUnit(unit, index);
    if (Number.isNaN(minimumStock) || minimumStock < 0) {
      throw new Error(`Fila ${index + 2}: stock_minimo debe ser un numero mayor o igual a 0.`);
    }

    return {
      name,
      sku: String(nextSkuBase + index).padStart(4, "0"),
      category,
      unit,
      minimum_stock: minimumStock,
    };
  });

  if (!payload.length) {
    return 0;
  }

  await runQuery(
    supabaseClient.from(SUPABASE_TABLES.items).insert(payload),
    "No se pudieron importar los SKUs.",
  );

  return payload.length;
}

async function importPurchasesFromCsv(rows) {
  const requiredHeaders = ["sku", "cantidad", "fecha_compra", "proveedor", "costo_total"];
  validateHeaders(rows.headers, requiredHeaders);

  const payload = rows.records.map((record, index) => {
    const sku = getRequiredValue(record.sku, "sku", index);
    const quantity = Number.parseInt(getRequiredValue(record.cantidad, "cantidad", index), 10);
    const purchasedAt = getRequiredValue(record.fecha_compra, "fecha_compra", index);
    const supplier = String(record.proveedor || "").trim();
    const costValue = String(record.costo_total || "").trim();
    const item = state.items.find((catalogItem) => catalogItem.sku === sku);

    if (!item) {
      throw new Error(`Fila ${index + 2}: no existe el SKU ${sku}.`);
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      throw new Error(`Fila ${index + 2}: cantidad debe ser un numero mayor a 0.`);
    }

    validateDate(purchasedAt, "fecha_compra", index);

    const cost = costValue ? Number.parseFloat(costValue) : 0;
    if (Number.isNaN(cost) || cost < 0) {
      throw new Error(`Fila ${index + 2}: costo_total debe ser un numero mayor o igual a 0.`);
    }

    return {
      item_id: item.id,
      quantity,
      purchased_at: purchasedAt,
      supplier,
      cost,
    };
  });

  if (!payload.length) {
    return 0;
  }

  await runQuery(
    supabaseClient.from(SUPABASE_TABLES.purchases).insert(payload),
    "No se pudieron importar las compras.",
  );

  return payload.length;
}

async function importUsagesFromCsv(rows) {
  const requiredHeaders = ["sku", "cantidad", "fecha_salida", "nota"];
  validateHeaders(rows.headers, requiredHeaders);

  const stockByItem = Object.fromEntries(state.items.map((item) => [item.id, getStockForItem(item.id)]));

  const payload = rows.records.map((record, index) => {
    const sku = getRequiredValue(record.sku, "sku", index);
    const quantity = Number.parseInt(getRequiredValue(record.cantidad, "cantidad", index), 10);
    const usedAt = getRequiredValue(record.fecha_salida, "fecha_salida", index);
    const note = String(record.nota || "").trim();
    const item = state.items.find((catalogItem) => catalogItem.sku === sku);

    if (!item) {
      throw new Error(`Fila ${index + 2}: no existe el SKU ${sku}.`);
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      throw new Error(`Fila ${index + 2}: cantidad debe ser un numero mayor a 0.`);
    }

    validateDate(usedAt, "fecha_salida", index);

    if (quantity > stockByItem[item.id]) {
      throw new Error(`Fila ${index + 2}: la salida supera el stock disponible del SKU ${sku}.`);
    }

    stockByItem[item.id] -= quantity;

    return {
      item_id: item.id,
      quantity,
      used_at: usedAt,
      note,
    };
  });

  if (!payload.length) {
    return 0;
  }

  await runQuery(
    supabaseClient.from(SUPABASE_TABLES.usages).insert(payload),
    "No se pudieron importar las salidas.",
  );

  return payload.length;
}

function parseCsv(text) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalizedText) {
    throw new Error("El archivo está vacío.");
  }

  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if (char === "\n" && !insideQuotes) {
      currentRow.push(currentValue.trim());
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue.trim());
  rows.push(currentRow);

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.toLowerCase());
  const records = dataRows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) =>
      headers.reduce((record, header, index) => {
        record[header] = row[index] ?? "";
        return record;
      }, {}),
    );

  return { headers, records };
}

function validateHeaders(headers, requiredHeaders) {
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) {
      throw new Error(`El archivo debe incluir la columna ${header}.`);
    }
  });
}

function getRequiredValue(value, fieldName, index) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    throw new Error(`Fila ${index + 2}: ${fieldName} es obligatorio.`);
  }

  return normalizedValue;
}

function validateCategory(category, index) {
  const categories = ["Cafetería", "Insumos", "Materiales"];
  if (!categories.includes(category)) {
    throw new Error(`Fila ${index + 2}: categoria debe ser Cafetería, Insumos o Materiales.`);
  }
}

function validateUnit(unit, index) {
  const units = ["Kilogramo", "Litro", "Pieza"];
  if (!units.includes(unit)) {
    throw new Error(`Fila ${index + 2}: unidad debe ser Kilogramo, Litro o Pieza.`);
  }
}

function validateDate(value, fieldName, index) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fila ${index + 2}: ${fieldName} debe tener formato AAAA-MM-DD.`);
  }
}

function getDaysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffInMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffInMs / 86_400_000));
}

function syncAutoSku() {
  const editingId = skuForm.elements.itemId.value;
  if (editingId) {
    return;
  }

  skuForm.elements.sku.value = getNextSku();
}

function getNextSku() {
  return String(getNextSkuNumber()).padStart(4, "0");
}

function getNextSkuNumber() {
  const highestSku = state.items.reduce((highest, item) => {
    const numericPart = getSkuNumber(item.sku);
    if (Number.isNaN(numericPart)) {
      return highest;
    }

    return Math.max(highest, numericPart);
  }, 0);

  return highestSku + 1;
}

function getSkuNumber(sku) {
  return Number.parseInt(String(sku).replace(/\D/g, ""), 10);
}

function getItemsSortedBySku() {
  return [...state.items].sort((left, right) => getSkuNumber(left.sku) - getSkuNumber(right.sku));
}

function metricCard(value, label) {
  return `<article class="metric"><strong>${value}</strong><span>${label}</span></article>`;
}

function emptyRow(columns) {
  return `<tr><td colspan="${columns}" class="empty-cell">Todavía no hay datos.</td></tr>`;
}

function formatDate(dateText) {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateText}T00:00:00`));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

function formatUnit(unit) {
  const unitMap = {
    Kilogramo: "kg",
    Litro: "L",
    Pieza: "pz",
  };

  return unitMap[unit] || unit;
}

function setTodayDefault(input) {
  input.value = today();
}

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function createSupabaseClient() {
  const { url, anonKey } = supabaseConfig;
  if (!url || !anonKey || anonKey.includes("PEGA_AQUI")) {
    return null;
  }

  return window.supabase.createClient(url, anonKey);
}

function notifyMissingConfig() {
  setConnectionMessage("Falta configurar Supabase en supabase-config.js.", "error");
}

function setConnectionMessage(message, tone = "") {
  connectionStatus.textContent = message;
  connectionStatus.classList.remove("is-error", "is-success");

  if (tone === "error") {
    connectionStatus.classList.add("is-error");
  }

  if (tone === "success") {
    connectionStatus.classList.add("is-success");
  }
}

async function runQuery(query, fallbackMessage) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${fallbackMessage} ${error.message}`);
  }

  return data || [];
}

function applyViewMode(mode) {
  const isMobile = mode === "mobile";
  appShell.classList.toggle("mobile-preview", isMobile);
  desktopViewButton.classList.toggle("is-active", !isMobile);
  mobileViewButton.classList.toggle("is-active", isMobile);
}

function applyPageMode() {
  const params = new URLSearchParams(window.location.search);
  const currentPage = params.get("page") === "catalogo" ? "catalogo" : "operacion";

  pageSections.forEach((section) => {
    section.classList.toggle("is-hidden", section.dataset.page !== currentPage);
  });

  operationsPageLink.classList.toggle("is-active", currentPage === "operacion");
  catalogPageLink.classList.toggle("is-active", currentPage === "catalogo");
}
