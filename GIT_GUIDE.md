# Git 版本控制指南

本指南将教你如何使用 Git 来保存和管理你的代码版本。

## 第一步：初始化 Git 仓库（只需做一次）

在你的项目目录打开 PowerShell，运行：

```powershell
# 进入项目目录
cd "C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1"

# 初始化 Git 仓库
git init

# 配置你的名字和邮箱（只需做一次）
git config user.name "你的名字"
git config user.email "your.email@example.com"
```

## 第二步：保存当前版本

每次修改代码后，使用以下命令保存版本：

```powershell
# 查看哪些文件被修改了
git status

# 添加所有修改的文件到暂存区
git add .

# 或者只添加特定文件
git add sw.js

# 提交修改，并写上描述
git commit -m "描述你做了什么修改"
```

### 提交信息示例：
```powershell
git commit -m "添加了全部方位角自动勾选功能"
git commit -m "修复了图片索引读取bug"
git commit -m "优化了下一个地块按钮查找逻辑"
```

## 第三步：查看历史版本

```powershell
# 查看所有提交历史
git log

# 查看简洁的提交历史
git log --oneline

# 查看某个文件的修改历史
git log sw.js
```

## 第四步：恢复到之前的版本

```powershell
# 方法一：撤销工作区的修改（还没 add）
git checkout sw.js

# 方法二：撤销已经 add 的修改
git reset HEAD sw.js
git checkout sw.js

# 方法三：回退到某个历史提交
# 先用 git log --oneline 查看提交 ID
git checkout <提交ID> sw.js

# 方法四：彻底回退到某个版本（危险！会丢失之后的修改）
git reset --hard <提交ID>
```

## 第五步：创建分支进行实验性修改

建议在修改代码前创建新分支，这样不会影响主版本：

```powershell
# 创建并切换到新分支
git checkout -b feature-new-function

# 在新分支上修改代码...

# 提交修改
git add .
git commit -m "在新分支上测试新功能"

# 如果修改成功，切换回主分支并合并
git checkout main
git merge feature-new-function

# 如果修改失败，直接切换回主分支即可
git checkout main
```

## 第六步：推送到 GitHub（可选）

如果你想在 GitHub 上备份代码：

```powershell
# 在 GitHub 上创建一个新仓库后，运行：
git remote add origin https://github.com/你的用户名/QuickShot.git

# 第一次推送
git push -u origin main

# 之后每次推送
git push
```

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `git status` | 查看当前状态 |
| `git add .` | 添加所有修改 |
| `git commit -m "消息"` | 提交修改 |
| `git log --oneline` | 查看历史 |
| `git checkout <文件>` | 恢复文件 |
| `git diff` | 查看修改内容 |
| `git branch` | 查看所有分支 |
| `git checkout -b <名称>` | 创建新分支 |

## 推荐工作流程

### 每次开始修改前：
```powershell
git status  # 确保工作区干净
git checkout -b fix-something  # 创建新分支
```

### 修改代码后：
```powershell
git add .
git commit -m "描述修改内容"
```

### 测试成功后：
```powershell
git checkout main  # 切回主分支
git merge fix-something  # 合并修改
git branch -d fix-something  # 删除测试分支（可选）
```

### 测试失败后：
```powershell
git checkout main  # 直接切回主分支，丢弃测试分支的修改
```

---

**重要提示：**
- 养成频繁提交的习惯，每个小功能完成后就提交一次
- 提交信息要清晰描述你做了什么
- 在做重大修改前，先创建新分支进行测试
- 定期推送到 GitHub 或其他远程仓库进行备份
