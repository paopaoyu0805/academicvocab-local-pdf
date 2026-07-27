# Zotero 完全隔离开发环境使用说明

这套环境只用于测试，与日常 Zotero 的程序、profile 和数据目录全部分开。

## 隔离结构

- 日常 Zotero：`D:\zotero`
- 开发 Zotero 程序：`D:\AcademicVocab\tools\zotero-dev-runtime`
- 开发 profile：`D:\AcademicVocab\zotero-dev\profile`
- 开发数据：`D:\AcademicVocab\zotero-dev\data`
- 测试 PDF：`D:\AcademicVocab\zotero-dev\test-pdfs`
- 插件构建：`D:\AcademicVocab\zotero-dev\builds`

开发启动脚本不会调用日常 Zotero 的 `zotero.exe`。

## 第一次手动验证

### 1. 关闭日常使用的 Zotero

在日常 Zotero 中完成手头操作，然后选择“文件 → 退出”。等待几秒钟，确认 Zotero 已完全关闭。

如果任何 Zotero 进程仍在运行，开发启动脚本会拒绝继续。

### 2. 双击开发启动脚本

在文件资源管理器中进入：

`D:\AcademicVocab`

双击：

`start-zotero-dev.cmd`

脚本会先检查：

- 使用的是独立开发程序，不是日常 Zotero；
- 开发程序版本为 7.0.32；
- 程序数字签名和 SHA-256 哈希正确；
- `application.ini` 与 Mozilla 平台版本一致；
- profile、数据和临时目录都在 D 盘；
- 开发程序中没有符号链接或 junction；
- 日常 Zotero 没有正在运行；
- 开发 profile 已禁用自动更新。

任何检查失败时，脚本会停止并保留错误窗口，不会退回默认 profile，也不会启动日常 Zotero。

### 3. 确认当前是开发 profile

开发 Zotero 第一次打开时应像全新安装，文献库为空，也没有日常账户信息。

选择“帮助 → 关于 Zotero”，版本应为 7.0.32。

再查看：

`D:\AcademicVocab\zotero-dev\profile`

目录中应出现新建的 profile 文件，同时保留 `user.js`。如果窗口中出现日常文献或账户信息，请不要操作，立即退出并报告。

### 4. 进入 Zotero 设置

在 Windows 版 Zotero 顶部菜单选择“编辑 → 设置”。

英文界面对应 “Edit → Settings”。

### 5. 找到“文件和文件夹”

在设置窗口中选择“高级”，再选择“文件和文件夹”。

英文界面对应 “Advanced → Files and Folders”。

要修改的是“数据目录位置”，不是“链接附件基础目录”。

### 6. 设置独立数据目录

在“数据目录位置”中选择“自定义”，然后选择：

`D:\AcademicVocab\zotero-dev\data`

不要选择 `D:\zotero`，也不要复制日常数据。确认后，Zotero 会要求重启。

### 7. 重启开发 Zotero

让开发 Zotero 完全退出，再次双击：

`D:\AcademicVocab\start-zotero-dev.cmd`

不要使用桌面上的日常 Zotero 快捷方式完成这次重启。

### 8. 再次确认数据目录

重新进入“编辑 → 设置 → 高级 → 文件和文件夹”。

确认“数据目录位置”显示：

`D:\AcademicVocab\zotero-dev\data`

点击“显示数据目录”。资源管理器必须打开这个 D 盘目录。如果显示其他位置，请退出开发 Zotero，不要导入文件。

### 9. 导入测试 PDF

只使用一篇无隐私、丢失也没有影响的测试 PDF。先把它放入：

`D:\AcademicVocab\zotero-dev\test-pdfs`

再拖入开发 Zotero。不要导入真实私人论文，也不要复制日常资料库附件。

### 10. 不要登录正式账户

不要在开发环境登录正式 Zotero 账户，也不要开启同步。登录可能把真实文献、附件或删除操作带入测试环境。

### 11. 退出开发 Zotero

选择“文件 → 退出”，等待开发 Zotero 完全关闭。

### 12. 重新打开日常 Zotero

确认开发 Zotero 已完全退出后，再用桌面或开始菜单中的原快捷方式打开日常 Zotero。

不要同时运行日常 Zotero 和开发 Zotero。

### 13. 删除开发测试环境

先确认开发 Zotero 已完全退出。

如需删除全部开发环境，可把以下内容移入回收站：

- `D:\AcademicVocab\tools\zotero-dev-runtime`
- `D:\AcademicVocab\zotero-dev`
- `D:\AcademicVocab\start-zotero-dev.cmd`

这些路径不包含日常 Zotero。不要删除 `D:\zotero`。

## 与旧版指令 03 的关键区别

1. 旧版直接调用 `D:\zotero\zotero.exe`；新版使用完整独立副本。
2. 新版启动前校验版本、签名、哈希、应用配置和 Mozilla 平台。
3. 新版只在开发 profile 中禁用 Zotero 自动更新，避免开发副本发生混合版本更新。
4. 新版发现任何 Zotero 进程时都会停止，避免两个环境同时运行。
5. 新版校验失败时不会尝试默认 profile，也不会调用日常 Zotero。
6. 开发副本即使损坏，也可以重新解压，不影响 `D:\zotero` 和正式资料库。

## 重要安全提醒

- 不要登录正式 Zotero 账户。
- 不要导入真实私人论文。
- 不要把日常 Zotero 数据复制到开发目录。
- 不要直接修改任何 `zotero.sqlite` 文件。
- 如果看到日常资料或路径不是 D 盘，立即退出。

## 参考资料

- Zotero 官方建议开发时使用独立 profile 和数据目录：
  <https://www.zotero.org/support/dev/zotero_7_for_developers>
- Zotero 官方多 profile 说明：
  <https://www.zotero.org/support/kb/multiple_profiles>
- Zotero 官方数据目录说明：
  <https://www.zotero.org/support/zotero_data>
