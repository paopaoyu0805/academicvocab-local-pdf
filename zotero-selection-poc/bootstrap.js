var AcademicVocabSelectionPOC = {
  pluginID: "academicvocab-selection-poc@academicvocab.local",
  eventType: "renderTextSelectionPopup",
  registered: false,
  liveNodes: new Set(),

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
    for (let node of this.liveNodes) {
      try {
        node.remove();
      }
      catch (error) {
        Zotero.logError(error);
      }
    }
    this.liveNodes.clear();

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
        oldButton.remove();
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
      oldPanel.remove();
    }

    let contextText = this.getLocalPageText(doc);
    let sentenceCandidate = this.extractSentenceCandidate(
      contextText,
      selectedText
    );
    let metadata = await this.getAttachmentMetadata(reader, annotation);

    let overlay = doc.createElement("div");
    overlay.id = "academicvocab-selection-poc-overlay";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "padding: 24px",
      "background: rgba(15, 23, 42, 0.45)",
      "font-family: sans-serif"
    ].join(";");

    let panel = doc.createElement("section");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "academicvocab-selection-poc-title");
    panel.style.cssText = [
      "box-sizing: border-box",
      "width: min(680px, 94vw)",
      "max-height: 88vh",
      "overflow: auto",
      "padding: 20px",
      "border-radius: 12px",
      "background: white",
      "color: #172033",
      "box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3)"
    ].join(";");

    let title = doc.createElement("h2");
    title.id = "academicvocab-selection-poc-title";
    title.textContent = "AcademicVocab 选词弹窗技术验证";
    title.style.cssText = "margin: 0 0 8px; font-size: 20px;";

    let notice = doc.createElement("p");
    notice.textContent =
      "临时预览：可以修改输入框来测试界面，但关闭后不会保存、翻译、联网或创建标注。";
    notice.style.cssText = [
      "margin: 0 0 16px",
      "padding: 10px",
      "border-radius: 8px",
      "background: #ecfdf5",
      "color: #065f46",
      "font-size: 13px"
    ].join(";");

    panel.append(title, notice);
    panel.append(
      this.createField(doc, "选中的词或短语", selectedText, false),
      this.createField(doc, "候选英文例句", sentenceCandidate, true),
      this.createReadOnlyField(doc, "文件名", metadata.fileName),
      this.createReadOnlyField(doc, "Attachment key", metadata.attachmentKey),
      this.createReadOnlyField(doc, "Parent item key", metadata.parentItemKey),
      this.createReadOnlyField(doc, "页码", metadata.pageDisplay),
      this.createReadOnlyField(doc, "选区位置（仅临时显示）", metadata.positionJSON, true)
    );

    let extractionNote = doc.createElement("p");
    extractionNote.textContent = contextText
      ? "候选例句来自当前页面的本地文本层。请检查它是否完整。"
      : "当前 PDF 文本层未提供上下文，候选例句暂时退回为当前选区；请把这项结果报告给 Codex。";
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

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.removeNode(overlay);
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.removeNode(overlay);
      }
    });

    (doc.body || doc.documentElement).append(overlay);
    this.trackNode(overlay);
    closeButton.focus();
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

  getLocalPageText(doc) {
    try {
      let selection = typeof doc.getSelection === "function"
        ? doc.getSelection()
        : null;
      let node = selection && selection.anchorNode
        ? selection.anchorNode
        : null;
      let element = node && node.nodeType === 1
        ? node
        : node && node.parentElement
          ? node.parentElement
          : null;
      let textLayer = element && typeof element.closest === "function"
        ? element.closest(".textLayer")
        : null;

      if (!textLayer && element && typeof element.closest === "function") {
        let page = element.closest(".page, [data-page-index]");
        textLayer = page && typeof page.querySelector === "function"
          ? page.querySelector(".textLayer")
          : null;
      }

      let text = textLayer ? textLayer.textContent || "" : "";
      return this.normalizeText(text).slice(0, 20000);
    }
    catch (error) {
      Zotero.logError(error);
      return "";
    }
  },

  extractSentenceCandidate(contextText, selectedText) {
    let selected = this.normalizeText(selectedText);
    let context = this.normalizeText(contextText);
    if (!context || !selected) {
      return selected;
    }

    let index = context.toLocaleLowerCase().indexOf(
      selected.toLocaleLowerCase()
    );
    if (index < 0) {
      return selected;
    }

    let start = index;
    while (start > 0 && !/[.!?。！？]/.test(context[start - 1])) {
      start--;
    }

    let end = index + selected.length;
    while (end < context.length && !/[.!?。！？]/.test(context[end])) {
      end++;
    }
    if (end < context.length) {
      end++;
    }

    let sentence = context.slice(start, end).trim();
    return sentence && sentence.length <= 1000 ? sentence : selected;
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

  removeNode(node) {
    try {
      node.remove();
    }
    finally {
      this.liveNodes.delete(node);
    }
  }
};

async function startup() {
  AcademicVocabSelectionPOC.start();
}

function shutdown() {
  AcademicVocabSelectionPOC.stop();
}

function install() {}

function uninstall() {}
