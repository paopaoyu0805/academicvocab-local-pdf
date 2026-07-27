# 阶段 3：Zotero 标记所有权技术验证

## 1. 范围

本阶段只在以下隔离环境创建和删除测试高亮：

- 开发 profile：`D:\AcademicVocab\zotero-dev\profile`
- 开发数据目录：`D:\AcademicVocab\zotero-dev\data`
- 测试 PDF：`D:\AcademicVocab\zotero-dev\test-pdfs\sentence-extraction-cases.pdf`

不会访问日常 Zotero、正式资料库、Word、Magic、网络服务或任何私人 PDF。不会修改原始 PDF，也不会直接读写 Zotero SQLite。

## 2. 本地账本

技术验证账本仅保存于隔离开发 profile 的插件首选项。它不是云端数据，也不保存 PDF 全文。新测试标记为 Zotero 接受的小写亮紫色 `#8b5cf6` 下划线；颜色是生词的视觉提示，但永远不是判断所有权的依据。

每条测试记录包含：

- 稳定捕获 ID；
- 固定 `markerOwner = AcademicVocab`；
- 阶段 3 占位 `wordID` 和 `exampleID`；
- library、parent item、attachment 和 annotation 的精确 key；
- 页码、精确选区位置、颜色；
- 标记快照的 SHA-256 签名；
- `intent`、`active`、`protected_modified` 或 `removed` 状态。

创建前先写入 `intent` 和预先生成的 annotation key。若创建后 Zotero 意外退出，下一次只能用同一个精确 key 继续核验；不会扫描相似标注，也不会生成第二条标记。

## 3. 创建与删除安全规则

创建测试下划线前，插件只检查当前测试附件上的已有标注以记录重叠情况。即使选区与人工标注重叠，仍可新增独立的 AcademicVocab 下划线；绝不改色、覆盖、合并、拆分或删除既有人工标注。

删除前必须同时满足：

1. 本地账本记录存在，且 `markerOwner` 精确等于 `AcademicVocab`；
2. 状态为 `active`；
3. library、attachment 和 annotation key 全部一致；
4. 当前 Zotero 标注的类型、文字、颜色、页码、位置和批注签名与账本一致。

任一条件不满足时，删除被拒绝。若类型、文字、批注、页码或位置被用户修改，记录进入 `protected_modified`；若精确 key 已不存在，只记录“已不存在”，绝不寻找替代标注。

如果仅颜色发生变化，且附件、annotation key 和其余签名字段全部仍精确一致，插件只会把这条已验证属于 AcademicVocab 的生词标记恢复为紫色。它不会改动任何其他 Zotero 标注，即使对方使用相同颜色、文字或位置。

## 4. 自动测试

`tests\marker-ownership.test.cjs` 覆盖：

- 稳定签名输入；
- 不同选区不会共用捕获 ID；
- 同页矩形重叠检测；
- 非矩形位置只接受精确相等；
- 账本缺失、所有者错误、状态错误或 key 缺失时拒绝删除；
- 附件或签名不一致时拒绝删除；
- 空账本不会推断任何已有标注属于插件。

## 5. 人工验收步骤

仅在开发 Zotero 中进行：

1. 打开受控测试 PDF，选中一个未标注的英文单词；
2. 打开 `AcademicVocab 例句预览`，点击“创建测试高亮”，确认提示；
3. 确认 PDF 出现一条亮紫色测试下划线，且再次点击创建不会生成第二条；
4. 点击“核验所有权”，应显示账本、精确 key 和签名一致；
5. 重启开发 Zotero，重新选中相同位置并再次核验；
6. 手工修改该亮紫色测试下划线的颜色，再核验；应只恢复这条已验证生词标记的亮紫色；
7. 对另一处选区创建新的测试下划线；不要修改它；
8. 点击“删除已核验测试高亮”，确认只删除该条未修改的插件下划线；随后再次明确点击创建，应生成新的精确 annotation key；
9. 在测试 PDF 上手工创建一条 Zotero 高亮，再选中其中一个未标记单词并点击创建测试高亮；应创建独立下划线，人工高亮不变；
10. 尝试为含有紫色生词的一整句新建人工标注，记录 Zotero 对重叠标注的实际显示效果；插件不得改动该人工标注。
12. 退出并重启开发 Zotero，确认插件仍可使用。

自动清理时，用户修改过的受保护测试标记不会由插件删除。未来“已掌握／不再复习”的用户直接操作将另设明确确认，且只允许移除本地账本精确证明属于 AcademicVocab 的标记；不得用日常 Zotero 或私人 PDF 进行清理。

## 6. 本阶段不包含

- 正式生词、例句、复习记录或云端同步；
- 腾讯翻译、密钥或网络请求；
- 批量多选保存；
- 自动删除用户人工标注；
- 对扫描版 PDF、OCR 或任意复杂版式的标记保证。
