# AcademicVocab 长期开发规则

1. 所有项目内容固定在 `D:\AcademicVocab`。
2. 不主动向 C 盘写入项目、依赖、缓存、测试数据和构建结果。
3. 所有 Node、npm、npx 和 Git 操作必须通过 D 盘包装脚本。
4. 安装依赖前必须运行 `tools\check-paths.ps1`。
5. 只使用免费软件、开源依赖和免费服务方案。
6. 不使用付费短信、付费 OCR、付费词典 API 或 OpenAI API。
7. 不使用 Docker、WSL、Android Studio、Xcode、Expo 或 React Native。
8. 不使用本地 Supabase。
9. 第一版不上传 PDF 到云端。
10. 不修改 Zotero 原始 PDF。
11. 不直接修改 Zotero SQLite 数据库。
12. 不删除、覆盖或改色用户人工创建的 Zotero 标注。
13. 每次只完成当前阶段。
14. 不得提前开发下一阶段。
15. 每阶段完成后运行路径检查、类型检查、lint、测试和构建。
16. 每阶段结束后更新 `docs\STATUS.md`。
17. 每阶段结束后创建 Git 提交。
18. 不读取 `node_modules`。
19. 不扫描整个 D 盘。
20. 不在回复中粘贴完整大文件。
21. token 或上下文接近不足时，停止新增功能，更新 `STATUS.md`，并提交当前安全状态。
22. 真实密钥、密码、访问令牌和私人 PDF 不得进入 Git。
23. 不得使用 Supabase `service_role` key 作为前端密钥。
24. Zotero 插件只能删除 `marker_owner` 明确属于 AcademicVocab 的标注。
25. “不再复习”不能删除生词、例句、来源和历史。
