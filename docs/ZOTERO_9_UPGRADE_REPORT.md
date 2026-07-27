# Zotero 9 升级报告

升级日期：2026-07-27

## 最终结果

- 日常 Zotero：9.0.6，程序位于 `D:\ZoteroApp\9.0.6`。
- 正式数据目录保持为 `D:\zotero`，未移动、覆盖或直接修改数据库。
- 日常启动入口：个人桌面的“Zotero（日常使用）”。
- 开发 Zotero：9.0.6，程序位于 `D:\AcademicVocab\tools\zotero-dev-runtime-9.0.6`。
- 开发 profile：`D:\AcademicVocab\zotero-dev\profile`。
- 开发数据：`D:\AcademicVocab\zotero-dev\data`。
- Word 集成已更新为 Zotero 9.0.6 自带版本，并通过引文和参考文献表人工测试。
- 用户已分别确认日常资料库和开发空白资料库正常。

## 备份与校验

- 升级前备份：`D:\AcademicVocab\backups\zotero-before-9-upgrade-20260727-191752`。
- 日常目录备份：1013 个文件，253553154 字节。
- 正式 profile 备份：86 个文件，50844620 字节。
- 升级前数据库 SHA-256：`AD406396DEAE9A24F213030D2E7C2CD76CAF1F28DBD070BEE534CDB08C597749`。
- 备份数据库哈希与原件一致。
- 日常目录和 profile 的全部备份文件均按相对路径、大小和 SHA-256 逐一核对通过。

## 官方程序校验

- 官方 ZIP：`D:\AcademicVocab\downloads\Zotero-9.0.6_win-x64.zip`。
- ZIP SHA-256：`5101200AA900558D61ABD6D0B4D504C8FB5B0E9EDC9EE40F6D77BC21EC2EAC9E`。
- `zotero.exe` SHA-256：`422D4C88E952A4D40E877D1DBE5E28E902E94D402D6217642E17E9B08CD40E7D`。
- Windows Authenticode 签名有效。
- Zotero 官网当前下载按钮重定向到本次使用的 9.0.6 x64 ZIP。
- 官网更新日志写明 Mozilla 140.12.0，但当前官网签名 ZIP 的 `platform.ini` 实际标记为 140.10.0。本项目不自行替换官方组件，安全检查记录并验证官网实际发行包。

## 插件状态

Zotero 9 启动后，现有 11 个插件全部恢复为启用状态。

| 插件 ID | 已安装版本 | 登记更新清单结果 |
| --- | ---: | --- |
| `zoteroAddons@ytshen.com` | 9.0.2 | 最新稳定版 |
| `scipdf@ytshen.com` | 8.0.4 | 最新稳定版 |
| `zoterostyle@polygon.org` | 6.0.8 | 最新稳定版 |
| `zoterogpt@polygon.org` | 3.1.8 | 最新稳定版；未配置或使用 API |
| `zoteroreference@polygon.org` | 1.7.5 | 最新稳定版 |
| `zoterocitation@polygon.org` | 0.5.4 | 本机版本高于登记清单的 0.5.3，未降级 |
| `zoteropdftranslate@euclpts.com` | 2.4.5 | 最新稳定版 |
| `jasminum@linxzh.com` | 1.1.37 | 最新稳定版 |
| `Knowledge4Zotero@windingwind.com` | 3.2.6 | 最新稳定版 |
| `zoteromagic@zoterocn.com` | 2.6.7 | 最新稳定版 |
| `zotero-format-metadata@northword.cn` | 3.3.1 | 最新稳定版 |

## 启动规则

- 日常使用：先打开桌面的“Zotero（日常使用）”，再打开 Word。
- 开发测试：先关闭日常 Zotero 和 Word，再双击 `D:\AcademicVocab\start-zotero-dev.cmd`。
- 不同时运行日常版和开发版。
- Windows 公共桌面的旧“Zotero”图标仍指向 `D:\zotero\zotero.exe`。修改该公共快捷方式需要管理员权限，因此本阶段没有修改；不要再使用这个旧图标。
- 旧程序、旧开发运行时、升级前备份和下载包暂时保留，未提前清理回滚材料。
