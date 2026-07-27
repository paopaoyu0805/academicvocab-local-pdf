var AcademicVocabSelectionPOC = {
  pluginID: "academicvocab-selection-poc@academicvocab.local",
  eventType: "renderTextSelectionPopup",
  registered: false,
  liveNodes: new Set(),
  nodeCleanups: new Map(),

  start() {
    if (this.registered) {
      return;
    }

    Zotero.Reader.registerEventListener(
      this.eventType,
      (event) => this.onSelectionPopup(event),
      this.pluginID
    );
    this.registered = true;
    Zotero.debug("AcademicVocab Selection POC: offline selection listener started");
  },

  stop() {
    for (let node of Array.from(this.liveNodes)) {
      this.removeNode(node);
    }
    this.liveNodes.clear();
    this.nodeCleanups.clear();

    // Zotero removes listeners registered with pluginID during plugin shutdown.
    // Zotero 9.0.6's public unregister method is not used here because the
    // plugin-owned automatic cleanup is the safer lifecycle path.
    this.registered = false;
  },

  onSelectionPopup({ reader, doc, params, append }) {
    try {
      let annotation = params && params.annotation ? params.annotation : {};
      let selectedText = this.normalizeText(annotation.text || "");
      if (!selectedText) {
        return;
      }

      let oldButton = doc.getElementById("academicvocab-selection-poc-button");
      if (oldButton) {
        this.removeNode(oldButton);
      }

      let button = doc.createElement("button");
      button.id = "academicvocab-selection-poc-button";
      button.type = "button";
      button.textContent = "AcademicVocab 验证";
      button.title = "打开临时选词信息；不会保存、翻译或创建标注";
      button.style.cssText = [
        "margin: 4px",
        "padding: 6px 10px",
        "border: 1px solid #2563eb",
        "border-radius: 6px",
        "background: #eff6ff",
        "color: #1d4ed8",
        "font: 13px sans-serif",
        "cursor: pointer"
      ].join(";");

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.openTemporaryPanel({
          reader,
          doc,
          annotation,
          selectedText
        });
      });

      append(button);
      this.trackNode(button);
    }
    catch (error) {
      Zotero.logError(error);
    }
  },

  async openTemporaryPanel({ reader, doc, annotation, selectedText }) {
    let oldPanel = doc.getElementById("academicvocab-selection-poc-overlay");
    if (oldPanel) {
      this.removeNode(oldPanel);
    }

    let pageContext = await this.getLocalPageContext(reader, annotation);
    let extraction = AcademicVocabSentenceExtractor.extract({
      selectedText,
      previousPageText: pageContext.previousPageText,
      currentPageText: pageContext.currentPageText,
      nextPageText: pageContext.nextPageText
    });
    let primaryCandidate = extraction.candidates[0] || {
      text: selectedText,
      kind: "fragment",
      confidence: "low",
      reasons: ["no_candidate"]
    };
    let metadata = await this.getAttachmentMetadata(reader, annotation);

    let overlay = doc.createElement("div");
    overlay.id = "academicvocab-selection-poc-overlay";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "display: flex",
      "align-items: flex-start",
      "justify-content: flex-end",
      "padding: 16px",
      "background: transparent",
      "font-family: sans-serif",
      "pointer-events: none"
    ].join(";");

    let panel = doc.createElement("section");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "academicvocab-selection-poc-title");
    panel.style.cssText = [
      "box-sizing: border-box",
      "width: 400px",
      "min-width: 320px",
      "max-width: calc(100vw - 32px)",
      "min-height: 220px",
      "max-height: min(72vh, calc(100vh - 32px))",
      "overflow: auto",
      "padding: 14px",
      "border-radius: 12px",
      "border: 1px solid #cbd5e1",
      "background: white",
      "color: #172033",
      "box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28)",
      "pointer-events: auto"
    ].join(";");

    let title = doc.createElement("h2");
    title.id = "academicvocab-selection-poc-title";
    title.textContent = "AcademicVocab 例句预览";
    title.title = "按住这里可拖动弹窗";
    title.style.cssText = [
      "position: sticky",
      "top: -14px",
      "z-index: 2",
      "margin: -14px -14px 8px",
      "padding: 14px 14px 8px",
      "border-bottom: 1px solid #e2e8f0",
      "background: white",
      "font-size: 17px",
      "white-space: nowrap",
      "overflow: hidden",
      "text-overflow: ellipsis",
      "cursor: grab",
      "user-select: none",
      "touch-action: none"
    ].join(";");

    let notice = doc.createElement("p");
    notice.textContent =
      "本地预览：候选只在当前窗口中显示。关闭后不会保存、翻译、联网或创建标注。";
    notice.style.cssText = [
      "margin: 0 0 16px",
      "padding: 10px",
      "border-radius: 8px",
      "background: #ecfdf5",
      "color: #065f46",
      "font-size: 13px"
    ].join(";");

    let sentenceField = this.createField(
      doc,
      "候选英文例句或来源片段",
      primaryCandidate.text,
      true
    );
    let sentenceControl = sentenceField.querySelector("textarea");
    let confidenceLabels = { high: "高", medium: "中", low: "低" };
    let assessment = [
      `置信度：${confidenceLabels[primaryCandidate.confidence] || "低"}`,
      primaryCandidate.kind === "sentence" ? "类型：完整句候选" : "类型：来源片段",
      extraction.requiresConfirmation ? "需要确认" : "可直接确认",
      `页面内匹配：${extraction.diagnostic.occurrenceCount}`
    ].join("；");

    panel.append(title, notice);
    panel.append(
      this.createField(doc, "选中的词或短语", selectedText, false),
      sentenceField,
      this.createReadOnlyField(doc, "本地判断", assessment)
    );

    let chooser = this.createCandidateChooser(
      doc,
      extraction.candidates,
      sentenceControl
    );
    if (chooser) {
      panel.append(chooser);
    }

    let technicalDetails = doc.createElement("details");
    technicalDetails.style.cssText = [
      "margin: 0 0 12px",
      "padding: 8px",
      "border: 1px solid #e2e8f0",
      "border-radius: 6px",
      "background: #f8fafc"
    ].join(";");
    let technicalSummary = doc.createElement("summary");
    technicalSummary.textContent = "技术详情（文件、页码和选区位置）";
    technicalSummary.style.cssText =
      "cursor: pointer; font-size: 12px; font-weight: 600;";
    technicalDetails.append(
      technicalSummary,
      this.createReadOnlyField(doc, "文件名", metadata.fileName),
      this.createReadOnlyField(doc, "Attachment key", metadata.attachmentKey),
      this.createReadOnlyField(doc, "Parent item key", metadata.parentItemKey),
      this.createReadOnlyField(doc, "页码", metadata.pageDisplay),
      this.createReadOnlyField(doc, "选区位置（仅临时显示）", metadata.positionJSON, true)
    );
    panel.append(technicalDetails);

    let extractionNote = doc.createElement("p");
    if (pageContext.errorCode) {
      extractionNote.textContent =
        "未能读取本地 PDF 页面文本；当前只显示所选文字，不能作为完整例句自动确认。";
    }
    else if (primaryCandidate.kind === "fragment") {
      extractionNote.textContent =
        "没有检测到可靠的完整句。当前内容按“来源片段”显示，后续不会把整页文字当例句。";
    }
    else if (extraction.requiresConfirmation) {
      extractionNote.textContent =
        "检测到跨页、重复词或其他不确定情况。请点击候选项确认；这不是人工翻译。";
    }
    else {
      extractionNote.textContent =
        "已在本地得到高置信度完整句。请检查后关闭，本阶段不会保存。";
    }
    extractionNote.style.cssText =
      "margin: 8px 0 16px; color: #475569; font-size: 12px;";
    panel.append(extractionNote);

    let actions = doc.createElement("div");
    actions.style.cssText =
      "display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;";

    let closeButton = doc.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "关闭（不保存）";
    closeButton.style.cssText = [
      "padding: 8px 14px",
      "border: 0",
      "border-radius: 7px",
      "background: #2563eb",
      "color: white",
      "font-size: 14px",
      "cursor: pointer"
    ].join(";");
    closeButton.addEventListener("click", () => this.removeNode(overlay));
    actions.append(closeButton);
    panel.append(actions);
    overlay.append(panel);

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.removeNode(overlay);
      }
    });

    (doc.body || doc.documentElement).append(overlay);
    this.trackNode(overlay);
    let resizeControl = this.enablePanelResizing(doc, overlay, panel);
    this.enablePanelDragging(
      doc,
      overlay,
      panel,
      title,
      resizeControl.sync
    );
    this.keepPanelInsideViewport(
      doc,
      overlay,
      panel,
      resizeControl.sync
    );
    closeButton.focus();
  },

  enablePanelDragging(doc, overlay, panel, handle, syncResizeHandle) {
    let dragState = null;

    let movePanel = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      let overlayRect = overlay.getBoundingClientRect();
      let panelRect = panel.getBoundingClientRect();
      let minimumLeft = overlayRect.left + 8;
      let minimumTop = overlayRect.top + 8;
      let maximumLeft = Math.max(
        minimumLeft,
        overlayRect.right - panelRect.width - 8
      );
      let maximumTop = Math.max(
        minimumTop,
        overlayRect.bottom - panelRect.height - 8
      );
      let nextLeft = dragState.left + event.clientX - dragState.pointerX;
      let nextTop = dragState.top + event.clientY - dragState.pointerY;

      panel.style.left = `${Math.min(maximumLeft, Math.max(minimumLeft, nextLeft))}px`;
      panel.style.top = `${Math.min(maximumTop, Math.max(minimumTop, nextTop))}px`;
      syncResizeHandle();
    };

    let finishDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      dragState = null;
      handle.style.cursor = "grab";
      if (typeof handle.releasePointerCapture === "function") {
        try {
          handle.releasePointerCapture(event.pointerId);
        }
        catch (error) {
          Zotero.logError(error);
        }
      }
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      let panelRect = panel.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.left = `${panelRect.left}px`;
      panel.style.top = `${panelRect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.width = `${panelRect.width}px`;
      panel.style.margin = "0";
      syncResizeHandle();

      dragState = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: panelRect.left,
        top: panelRect.top
      };
      handle.style.cursor = "grabbing";
      if (typeof handle.setPointerCapture === "function") {
        handle.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });
    handle.addEventListener("pointermove", movePanel);
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  },

  enablePanelResizing(doc, overlay, panel) {
    let resizeState = null;
    let handle = doc.createElement("button");
    handle.type = "button";
    handle.setAttribute("aria-label", "调整 AcademicVocab 面板大小");
    handle.title = "拖动这里调整面板大小";
    handle.textContent = "↘";
    handle.style.cssText = [
      "position: fixed",
      "z-index: 2147483647",
      "box-sizing: border-box",
      "width: 22px",
      "height: 22px",
      "padding: 0",
      "border: 2px solid white",
      "border-radius: 6px",
      "background: #2563eb",
      "color: white",
      "font: 14px sans-serif",
      "line-height: 18px",
      "cursor: nwse-resize",
      "touch-action: none",
      "pointer-events: auto"
    ].join(";");
    overlay.append(handle);

    let sync = () => {
      if (!panel.isConnected) {
        return;
      }
      let panelRect = panel.getBoundingClientRect();
      handle.style.left = `${Math.max(0, panelRect.right - 18)}px`;
      handle.style.top = `${Math.max(0, panelRect.bottom - 18)}px`;
    };

    let resizePanel = (event) => {
      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }

      let overlayRect = overlay.getBoundingClientRect();
      let maximumWidth = Math.max(
        1,
        overlayRect.right - resizeState.left - 8
      );
      let maximumHeight = Math.max(
        1,
        overlayRect.bottom - resizeState.top - 8
      );
      let minimumWidth = Math.min(320, maximumWidth);
      let minimumHeight = Math.min(220, maximumHeight);
      let nextWidth = resizeState.width
        + event.clientX - resizeState.pointerX;
      let nextHeight = resizeState.height
        + event.clientY - resizeState.pointerY;

      panel.style.width =
        `${Math.min(maximumWidth, Math.max(minimumWidth, nextWidth))}px`;
      panel.style.height =
        `${Math.min(maximumHeight, Math.max(minimumHeight, nextHeight))}px`;
      sync();
    };

    let finishResize = (event) => {
      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }
      resizeState = null;
      if (typeof handle.releasePointerCapture === "function") {
        try {
          handle.releasePointerCapture(event.pointerId);
        }
        catch (error) {
          Zotero.logError(error);
        }
      }
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      let panelRect = panel.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.left = `${panelRect.left}px`;
      panel.style.top = `${panelRect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.width = `${panelRect.width}px`;
      panel.style.height = `${panelRect.height}px`;
      panel.style.margin = "0";

      resizeState = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: panelRect.left,
        top: panelRect.top,
        width: panelRect.width,
        height: panelRect.height
      };
      if (typeof handle.setPointerCapture === "function") {
        handle.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });
    handle.addEventListener("pointermove", resizePanel);
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    sync();

    return { sync };
  },

  keepPanelInsideViewport(doc, overlay, panel, syncResizeHandle) {
    let keepVisible = () => {
      if (!panel.isConnected) {
        return;
      }

      let overlayRect = overlay.getBoundingClientRect();
      let panelRect = panel.getBoundingClientRect();
      let maximumWidth = Math.max(1, overlayRect.width - 16);
      let maximumHeight = Math.max(1, overlayRect.height - 16);

      if (panelRect.width > maximumWidth) {
        panel.style.width = `${maximumWidth}px`;
      }
      if (panelRect.height > maximumHeight) {
        panel.style.height = `${maximumHeight}px`;
      }

      panelRect = panel.getBoundingClientRect();
      let minimumLeft = overlayRect.left + 8;
      let minimumTop = overlayRect.top + 8;
      let maximumLeft = Math.max(
        minimumLeft,
        overlayRect.right - panelRect.width - 8
      );
      let maximumTop = Math.max(
        minimumTop,
        overlayRect.bottom - panelRect.height - 8
      );
      let nextLeft = Math.min(
        maximumLeft,
        Math.max(minimumLeft, panelRect.left)
      );
      let nextTop = Math.min(
        maximumTop,
        Math.max(minimumTop, panelRect.top)
      );

      panel.style.position = "fixed";
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.margin = "0";
      syncResizeHandle();
    };

    let view = doc.defaultView;
    let resizeObserver = null;
    view.addEventListener("resize", keepVisible);
    if (typeof view.ResizeObserver === "function") {
      resizeObserver = new view.ResizeObserver(keepVisible);
      resizeObserver.observe(doc.documentElement);
    }
    this.addNodeCleanup(overlay, () => {
      view.removeEventListener("resize", keepVisible);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    });
    keepVisible();
  },

  createField(doc, labelText, value, multiline) {
    let wrapper = doc.createElement("label");
    wrapper.style.cssText =
      "display: block; margin: 0 0 12px; font-size: 13px; font-weight: 600;";

    let label = doc.createElement("span");
    label.textContent = labelText;
    label.style.cssText = "display: block; margin-bottom: 5px;";

    let control = doc.createElement(multiline ? "textarea" : "input");
    if (!multiline) {
      control.type = "text";
    }
    else {
      control.rows = 4;
    }
    control.value = value;
    control.style.cssText = [
      "box-sizing: border-box",
      "width: 100%",
      "padding: 8px",
      "border: 1px solid #cbd5e1",
      "border-radius: 6px",
      "background: white",
      "color: #172033",
      "font: 13px sans-serif"
    ].join(";");

    wrapper.append(label, control);
    return wrapper;
  },

  createReadOnlyField(doc, labelText, value, multiline = false) {
    let wrapper = this.createField(doc, labelText, value || "（无）", multiline);
    let control = wrapper.querySelector("input, textarea");
    control.readOnly = true;
    control.style.background = "#f8fafc";
    control.style.color = "#475569";
    return wrapper;
  },

  createCandidateChooser(doc, candidates, sentenceControl) {
    if (!Array.isArray(candidates) || !candidates.length) {
      return null;
    }

    let wrapper = doc.createElement("section");
    wrapper.style.cssText = "margin: 0 0 14px;";

    let heading = doc.createElement("h3");
    heading.textContent = candidates.length > 1
      ? "本地候选（点击切换）"
      : "本地候选";
    heading.style.cssText = "margin: 0 0 6px; font-size: 13px;";
    wrapper.append(heading);

    let confidenceLabels = { high: "高", medium: "中", low: "低" };
    candidates.forEach((candidate, index) => {
      let button = doc.createElement("button");
      button.type = "button";
      button.textContent = [
        `候选 ${index + 1}`,
        `置信度${confidenceLabels[candidate.confidence] || "低"}`,
        candidate.kind === "sentence" ? "完整句" : "来源片段",
        candidate.text
      ].join(" · ");
      button.style.cssText = [
        "box-sizing: border-box",
        "display: block",
        "width: 100%",
        "margin: 0 0 6px",
        "padding: 8px 10px",
        "border: 1px solid #cbd5e1",
        "border-radius: 6px",
        "background: #f8fafc",
        "color: #1e293b",
        "font: 12px sans-serif",
        "line-height: 1.4",
        "text-align: left",
        "white-space: normal",
        "cursor: pointer"
      ].join(";");
      button.addEventListener("click", () => {
        sentenceControl.value = candidate.text;
        sentenceControl.focus();
      });
      wrapper.append(button);
    });

    return wrapper;
  },
  async getAttachmentMetadata(reader, annotation) {
    let attachment = reader && reader.itemID
      ? Zotero.Items.get(reader.itemID)
      : null;
    let parent = attachment && attachment.parentItemID
      ? Zotero.Items.get(attachment.parentItemID)
      : null;
    let position = annotation && annotation.position
      ? annotation.position
      : {};
    let pageIndex = Number.isInteger(position.pageIndex)
      ? position.pageIndex
      : null;
    let fileName = "";

    if (attachment) {
      if (typeof attachment.getFilename === "function") {
        fileName = attachment.getFilename() || "";
      }
      if (!fileName && typeof attachment.getField === "function") {
        fileName = attachment.getField("title") || "";
      }
    }

    return {
      fileName: fileName || "（无法取得）",
      attachmentKey: attachment ? attachment.key : "（无法取得）",
      parentItemKey: parent ? parent.key : "（无父条目）",
      pageDisplay: pageIndex === null
        ? "（无法取得）"
        : `${pageIndex + 1}（内部索引 ${pageIndex}）`,
      positionJSON: this.safePositionJSON(position)
    };
  },

  async getLocalPageContext(reader, annotation) {
    let emptyContext = {
      previousPageText: "",
      currentPageText: "",
      nextPageText: "",
      loadedPageIndexes: [],
      errorCode: null
    };

    try {
      let pageIndex = annotation && annotation.position
        ? annotation.position.pageIndex
        : null;

      if (!Number.isInteger(pageIndex) || !reader || !reader.itemID) {
        return { ...emptyContext, errorCode: "missing_page_or_item" };
      }

      let requestedIndexes = [pageIndex - 1, pageIndex, pageIndex + 1]
        .filter(index => index >= 0);
      let result = await Zotero.PDFWorker.getFullText(
        reader.itemID,
        requestedIndexes,
        true
      );
      if (!result || typeof result.text !== "string") {
        return { ...emptyContext, errorCode: "empty_pdf_worker_result" };
      }

      let pageSegments = result.text.split("\f");
      let pages = new Map();
      for (
        let index = 0;
        index < pageSegments.length && index < requestedIndexes.length;
        index++
      ) {
        pages.set(requestedIndexes[index], pageSegments[index].slice(0, 20000));
      }

      return {
        previousPageText: pages.get(pageIndex - 1) || "",
        currentPageText: pages.get(pageIndex) || "",
        nextPageText: pages.get(pageIndex + 1) || "",
        loadedPageIndexes: Array.from(pages.keys()),
        errorCode: pages.has(pageIndex) ? null : "current_page_missing"
      };
    }
    catch (error) {
      Zotero.logError(error);
      return { ...emptyContext, errorCode: "pdf_worker_failed" };
    }
  },

  safePositionJSON(position) {
    try {
      return JSON.stringify(position, null, 2).slice(0, 8000);
    }
    catch (error) {
      Zotero.logError(error);
      return "（无法显示）";
    }
  },

  normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  },

  trackNode(node) {
    this.liveNodes.add(node);
  },

  addNodeCleanup(node, callback) {
    let callbacks = this.nodeCleanups.get(node) || [];
    callbacks.push(callback);
    this.nodeCleanups.set(node, callbacks);
  },

  removeNode(node) {
    try {
      let callbacks = this.nodeCleanups.get(node) || [];
      for (let callback of callbacks) {
        try {
          callback();
        }
        catch (error) {
          Zotero.logError(error);
        }
      }
      node.remove();
    }
    finally {
      this.nodeCleanups.delete(node);
      this.liveNodes.delete(node);
    }
  }
};

async function startup({ rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + "sentence-extractor.js");
  if (typeof AcademicVocabSentenceExtractor === "undefined") {
    throw new Error("AcademicVocab sentence extractor failed to load");
  }
  AcademicVocabSelectionPOC.start();
}

function shutdown() {
  AcademicVocabSelectionPOC.stop();
}

function install() {}

function uninstall() {}
