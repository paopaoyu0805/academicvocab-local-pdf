# AcademicVocab 概念数据模型

## 1. 本文范围

本文定义未来数据库需要表达的数据、关系和约束，不创建数据库、SQL migration 或 Supabase 项目。

所有 ID 未来使用随机 UUID，所有时间使用 UTC。除明确的公开配置外，每张用户数据表都必须带 `user_id`，并通过 Row Level Security 限制为当前用户。

## 2. 通用原则

- PDF 文件和二进制内容永不进入数据库；
- 不保存手机或电脑上的本地绝对文件路径；
- 腾讯密钥、用户密码、会话令牌和设备凭据不得进入业务表；
- `user_id` 从已验证身份取得，不能相信客户端任意提交的值；
- 机器翻译与用户修订分开保存；
- 用户修订非空时优先显示，且不能被后台重译覆盖；
- 删除或停止复习不能抹去例句、来源和历史；
- 所有查重约束都必须包含 `user_id`，不能跨用户共享私人数据。

## 3. profiles

每个登录用户一条个人配置。

主要字段：

- `id`：与登录用户 ID 相同；
- `display_name`：可选显示名称；
- `preferred_language`：第一版固定为简体中文；
- `created_at`、`updated_at`。

约束：

- `id` 唯一；
- 用户只能读取和修改自己的 profile。

## 4. words

每个规范化单词一条记录。

主要字段：

- `id`、`user_id`；
- `original_word`：第一次保存时的原始词形；
- `normalized_word`：用于查重的小写规范化词形；
- `machine_definition_zh`：机器生成的中文释义，可为空；
- `user_definition_zh`：用户修订释义，可为空；
- `definition_translation_status`；
- `lifecycle_status`；
- `row_version`：用户编辑的乐观并发版本；
- `created_at`、`updated_at`。

`definition_translation_status` 允许：

- `not_requested`；
- `pending`；
- `completed`；
- `provider_error`；
- `quota_paused`。

`lifecycle_status` 允许：

- `active`：正常学习和复习；
- `paused`：暂不复习，但保留标记；
- `mastered`：不再复习，并等待安全移除插件标记；
- `archived`：保留数据但默认隐藏。

约束：

- `user_id + normalized_word` 唯一；
- 不把派生词、时态或复数自动强制合并；
- `review_states` 不再重复保存生命周期状态。

## 5. documents

保存论文来源元数据，不保存 PDF。

主要字段：

- `id`、`user_id`；
- `source_type`；
- `source_key`：同一来源的稳定标识；
- `title`：可为空；
- `file_name`：可为空；
- `zotero_library_id`：仅 Zotero 来源使用；
- `zotero_parent_item_key`：仅 Zotero 来源使用；
- `zotero_attachment_key`：仅 Zotero 来源使用；
- `created_at`、`updated_at`。

`source_type` 允许：

- `mobile_pdf`；
- `zotero_pdf`；
- `manual`。

`source_key` 规则：

- Zotero PDF 使用 `library_id + attachment_key`；
- 手机 PDF 优先在浏览器本地计算文件 SHA-256，只上传哈希和必要元数据；
- 无法计算哈希时使用本次导入生成的随机 UUID，不假装能够跨导入查重；
- 手动例句使用随机 UUID。

约束：

- `user_id + source_type + source_key` 唯一；
- 不保存 PDF、Base64、全文或本地绝对路径。

## 6. examples

每条真实例句和来源是一条 occurrence 记录。

主要字段：

- `id`、`user_id`、`word_id`；
- `document_id`：手动录入时可为空；
- `original_selected_text`；
- `sentence`：用户确认的英文例句；
- `normalized_sentence`：只用于查重；
- `machine_translation_zh`：机器例句翻译，可为空；
- `user_translation_zh`：用户修订翻译，可为空；
- `translation_status`；
- `page_index`：从 0 开始的内部页索引，可为空；
- `page_label`：用户看到的页码文字，可为空；
- `source_type`；
- `dedupe_key`；
- `created_at`、`updated_at`。

`dedupe_key` 由以下稳定内容生成哈希：

- `word_id`；
- 文档来源标识，手动例句使用固定占位；
- `page_index`，未知时使用固定占位；
- `normalized_sentence`。

约束：

- `user_id + dedupe_key` 唯一；
- 同一单词可以有多个不同例句；
- 同一句子在不同论文或不同页码出现时可以分别保留；
- 机器翻译不得覆盖 `user_translation_zh`。

## 7. tags 与 word_tags

`tags` 主要字段：

