# 如何安装 C++ 编译器

## 重要提示（必读）

如果你的操作系统符合 [VSCodeConfigHelper](https://vscch3.vercel.app) 工具的要求：
- 64 位 Windows 10 及更高版本，或
- 64 位 Intel 芯片的 Mac，或
- 64 位 Ubuntu 等 Debian 系的 Linux 发行版

则可直接使用 [VSCodeConfigHelper](https://vscch3.vercel.app) 来帮助你完成编译器的安装，顺带完成某个工作区文件夹的 VS Code 配置。

如果你的操作系统不符合上述要求，请继续阅读下文。

## Windows

首先你需要下载 MinGW。
- 64 位操作系统，请前往 https://gytx.lanzoui.com/iy906s48llc 下载
- 32 位操作系统，请前往 https://gytx.lanzoui.com/iAicTs48l8j 下载

下载完毕后你会得到一个 .7z 文件。你需要使用解压软件将其解压缩。如果你没有安装解压缩软件，我推荐：
- [7-Zip](https://www.7-zip.org/) 或
- [Bandizip](http://www.bandisoft.com/bandizip/)

解压缩完成后你将得到一个名为 mingw32 或 mingw64 的文件夹。请**将其妥善保存在电脑的某处（比如 'C:\mingw64'）**并不要再移动。

打开刚刚保存好的 MinGW 路径，打开其中的 `bin` 文件夹，复制其路径以备稍后使用：

![](https://z3.ax1x.com/2021/08/27/hMYsHg.png)

打开控制面板（可直接在开始菜单下搜索），定位到 系统和安全/系统 页面，然后打开侧边栏的“高级系统设置”：

![](https://z3.ax1x.com/2021/08/27/hMYcNj.png)

> 对于 Windows 10，系统和安全/系统 页面会重定向到设置界面。但这无妨，设置界面的下方同样有“高级系统设置”的按钮。

在“高级系统设置”中，打开“高级”标签页，然后点击“环境变量...”按钮：

![](https://z3.ax1x.com/2021/08/27/hMY6EQ.png)

在接下来的窗口中，在上方的表格中找到并选中 `Path` 项。如果没有，请添加一个。

![](https://z3.ax1x.com/2021/08/27/hMtyM6.png)

编辑按钮在低于 Windows 10 的系统下会打开如下界面。在“变量值”文本框的结尾**添加一个英文分号 `;`，然后再粘贴上刚刚复制的 `bin` 文件夹路径**。

![](https://z3.ax1x.com/2021/08/27/hMtrxx.png)

编辑完成后，一路点击确定即可。

> 对于 Windows 10 系统，编辑 `Path` 会弹出一个更易于编辑的表格窗口。此时只需在表格末尾添加 `bin` 文件夹路径即可，无需手动编辑文本。

**随后重新启动电脑**。

重新启动后，编译器已经安装完成。您可以在命令提示符（`cmd`）中输入 `g++ --version` 回车以测试编译器是否安装成功：

![](https://z3.ax1x.com/2021/08/27/hMNHpR.png)

## Mac

首先启动“终端”应用程序：
- 点按程序坞中的“启动台”图标 ![](https://help.apple.com/assets/5FDD15EE12A93C067904695E/5FDD15F412A93C0679046966/zh_CN/a1f94c9ca0de21571b88a8bf9aef36b8.png)，在搜索栏中键入“终端”，然后点按“终端”。
- 或者，在“访达” ![](https://help.apple.com/assets/5FDD15EE12A93C067904695E/5FDD15F412A93C0679046966/zh_CN/058e4af8e726290f491044219d2eee73.png) 中，打开“/应用程序/实用工具”文件夹，然后连按“终端”。

在终端中键入以下命令，随后按下回车：
```sh
xcode-select --install
```

如果系统询问密码，请如实提供。请耐心等待命令执行完成。完成后，编译器应当已经安装。键入 `g++ --version` 或 `clang++ --version` 来测试：

## GNU/Linux

如果你所使用的发行版拥有包管理器，请在终端模拟器中键入以下命令并回车来安装 `g++`：
- Debian/Ubuntu: `sudo apt-get install g++`
- Fedora/CentOS: `sudo dnf install g++`
- OpenSUSE: `sudo zypper install g++`
- Mandriva/Mageia: `sudo urpmi g++`
- Slackware: `sudo slackpkg install g++`
- Vector: `sudo slapt-get --install g++`
- Zenwalk: `sudo netpkg g++`
- Sabayon: `equo install g++`
- Arch: `sudo pacman -S g++`
- Solus: `sudo eopkg install g++`
- Alpine: `sudo apk add g++`
- Gentoo: `sudo emerge g++`
- Lunar: `sudo lin g++`
- Source Mage: `sudo cast g++`
- NixOS: `sudo nix-env -i g++`
- Void: `sudo xbps-install g++`

## FreeBSD

```sh
sudo pkg install g++
```

> 注：上述 Linux/BSD 命令来自 https://distrowatch.com/dwres.php?resource=package-management