var AcademicVocabSelectionPOC = {
  pluginID: "academicvocab-selection-poc@academicvocab.local",
  eventType: "renderTextSelectionPopup",
  registered: false,
  liveNodes: new Set(),
  nodeCleanups: new Map(),
  markerLedgerPref: "extensions.academicvocab-selection-poc.markerLedger.v1",
  markerOwner: "AcademicVocab",
  markerColor: "#8b5cf6",
  markerType: "underline",
  devProfilePrefix: "D:\\AcademicVocab\\zotero-dev\\profile",

  start() {
    if (this.registered) {
      return;
    }

    this.assertIsolatedDevelopmentProfile();

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
      button.title = "打开本地例句预览；只有明确确认后才会在隔离测试 PDF 创建测试高亮";
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
    let wordForm = AcademicVocabWordNormalizer.normalizeWordForm(
      selectedText,
      primaryCandidate.text
    );
    let metadata = await this.getAttachmentMetadata(reader, annotation);
    let markerContext = null;
    let markerContextError = null;
    try {
      markerContext = await this.getMarkerContext(reader, annotation);
    }
    catch (error) {
      Zotero.logError(error);
      markerContextError = "无法安全取得隔离测试标记所需的位置；不会创建高亮。";
    }

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
      "本地预览：候选不会保存、翻译或联网。只有下方明确确认的隔离测试按钮才会创建一条测试高亮。";
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
      `页面内匹配：${extraction.diagnostic.occurrenceCount}`,
      wordForm.ambiguous ? "原形存在歧义，需要确认" : "原形可作为拟录入主词"
    ].join("；");

    let lemmaField = this.createReadOnlyField(
      doc,
      "拟录入主词（原形）",
      this.formatWordForm(wordForm)
    );
    let lemmaControl = lemmaField.querySelector("input");
    lemmaControl.id = "academicvocab-lemma-preview";
    let surfaceField = this.createReadOnlyField(
      doc,
      "选中的原文词形",
      selectedText
    );
    surfaceField.querySelector("input").id = "academicvocab-surface-form-preview";
    let updateWordForm = sentence => {
      wordForm = AcademicVocabWordNormalizer.normalizeWordForm(selectedText, sentence);
      lemmaControl.value = this.formatWordForm(wordForm);
    };

    panel.append(title, notice);
    panel.append(
      surfaceField,
      lemmaField,
      sentenceField,
      this.createReadOnlyField(doc, "本地判断", assessment)
    );

    let chooser = this.createCandidateChooser(
      doc,
      extraction.candidates,
      sentenceControl,
      updateWordForm
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

    panel.append(
      this.createMarkerTestControls(doc, markerContext, markerContextError)
    );

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

  assertIsolatedDevelopmentProfile() {
    let profileDirectory = Services.dirsvc.get(
      "ProfD",
      Components.interfaces.nsIFile
    ).path;
    let normalizedProfile = profileDirectory.replace(/[\\/]+$/, "");
    if (!normalizedProfile.toLocaleLowerCase().startsWith(
      this.devProfilePrefix.toLocaleLowerCase()
    )) {
      throw new Error("AcademicVocab marker testing is restricted to the D-drive development profile");
    }
    return normalizedProfile;
  },

  loadMarkerLedger() {
    this.assertIsolatedDevelopmentProfile();
    let raw = Services.prefs.getStringPref(this.markerLedgerPref, "");
    if (!raw) {
      return AcademicVocabMarkerOwnership.newLedger();
    }
    let ledger;
    try {
      ledger = JSON.parse(raw);
    }
    catch (error) {
      throw new Error("AcademicVocab test marker ledger is unreadable; refusing marker changes");
    }
    if (
      !ledger
      || ledger.schemaVersion !== 1
      || ledger.markerOwner !== this.markerOwner
      || !ledger.records
      || typeof ledger.records !== "object"
    ) {
      throw new Error("AcademicVocab test marker ledger has an unexpected format; refusing marker changes");
    }
    return ledger;
  },

  saveMarkerLedger(ledger) {
    this.assertIsolatedDevelopmentProfile();
    if (
      !ledger
      || ledger.schemaVersion !== 1
      || ledger.markerOwner !== this.markerOwner
      || !ledger.records
    ) {
      throw new Error("Refusing to save an invalid AcademicVocab test marker ledger");
    }
    Services.prefs.setStringPref(
      this.markerLedgerPref,
      JSON.stringify(ledger)
    );
  },

  async sha256Hex(value) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      throw new Error("Web Crypto is unavailable; refusing marker ownership changes");
    }
    let input = new TextEncoder().encode(String(value));
    let digest = await globalThis.crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  },

  async getMarkerContext(reader, annotation) {
    this.assertIsolatedDevelopmentProfile();
    let attachment = reader && reader.itemID
      ? Zotero.Items.get(reader.itemID)
      : null;
    let position = AcademicVocabMarkerOwnership.parsePosition(
      annotation && annotation.position
    );
    let selectedText = this.normalizeText(annotation && annotation.text);
    if (
      !attachment
      || !attachment.isFileAttachment()
      || !attachment.libraryID
      || !attachment.key
      || !position
      || !Number.isInteger(position.pageIndex)
      || !selectedText
    ) {
      throw new Error("The current selection cannot be used for a safe test marker");
    }
    let parent = attachment.parentItemID
      ? Zotero.Items.get(attachment.parentItemID)
      : null;
    return {
      attachment,
      libraryID: attachment.libraryID,
      attachmentKey: attachment.key,
      parentItemKey: parent ? parent.key : "",
      pageIndex: position.pageIndex,
      pageLabel: String(position.pageIndex + 1),
      position,
      selectedText
    };
  },

  async getCaptureID(context) {
    let seed = AcademicVocabMarkerOwnership.makeCaptureSeed(context);
    return `stage3-${(await this.sha256Hex(seed)).slice(0, 32)}`;
  },

  getLedgerRecordForContext(ledger, context, captureID) {
    if (ledger.records[captureID]) {
      return ledger.records[captureID];
    }
    let legacyMatches = Object.values(ledger.records).filter(record =>
      AcademicVocabMarkerOwnership.matchesLegacyContextRecord(record, context)
    );
    // A coordinate-normalization migration is safe only when the ledger has
    // exactly one owned record for this attachment and selected position.
    return legacyMatches.length === 1 ? legacyMatches[0] : null;
  },

  makeMarkerSnapshot(
    context,
    annotationKey,
    color = this.markerColor,
    type = this.markerType
  ) {
    return {
      annotationKey,
      attachmentKey: context.attachmentKey,
      color,
      comment: "",
      libraryID: context.libraryID,
      pageLabel: context.pageLabel,
      position: AcademicVocabMarkerOwnership.cloneJSON(context.position),
      text: context.selectedText,
      type
    };
  },

  snapshotFromAnnotationItem(item) {
    if (!item || !item.isAnnotation() || !item.parentKey) {
      return null;
    }
    let position = AcademicVocabMarkerOwnership.parsePosition(
      item.annotationPosition
    );
    if (!position) {
      return null;
    }
    return {
      annotationKey: item.key,
      attachmentKey: item.parentKey,
      color: item.annotationColor || "",
      comment: item.annotationComment || "",
      libraryID: item.libraryID,
      pageLabel: item.annotationPageLabel || "",
      position,
      text: item.annotationText || "",
      type: item.annotationType || ""
    };
  },

  async signatureForSnapshot(snapshot) {
    return this.sha256Hex(
      AcademicVocabMarkerOwnership.canonicalJSONString(snapshot)
    );
  },

  findOverlappingAnnotation(attachment, targetPosition) {
    for (let annotation of attachment.getAnnotations(false)) {
      if (!annotation || !annotation.isAnnotation()) {
        continue;
      }
      if (AcademicVocabMarkerOwnership.positionsOverlap(
        targetPosition,
        annotation.annotationPosition
      )) {
        return annotation;
      }
    }
    return null;
  },

  getAnnotationByExactKey(record) {
    if (!record || !record.libraryID || !record.annotationKey) {
      return null;
    }
    return Zotero.Items.getByLibraryAndKey(
      record.libraryID,
      record.annotationKey
    );
  },

  async verifyOwnedTestMarker(ledger, record) {
    if (!record || record.markerOwner !== this.markerOwner) {
      return { code: "ledger_missing_or_unowned", record: null, item: null };
    }
    let item = this.getAnnotationByExactKey(record);
    if (!item) {
      if (record.status === "active") {
        record.status = "removed";
        record.updatedAt = new Date().toISOString();
        this.saveMarkerLedger(ledger);
      }
      return { code: "exact_marker_missing", record, item: null };
    }

    let snapshot = this.snapshotFromAnnotationItem(item);
    let signature = snapshot ? await this.signatureForSnapshot(snapshot) : "";
    let isExactMatch = Boolean(
      snapshot
      && record.libraryID === snapshot.libraryID
      && record.attachmentKey === snapshot.attachmentKey
      && record.annotationKey === snapshot.annotationKey
      && record.markerSignature === signature
    );
    if (!isExactMatch) {
      let expectedColorSnapshot = {
        ...snapshot,
        color: record.markerColor
      };
      let expectedColorSignature = snapshot
        ? await this.signatureForSnapshot(expectedColorSnapshot)
        : "";
      if (expectedColorSignature === record.markerSignature) {
        return { code: "color_changed", record, item };
      }
      let legacyExpectedColorSignature = snapshot
        ? await this.sha256Hex(
          AcademicVocabMarkerOwnership.legacyCanonicalJSONString({
            ...snapshot,
            color: record.markerColor,
            position: AcademicVocabMarkerOwnership.cloneJSON(record.position)
          })
        )
        : "";
      if (legacyExpectedColorSignature === record.markerSignature) {
        // This is a one-time compatibility migration for a record written
        // before Zotero coordinate normalization. Every non-color field has
        // still been checked by the legacy signature before it is migrated.
        record.markerSignature = expectedColorSignature;
        record.updatedAt = new Date().toISOString();
        this.saveMarkerLedger(ledger);
        return { code: "color_changed", record, item };
      }
      record.status = "protected_modified";
      record.updatedAt = new Date().toISOString();
      this.saveMarkerLedger(ledger);
      return { code: "protected_modified", record, item };
    }
    if (record.status === "removed") {
      return { code: "removal_refused", record, item };
    }
    if (record.status !== "active") {
      record.status = "active";
      record.updatedAt = new Date().toISOString();
      this.saveMarkerLedger(ledger);
    }
    return { code: "verified", record, item };
  },

  async verifyOrRestoreOwnedMarker(context) {
    let ledger = this.loadMarkerLedger();
    let captureID = await this.getCaptureID(context);
    let record = this.getLedgerRecordForContext(ledger, context, captureID);
    let verification = await this.verifyOwnedTestMarker(ledger, record);
    if (verification.code !== "color_changed") {
      return { ...verification, captureID };
    }
    verification.item.annotationColor = verification.record.markerColor;
    await verification.item.saveTx();
    let restored = await this.verifyOwnedTestMarker(ledger, verification.record);
    if (restored.code !== "verified") {
      return { ...restored, captureID };
    }
    return {
      code: "purple_restored",
      captureID,
      record: restored.record,
      item: restored.item
    };
  },

  async createOrResumeOwnedTestMarker(context) {
    let ledger = this.loadMarkerLedger();
    let captureID = await this.getCaptureID(context);
    let record = this.getLedgerRecordForContext(ledger, context, captureID);

    if (record) {
      let verification = await this.verifyOwnedTestMarker(ledger, record);
      if (verification.code === "verified") {
        return {
          code: "already_active",
          captureID,
          record: verification.record
        };
      }
      if (verification.code === "protected_modified") {
        return {
          code: "protected_modified",
          captureID,
          record: verification.record
        };
      }
      if (
        verification.code === "exact_marker_missing"
        && AcademicVocabMarkerOwnership.canRecreateRemovedRecord(record)
      ) {
        // The user explicitly pressed Create after a previously verified
        // plugin marker was deleted. Create a fresh exact key; never search
        // for or alter any other Zotero annotation.
        record.status = "intent";
        record.annotationKey = Zotero.DataObjectUtilities.generateKey();
        record.markerColor = this.markerColor;
        record.markerType = this.markerType;
        record.updatedAt = new Date().toISOString();
        this.saveMarkerLedger(ledger);
      }
      if (record.status !== "intent") {
        return {
          code: verification.code,
          captureID,
          record
        };
      }
    }

    let overlapsExistingAnnotation = Boolean(this.findOverlappingAnnotation(
      context.attachment,
      context.position
    ));

    let annotationKey = record ? record.annotationKey : Zotero.DataObjectUtilities.generateKey();
    let markerType = record && record.markerType
      ? record.markerType
      : this.markerType;
    let snapshot = this.makeMarkerSnapshot(
      context,
      annotationKey,
      this.markerColor,
      markerType
    );
    let signature = await this.signatureForSnapshot(snapshot);
    if (!record) {
      record = {
        id: captureID,
        markerOwner: this.markerOwner,
        status: "intent",
        wordID: "stage3-test-word",
        exampleID: "stage3-test-example",
        libraryID: context.libraryID,
        parentItemKey: context.parentItemKey,
        attachmentKey: context.attachmentKey,
        annotationKey,
        pageIndex: context.pageIndex,
        position: AcademicVocabMarkerOwnership.cloneJSON(context.position),
        markerColor: this.markerColor,
        markerType,
        markerSignature: signature,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      ledger.records[captureID] = record;
      this.saveMarkerLedger(ledger);
    }
    else if (record.status === "intent") {
      record.markerColor = this.markerColor;
      record.markerType = markerType;
      record.markerSignature = signature;
      record.position = AcademicVocabMarkerOwnership.cloneJSON(context.position);
      record.updatedAt = new Date().toISOString();
      delete record.lastError;
      this.saveMarkerLedger(ledger);
    }

    try {
      await Zotero.Annotations.saveFromJSON(context.attachment, {
        key: annotationKey,
        type: record.markerType || this.markerType,
        isExternal: false,
        text: context.selectedText,
        comment: "",
        color: record.markerColor,
        pageLabel: context.pageLabel,
        sortIndex: "00000|000000|00000",
        position: AcademicVocabMarkerOwnership.cloneJSON(context.position),
        tags: []
      });
    }
    catch (error) {
      record.updatedAt = new Date().toISOString();
      record.lastError = "annotation_create_failed";
      this.saveMarkerLedger(ledger);
      throw error;
    }

    let verification = await this.verifyOwnedTestMarker(ledger, record);
    if (verification.code !== "verified") {
      return { code: verification.code, captureID, record: verification.record };
    }
    delete record.lastError;
    this.saveMarkerLedger(ledger);
    return {
      code: "created",
      captureID,
      record,
      overlapsExistingAnnotation
    };
  },

  async removeOwnedTestMarker(context) {
    let ledger = this.loadMarkerLedger();
    let captureID = await this.getCaptureID(context);
    let record = this.getLedgerRecordForContext(ledger, context, captureID);
    if (!AcademicVocabMarkerOwnership.canRemoveRecord(record)) {
      return { code: "removal_refused", captureID, record: record || null };
    }
    let verification = await this.verifyOwnedTestMarker(ledger, record);
    if (verification.code === "exact_marker_missing") {
      return { code: "already_missing", captureID, record: verification.record };
    }
    if (verification.code !== "verified") {
      return { code: verification.code, captureID, record: verification.record };
    }
    await verification.item.eraseTx();
    record.status = "removed";
    record.updatedAt = new Date().toISOString();
    this.saveMarkerLedger(ledger);
    return { code: "removed", captureID, record };
  },

  markerResultMessage(result) {
    let messages = {
      created: "已创建一条隔离测试高亮，并已写入本地所有权账本。",
      already_active: "该精确选区已有已核验的 AcademicVocab 测试高亮；没有重复创建。",
      overlap_detected: "检测到选区与已有 Zotero 标注重叠；为保护人工标注，未创建测试高亮。",
      verified: "账本、附件 key、annotation key 和签名完全一致；该测试高亮可被安全处理。",
      protected_modified: "该测试高亮已被修改或无法精确核验；已受保护，拒绝删除。",
      color_changed: "该生词标记颜色已变化；将只恢复本插件已精确核验标记的紫色。",
      purple_restored: "已恢复这条已精确核验 AcademicVocab 生词标记的紫色；未修改任何其他 Zotero 标注。",
      exact_marker_missing: "账本中的精确测试高亮已不存在；没有搜索或处理其他标注。",
      already_missing: "精确测试高亮已不存在；按幂等规则完成，没有处理其他标注。",
      removed: "已按精确 annotation key 删除本插件创建且已核验的测试高亮。",
      removal_refused: "账本不存在、所有者不匹配或状态不允许；拒绝删除。",
      ledger_missing_or_unowned: "无法证明该标记属于 AcademicVocab；拒绝处理。"
    };
    return messages[result.code] || "测试标记操作未完成；没有处理其他标注。";
  },

  createMarkerTestControls(doc, context, contextError) {
    let section = doc.createElement("section");
    section.style.cssText = [
      "margin: 0 0 14px",
      "padding: 10px",
      "border: 1px solid #c7d2fe",
      "border-radius: 8px",
      "background: #eef2ff"
    ].join(";");
    let heading = doc.createElement("h3");
    heading.textContent = "阶段 3：隔离测试高亮";
    heading.style.cssText = "margin: 0 0 6px; font-size: 13px;";
    let explanation = doc.createElement("p");
    explanation.textContent =
      "仅用于 D 盘隔离开发资料库。生词标记固定为紫色；只恢复已精确核验的自有标记，绝不改动其他 Zotero 标注。";
    explanation.style.cssText = "margin: 0 0 8px; color: #3730a3; font-size: 12px; line-height: 1.45;";
    let status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.style.cssText = "margin: 0 0 8px; color: #3730a3; font-size: 12px; line-height: 1.45;";
    section.append(heading, explanation, status);

    if (!context) {
      status.textContent = contextError || "当前选区不能用于安全测试高亮。";
      section.append(this.createReadOnlyField(doc, "测试状态", status.textContent));
      return section;
    }

    let actions = doc.createElement("div");
    actions.style.cssText = "display: flex; flex-wrap: wrap; gap: 6px;";
    let createButton = this.createMarkerActionButton(
      doc,
      "创建测试高亮",
      "#4f46e5"
    );
    let verifyButton = this.createMarkerActionButton(
      doc,
      "核验所有权",
      "#475569"
    );
    let removeButton = this.createMarkerActionButton(
      doc,
      "删除已核验测试高亮",
      "#b91c1c"
    );
    actions.append(createButton, verifyButton, removeButton);
    section.append(actions);

    let setStatus = result => {
      status.textContent = this.markerResultMessage(result);
      status.style.color = ["created", "verified", "already_active", "removed", "already_missing"].includes(result.code)
        ? "#166534"
        : "#9a3412";
    };
    let setBusy = busy => {
      createButton.disabled = busy;
      verifyButton.disabled = busy;
      removeButton.disabled = busy;
    };
    let run = async action => {
      setBusy(true);
      try {
        setStatus(await action());
      }
      catch (error) {
        Zotero.logError(error);
        status.textContent = "操作失败；没有删除或处理其他标注。请保留当前状态并报告错误。";
        status.style.color = "#9a3412";
      }
      finally {
        setBusy(false);
      }
    };

    createButton.addEventListener("click", () => {
      if (!doc.defaultView.confirm(
        "只会在当前隔离开发资料库的测试 PDF 创建一条高亮，并写入插件账本。继续吗？"
      )) {
        return;
      }
      run(() => this.createOrResumeOwnedTestMarker(context));
    });
    verifyButton.addEventListener("click", () =>
      run(() => this.verifyOrRestoreOwnedMarker(context))
    );
    removeButton.addEventListener("click", () => {
      if (!doc.defaultView.confirm(
        "仅在账本、精确 annotation key 和签名全部一致时删除本插件创建的测试高亮。继续吗？"
      )) {
        return;
      }
      run(() => this.removeOwnedTestMarker(context));
    });
    status.textContent = "尚未创建测试高亮。";
    return section;
  },

  createMarkerActionButton(doc, text, background) {
    let button = doc.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.cssText = [
      "padding: 7px 9px",
      "border: 0",
      "border-radius: 6px",
      `background: ${background}`,
      "color: white",
      "font: 12px sans-serif",
      "cursor: pointer"
    ].join(";");
    return button;
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

  formatWordForm(wordForm) {
    if (!wordForm || !wordForm.lemma) return "（无法判断）";
    return wordForm.ambiguous
      ? `${wordForm.lemma}（另一个可能：${wordForm.alternatives.join("、")}）`
      : wordForm.lemma;
  },

  createCandidateChooser(doc, candidates, sentenceControl, onCandidateChange) {
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
        if (onCandidateChange) {
          onCandidateChange(candidate.text);
        }
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
  Services.scriptloader.loadSubScript(rootURI + "marker-ownership.js");
  Services.scriptloader.loadSubScript(rootURI + "word-normalizer.js");
  if (typeof AcademicVocabSentenceExtractor === "undefined") {
    throw new Error("AcademicVocab sentence extractor failed to load");
  }
  if (typeof AcademicVocabMarkerOwnership === "undefined") {
    throw new Error("AcademicVocab marker ownership module failed to load");
  }
  if (typeof AcademicVocabWordNormalizer === "undefined") {
    throw new Error("AcademicVocab word normalizer failed to load");
  }
  AcademicVocabSelectionPOC.start();
}

function shutdown() {
  AcademicVocabSelectionPOC.stop();
}

function install() {}

function uninstall() {}
