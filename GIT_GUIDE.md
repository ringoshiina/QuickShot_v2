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

## 第七步：使用分支开发多地块自动批量捕获功能（完整实战）

这是一个完整的实战教程，教你如何在不破坏当前工作版本的情况下，安全地开发 `autoCaptureLoop` 功能。

### 7.1 准备工作：保存当前稳定版本

```powershell
# 确保当前在主分支
git branch  # 查看当前分支，应该显示 * main 或 * master

# 如果还没有提交当前的修改，先提交
git status
git add .
git commit -m "稳定版本：添加全部方位角自动勾选和调试日志"

# 给这个稳定版本打个标签（方便以后回退）
git tag v1.0-stable
```

### 7.2 创建功能分支

```powershell
# 创建并切换到新分支 feature-auto-capture
git checkout -b feature-auto-capture

# 确认已经切换到新分支
git branch
# 应该显示：
#   main
# * feature-auto-capture
```

### 7.3 在新分支上开发功能

现在你可以安全地修改代码了！即使改坏了，主分支的稳定版本也不会受影响。

#### 步骤 1：添加多地块自动捕获功能

编辑 `sw.js`，添加以下功能：

**需要添加的核心函数：**
1. `autoCaptureLoop()` - 主循环函数
2. `captureImagesForCurrentParcel()` - 单个地块的图片捕获
3. `clickNextParcelButton()` - 点击"下一个地块"按钮
4. `clickNextButton()` - 点击"下一张图片"按钮
5. `checkIfLastImage()` - 检查是否是最后一张
6. `clickFirstThumbnail()` - 点击第一个缩略图

**每完成一个函数，就提交一次：**

```powershell
# 添加了 autoCaptureLoop 函数后
git add sw.js
git commit -m "添加 autoCaptureLoop 主循环函数"

# 添加了 captureImagesForCurrentParcel 函数后
git add sw.js
git commit -m "添加单个地块的图片捕获函数"

# 添加了导航按钮点击函数后
git add sw.js
git commit -m "添加图片和地块导航函数"
```

#### 步骤 2：添加启动和停止命令

```powershell
# 修改了 chrome.commands.onCommand 监听器后
git add sw.js
git commit -m "添加 Ctrl+Shift+A 启动自动捕获快捷键"
```

#### 步骤 3：测试功能

```powershell
# 在 Chrome 中重新加载扩展
# 测试功能是否正常工作
# 如果发现 bug，修复后提交

git add sw.js
git commit -m "修复：图片索引读取错误"
```

### 7.4 查看开发历史

```powershell
# 查看你在这个分支上的所有提交
git log --oneline

# 查看与主分支的差异
git diff main
```

### 7.5 测试通过后合并到主分支

#### 方案 A：功能完美，直接合并

```powershell
# 切换回主分支
git checkout main

# 合并功能分支
git merge feature-auto-capture

# 查看合并后的状态
git log --oneline --graph

# 删除功能分支（可选，因为已经合并了）
git branch -d feature-auto-capture
```

#### 方案 B：功能有问题，需要继续修改

```powershell
# 切换回功能分支继续修改
git checkout feature-auto-capture

# 修改代码...
git add sw.js
git commit -m "修复：stuck detection 逻辑优化"

# 测试通过后再合并
git checkout main
git merge feature-auto-capture
```

#### 方案 C：功能完全失败，放弃这个分支

```powershell
# 切换回主分支
git checkout main

# 强制删除功能分支（会丢失所有修改）
git branch -D feature-auto-capture

# 主分支的稳定版本完全不受影响！
```

### 7.6 回退到稳定版本（紧急情况）

如果合并后发现问题，想回到之前的稳定版本：

```powershell
# 方法 1：使用标签回退
git reset --hard v1.0-stable

# 方法 2：使用提交 ID 回退
git log --oneline  # 找到稳定版本的提交 ID
git reset --hard <提交ID>

# 方法 3：只回退某个文件
git checkout v1.0-stable -- sw.js
```

### 7.7 完整的开发流程示例

```powershell
# === 第一天：开始开发 ===
cd "C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1"

# 保存当前稳定版本
git add .
git commit -m "稳定版本：基础截图功能 + 全部方位角"
git tag v1.0-stable

# 创建功能分支
git checkout -b feature-auto-capture

# 开发...添加 autoCaptureLoop 函数
git add sw.js
git commit -m "添加 autoCaptureLoop 框架"

# === 第二天：继续开发 ===
# 开发...添加更多函数
git add sw.js
git commit -m "添加图片导航和地块切换逻辑"

# 测试发现 bug
git add sw.js
git commit -m "修复：图片索引读取问题"

# === 第三天：测试和合并 ===
# 测试通过！准备合并
git checkout main
git merge feature-auto-capture

# 给新版本打标签
git tag v2.0-auto-capture

# 删除功能分支
git branch -d feature-auto-capture

# 推送到 GitHub（如果有）
git push origin main --tags
```

### 7.8 常见问题处理

#### 问题 1：忘记创建分支，直接在 main 上修改了

```powershell
# 不要慌！创建分支并切换过去
git checkout -b feature-auto-capture

# 你的修改会自动带到新分支上
# main 分支会回到修改前的状态
```

#### 问题 2：想暂时切换到 main 分支，但当前有未提交的修改

```powershell
# 方法 1：先提交修改
git add .
git commit -m "WIP: 开发中，未完成"
git checkout main

# 方法 2：使用 stash 暂存修改
git stash
git checkout main
# 做其他事情...
git checkout feature-auto-capture
git stash pop  # 恢复之前的修改
```

#### 问题 3：合并时出现冲突

```powershell
# 合并时如果出现冲突
git merge feature-auto-capture
# 会提示：CONFLICT (content): Merge conflict in sw.js

# 打开 sw.js，找到类似这样的标记：
# <<<<<<< HEAD
# 主分支的代码
# =======
# 功能分支的代码
# >>>>>>> feature-auto-capture

# 手动编辑，保留需要的代码，删除标记
# 然后：
git add sw.js
git commit -m "解决合并冲突"
```

### 7.9 分支管理最佳实践

| 分支名称 | 用途 | 何时创建 | 何时删除 |
|---------|------|---------|---------|
| `main` | 稳定的主分支 | 初始化时 | 永不删除 |
| `feature-xxx` | 开发新功能 | 开始新功能前 | 合并后删除 |
| `fix-xxx` | 修复 bug | 发现 bug 时 | 修复并合并后删除 |
| `experiment-xxx` | 实验性功能 | 尝试新想法时 | 失败后直接删除 |

### 7.10 推荐的分支命名

```powershell
# 功能分支
git checkout -b feature-auto-capture        # 自动捕获功能
git checkout -b feature-batch-download      # 批量下载功能
git checkout -b feature-custom-naming       # 自定义命名规则

# Bug 修复分支
git checkout -b fix-index-reading          # 修复索引读取
git checkout -b fix-stuck-detection        # 修复卡住检测

# 实验分支
git checkout -b experiment-new-selector    # 实验新的选择器
git checkout -b experiment-performance     # 性能优化实验
```

---

**重要提示：**
- 养成频繁提交的习惯，每个小功能完成后就提交一次
- 提交信息要清晰描述你做了什么
- 在做重大修改前，先创建新分支进行测试
- 定期推送到 GitHub 或其他远程仓库进行备份
- **使用分支开发可以让你大胆尝试，不用担心破坏稳定版本！**