- `id`、`user_id`；
- `name`、`normalized_name`；
- `created_at`。

约束：

- `user_id + normalized_name` 唯一。

`word_tags` 主要字段：

- `user_id`、`word_id`、`tag_id`；
- `created_at`。

约束：

- `user_id + word_id + tag_id` 唯一；
- 外键对应的 word 和 tag 必须属于同一个用户。

## 8. review_states 与 review_events

`review_states` 每个单词最多一条，只保存当前调度状态：

- `user_id`、`word_id`；
- `next_review_at`；
- `interval_days`；
- `ease_value`；
- `consecutive_successes`；
- `last_reviewed_at`；
- `updated_at`。

约束：

- `user_id + word_id` 唯一；
- 不重复保存 `active`、`paused`、`mastered` 或 `archived`。

`review_events` 是不可覆盖的复习历史：

- `id`、`user_id`、`word_id`；
- `rating`；
- `reviewed_at`；
- `previous_interval_days`；
- `next_interval_days`；
- `client_request_id`；
- `created_at`。

约束：

- `user_id + client_request_id` 唯一，防止离线重试重复记一次复习。

## 9. translation_cache

只缓存已经允许发送的单词和单条例句。

主要字段：

- `id`、`user_id`；
- `provider`：第一版固定为 `tencent_tmt`；
- `source_language`：第一版固定为 `en`；
- `target_language`：第一版固定为 `zh`；
- `source_text_hash`；
- `source_text`；
- `translated_text`；
- `character_count`；
- `created_at`、`expires_at`。

约束：

- `user_id + provider + source_language + target_language + source_text_hash` 唯一；
- 哈希命中后还要核对源文本，防止极小概率哈希碰撞；
- 不跨用户共享缓存；
- 不缓存 PDF、全文、密钥或第三方原始错误。

具体的月度使用计数实现由数据库 migration 阶段确定，但必须由服务端原子更新，不能相信客户端计数。

## 10. zotero_markers

记录 AcademicVocab 创建的 Zotero 标记及云端状态。

主要字段：

- `id`、`user_id`、`word_id`、`example_id`；
- `library_id`；
- `parent_item_key`；
- `attachment_key`；
- `annotation_key`；
- `page_index`、`position_json`；
- `marker_color`；
- `marker_owner`；
- `marker_signature`；
- `marker_status`；
- `created_at`、`updated_at`、`removed_at`。

`marker_owner` 第一版只能是 `AcademicVocab`。

`marker_status` 允许：

- `active`；
- `remove_pending`；
- `removed`；
- `protected_modified`；
- `error`。

约束：

- `user_id + library_id + annotation_key` 唯一；
- 颜色、文字和位置不能代替 annotation key 与所有权账本；
- 云端记录不能单独证明删除权限，还必须匹配插件本地账本；
- `protected_modified` 不能自动删除。

## 11. sync_jobs

表示需要异步或重试的工作。

主要字段：

- `id`、`user_id`；
- `job_type`；
- `target_id`；
- `idempotency_key`；
- `status`；
- `attempt_count`；
- `next_attempt_at`；
- `lease_expires_at`；
- `last_error_code`；
- `created_at`、`updated_at`、`completed_at`。

第一版计划使用的 `job_type`：

- `translate_word`；
- `translate_example`；
- `remove_zotero_marker`。

`status` 允许：

- `pending`；
- `processing`；
- `completed`；
- `failed`；
- `quota_paused`。

约束：

- `user_id + idempotency_key` 唯一；
- job 只引用业务记录 ID，不保存 PDF、正文副本、密钥或访问令牌；
- processing 租约过期后可以安全恢复；
- 达到重试上限后进入 `failed`，不能无限请求外部服务。

## 12. device_pairings

未来用于将 Zotero 插件安全配对到用户账户。

主要字段：

- `id`、`user_id`；
- `pairing_code_hash`；
- `expires_at`；
- `consumed_at`；
- `revoked_at`；
- `device_id`、`device_name`；
- `created_at`、`last_seen_at`。

约束：

- 只保存配对码哈希，不保存原始配对码；
- 配对码短时有效且只能使用一次；
- 设备可以撤销；
- 设备凭据不写入数据库明文字段或日志。

## 13. 所有权与外键规则

- word、document、example、tag、review、marker、job 和 pairing 的 `user_id` 必须一致；
- 服务端写入关联记录时必须再次验证所有权；
- 删除用户账户时的具体保留和清理策略留到恢复与导出阶段；
- migration 必须为上述唯一约束、外键和检查条件提供数据库级保护，不能只依赖界面代码。
