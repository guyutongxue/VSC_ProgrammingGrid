import { getDescription, getSolution, ProblemDescription, submitCode } from "./fetch";
import { IProblemInfo } from "./problemProvider";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getStatusInfo } from "./config";
import { replaceGccDiagnostics } from "gcc-translation";
import { clozeMap } from "./cloze";

let storageDir: vscode.Uri;
let extensionDir: vscode.Uri;
export function getEditorCppPath() {
    return vscode.Uri.joinPath(storageDir, "editor.cpp").fsPath;
}
export function getEditorExecutablePath() {
    if (os.platform() === "win32") {
        return vscode.Uri.joinPath(storageDir, "editor.exe").fsPath;
    } else {
        return vscode.Uri.joinPath(storageDir, "editor").fsPath;
    }
}
function getBooststrapCss() {
    return vscode.Uri.joinPath(extensionDir, "node_modules/bootstrap/dist/css/bootstrap.css");
}
function getCodiconCss() {
    return vscode.Uri.joinPath(extensionDir, "node_modules/@vscode/codicons/dist/codicon.css");
}

export function setDirectories(context: vscode.ExtensionContext) {
    storageDir = context.globalStorageUri;
    extensionDir = context.extensionUri;
    vscode.commands.executeCommand(
        "setContext",
        "programming-grid.editorFile",
        [
            getEditorCppPath()
        ]);
}

function createFile(filepath: string, content: string = "") {
    if (!fs.existsSync(filepath)) {
        fs.mkdirSync(path.dirname(filepath), {
            recursive: true
        });
    }
    fs.writeFileSync(filepath, content);
}

const setContent = createFile;
function getContent(filepath: string) {
    if (!fs.existsSync(filepath)) {
        return "";
    }
    return fs.readFileSync(filepath, "utf-8");
}

export class EditorController implements vscode.Disposable {

    private _webPanel: vscode.WebviewPanel | null = null;
    private _textDoc: vscode.TextDocument | null = null;

    private _currentProblem: IProblemInfo | null = null;
    private _currentProblemDescription: ProblemDescription | null = null;

    private readonly _editorCppPath: string;
    private readonly _inputTxtPath: string;

    private readonly _editorListeners: vscode.Disposable[];

    constructor() {
        this._editorCppPath = getEditorCppPath();
        this._inputTxtPath = vscode.Uri.joinPath(storageDir, "input.txt").fsPath;
        this._editorListeners = [
            // No usage due to https://github.com/microsoft/vscode/issues/15178
            // `onDidCloseTextDocument` won't be fired immediately
            vscode.workspace.onDidCloseTextDocument(doc => {
                if (this._textDoc === doc) {
                    this._textDoc = null;
                }
            }),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (this._textDoc === doc) {
                    this._saveEditorContent();
                }
            })
        ];
    }

    private get _solutionStoragePath() {
        if (this._currentProblem === null) return this._editorCppPath;
        return vscode.Uri.joinPath(storageDir, "solutions", this._currentProblem.id + ".cpp").fsPath;
    }

    private _getProblemHtml(): string {
        const desc = this._currentProblemDescription;
        if (this._webPanel === null || desc === null) return "";
        // const secs = desc.sections.map(sec => {
        //     if (["来源", "例子输入", "例子输出"].includes(sec.title)) return "";
        //     return `<h5><strong>${sec.title}</strong></h5><p>${sec.content}</p>`;
        // }).join("\n");

        const description = desc.description ? `<h5 class="fw-bold">描述</h5><p>${desc.description}</p>` : "";
        const aboutInput = desc.aboutInput ? `<h5 class="fw-bold">关于输入</h5><p>${desc.aboutInput}</p>` : "";
        const aboutOutput = desc.aboutOutput ? `<h5 class="fw-bold">关于输出</h5><p>${desc.aboutOutput}</p>` : "";
        const hint = desc.hint ? `<h5 class="fw-bold">提示</h5><p>${desc.hint}</p>` : "";
        const wv = this._webPanel.webview;
        return `<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${wv.asWebviewUri(getBooststrapCss())}" rel="stylesheet">
    <link rel="stylesheet" href="${wv.asWebviewUri(getCodiconCss())}">
    <title>编程网格</title>
    <style>
        :root {
            --status-color: 82, 196, 26;
            /* Pure black cause too high contrast */
            --dark-bg-color: #101010
        }

        .dark {
            color: white;
        }

        body.dark {
            background-color: var(--dark-bg-color);
        }

        #mainHeader {
            background-color: white;
        }

        .dark .modal-content,
        .dark #mainHeader {
            background-color: var(--dark-bg-color);
        }
        
        .dark .btn-close {
            color: white;
            background: transparent url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxNiAxNicgZmlsbD0nI2ZmZic+PHBhdGggZD0nTS4yOTMuMjkzYTEgMSAwIDAxMS40MTQgMEw4IDYuNTg2IDE0LjI5My4yOTNhMSAxIDAgMTExLjQxNCAxLjQxNEw5LjQxNCA4bDYuMjkzIDYuMjkzYTEgMSAwIDAxLTEuNDE0IDEuNDE0TDggOS40MTRsLTYuMjkzIDYuMjkzYTEgMSAwIDAxLTEuNDE0LTEuNDE0TDYuNTg2IDggLjI5MyAxLjcwN2ExIDEgMCAwMTAtMS40MTR6Jy8+PC9zdmc+) center/1em auto no-repeat;
        }

        pre {
            background-color: var(--bs-light);
            padding: 1rem 1.5rem;
        }

        .dark pre {
            background-color: var(--bs-dark);
        }

        .dark .dropdown-menu {
            background-color: black;
            color: #dedad6;
            border: 1px solid rgba(255,255,255,.15);
        }

        .dark .dropdown-item {
            color: #dedad6;
        }

        .dark .dropdown-item:focus,
        .dark .dropdown-item:hover {
            color: #e1deda;
            background-color: #161310;
        }

        .dark .dropdown-item:active {
            color: white;
            background-color: #0d6efd;
        }

        .status-block {
            background-color: rgb(var(--status-color));
            color: white;
            font-size: 24px;
            height: 100px;
            width: 100px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .status-block-note {
            font-size: 11px;
        }

        .status-text {
            background-color: rgba(var(--status-color), 0.2);
            position: relative;
        }

        #chineseStamp {
            box-shadow: 0 0 0 3px rgb(var(--status-color)), 0 0 0 2px rgb(var(--status-color)) inset;
            border: solid 2px transparent;
            border-radius: .2em;
            color: rgb(var(--status-color));
            font-size: 30px;
            font-weight: bold;
            line-height: 1;
            opacity: 0;
            position: absolute;
            padding: .15em .5em;
            margin: 0 auto;
            bottom: 0;
            right: 10%;
            transform-origin: 50% 50%;
            transform: rotate(-15deg) translateY(25%);
            z-index: 2;
            opacity: .75;
        }

        .highin,
        .highout,
        .highstd {
            display: inline-block;
            border-radius: 4px;
        }

        .highin {
            background-color: #ffa;
        }

        .dark .highin {
            background-color: #777752;
        }

        .highout {
            background-color: bisque;
        }

        .dark .highout {
            background-color: #776b5d;
        }

        .highstd {
            background-color: #eef;
        }

        .dark .highstd {
            background-color: #707077;
        }

        .diag-warning {
            color: #fd7e14;
            /* instead of text-warning */
        }

        .diag-range1 {
            color: #20c997
        }

        .diag-range2 {
            color: #0dcaf0
        }

        .codicon {
            transform: translateY(1.5px);
        }

        /* Add Chinese sans-serif */
        #compileInfoDetails {
            font-family: "Sarasa Fixed SC", "等距更纱黑体 SC", "Sarasa Term SC", Inconsolata, Consolas, Menlo, Monaco, "Andale Mono WT", "Andale Mono", "Lucida Console", "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Courier New", Courier, "Microsoft YaHei", 微软雅黑, "MicrosoftJhengHei", 华文细黑, STHeiti, MingLiu, "SimHei", monospace;
        }
    </style>
</head>

<body>
    <article class="container-md">
        <header id="mainHeader"
            class="p-3 pb-2 sticky-top border-bottom border-3 d-flex flex-direction-row justify-content-between align-items-center">
            <h1 class="text-break">${desc.title}</h1>
            <div class="btn-group mb-1 flex-shrink-0">
                <button class="btn btn-light" title="本地运行代码" onclick="p('run')">
                    <i class="codicon codicon-play"></i>
                    本地
                </button>
                <button class="btn btn-success" title="提交代码到编程网格" onclick="p('submit')">
                    <i class="codicon codicon-run-above"></i>
                    提交
                </button>
            </div>
        </header>
        <main class="mx-3">
            <p></p>
            ${description}
            ${aboutInput}
            ${aboutOutput}
            ${hint}
            <h5 class="fw-bold">
                样例输入&nbsp;
                <div class="btn-group">
                    <button class="btn btn-sm btn-light" title="复制" onclick="p('copy_input')">
                        <i class="codicon codicon-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-light" title="使用样例输入运行本地代码" onclick="p('run_with_input')">
                        <i class="codicon codicon-play"></i>
                    </button>
                </div>
            </h5>
            <pre class="highlight"><code>${desc.input}</code></pre>
            <h5 class="fw-bold">
                样例输出&nbsp;
                <button class="btn btn-sm btn-light" title="复制" onclick="p('copy_output')">
                    <i class="codicon codicon-copy"></i>
                </button>
            </h5>
            <pre><code>${desc.output}</code></pre>
        </main>
        <footer class="mx-3 mb-3 d-flex flex-direction-row justify-content-between align-items-center">
            <small class="text-muted">本页面由“编程网格” VS Code 扩展提供</small>
            <div class="dropup flex-shrink-0">
                <button type="button" class="btn btn-small btn-light dropdown-toggle" data-bs-toggle="dropdown">
                    更多选项
                </button>
                <ul class="dropdown-menu">
                    <li><span class="dropdown-item" onclick="p('origin')">
                            <i class="codicon codicon-browser"></i>
                            打开原网页
                        </span></li>
                    <li><span class="dropdown-item" onclick="p('history')">
                            <i class="codicon codicon-history"></i>
                            提交历史
                        </span></li>
                    <li><span class="dropdown-item" onclick="p('open_editor')">
                            <i class="codicon codicon-edit"></i>
                            显示编辑器
                        </span></li>
                </ul>
            </div>
        </footer>
    </article>
    <div id="solutionModal" class="modal" tabindex="-1">
        <div class="modal-dialog modal-fullscreen modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 class="my-1">提交结果</h4>
                    <button class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="d-flex flex-row align-items-stretch pb-3">
                        <div class="status-block">
                            <span id="statusAbbr"></span>
                            <div class="status-block-note" id="performanceInfo"></div>
                        </div>
                        <div class="status-text flex-grow-1 d-flex flex-column justify-content-center">
                            <div class="display-4 text-center fw-light" id="statusTitle"></div>
                            <div id="chineseStamp" class="d-none d-sm-block"></div>
                        </div>
                    </div>
                    <h5 class="fw-bold">提示</h5>
                    <pre><code id="solutionDetails"></code></pre>
                </div>
            </div>
        </div>
    </div>
    <div id="compileErrorModal" class="modal" tabindex="-1">
        <div class="modal-dialog modal-fullscreen modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 class="my-1">本地运行</h4>
                    <button class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="d-flex flex-row justify-content-between mb-1">
                        <h5 class="fw-bold">
                            编译器诊断信息
                        </h5>
                        <div class="form-check translation-ui">
                            <input class="form-check-input" type="checkbox" id="translationCheck"
                                onchange="translateDetails()">
                            <label class="form-check-label" for="translationCheck">
                                翻译为中文
                            </label>
                        </div>
                    </div>
                    <pre><code id="compileInfoDetails"></code></pre>
                    <div class="translation-ui text-end blockquote-footer">翻译由 <a href="javascript:void 0" onclick="p('browser', 'https://github.com/Guyutongxue/gcc-translation')" >gcc-translation</a> 项目提供</div>
                    <div class="alert alert-info d-none" id="compileInfoHint"></div>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const themeAttr = document.body.attributes.getNamedItem('data-vscode-theme-kind');
        if (themeAttr != null) {
            if (themeAttr.value !== "vscode-light") {
                document.body.classList.add("dark");
                document.querySelectorAll(".btn-light").forEach(function (e) {
                    e.classList.remove("btn-light");
                    e.classList.add("btn-dark");
                });
            }
        }
        const solutionModal = new bootstrap.Modal(document.querySelector('#solutionModal'), { keyboard: false });
        const compileErrorModal = new bootstrap.Modal(document.querySelector('#compileErrorModal'), { keyboard: false });
        // compileErrorModal.show();
        const vscode = acquireVsCodeApi();
        function p(cmd, ...args) {
            vscode.postMessage({
                command: cmd,
                args: args
            });
        }
        let translated = false;
        let translationText = ['', ''];
        function translateDetails() {
            translated ^= true;
            document.querySelector('#compileInfoDetails').innerHTML = translationText[translated ? 1 : 0];
        }
        const last10Keys = [null, null, null, null, null, null, null, null, null, null];
        Array.prototype.equals = function (array) {
            return this.length == array.length &&
                this.every(function (this_i, i) { return this_i == array[i] })
        }
        document.onkeydown = function (/** @type {KeyboardEvent} */ ev) {
            last10Keys.push(ev.keyCode);
            last10Keys.shift();
            if (last10Keys.equals([38, 38, 40, 40, 37, 39, 37, 39, 66, 65])) {
                p('answer');
            }
            console.log(last10Keys);
        }
        window.addEventListener('message', e => {
            const message = e.data;
            switch (message.command) {
                case 'showSolution':
                    const solution = message.args[0];
                    document.documentElement.style.setProperty('--status-color', solution.color);
                    document.querySelector('#chineseStamp').innerHTML = solution.chinese;
                    document.querySelector('#statusAbbr').innerHTML = solution.abbr;
                    document.querySelector('#statusTitle').innerHTML = solution.title;
                    document.querySelector('#solutionDetails').innerHTML = solution.details;
                    document.querySelector('#performanceInfo').innerHTML = solution.performance;
                    solutionModal.show();
                    break;
                case 'showCompileInfo':
                    if (Array.isArray(message.args[0])) {
                        translationText = message.args[0];
                        document.querySelector('#compileInfoDetails').innerHTML = translationText[translated ? 1 : 0];
                        document.querySelectorAll('.translation-ui').forEach(e => e.classList.remove('d-none'));
                    } else {
                        document.querySelector('#compileInfoDetails').innerHTML = message.args[0];
                        document.querySelectorAll('.translation-ui').forEach(e => e.classList.add('d-none'));
                    }
                    if (message.args[1]) {
                        document.querySelector('#compileInfoHint').classList.remove('d-none');
                        document.querySelector('#compileInfoHint').innerHTML = message.args[1];
                    } else {
                        document.querySelector('#compileInfoHint').classList.add('d-none');
                    }
                    compileErrorModal.show();
                    break;
            }
        });
    </script>
</body>

</html>`;
    }

    private _initWebPanel() {
        this._webPanel = vscode.window.createWebviewPanel("programming-grid", "编程网格", vscode.ViewColumn.One, {
            enableScripts: true
        });
        const disposable = this._webPanel.webview.onDidReceiveMessage(
            (message: { command: string, args: any[] }) => {
                switch (message.command) {
                    case 'run':
                        vscode.commands.executeCommand('programming-grid.run');
                        return;
                    case 'run_with_input':
                        setContent(this._inputTxtPath, this._currentProblemDescription?.input);
                        vscode.commands.executeCommand('programming-grid.run', this._inputTxtPath);
                        return;
                    case 'submit':
                        vscode.commands.executeCommand('programming-grid.submit');
                        return;
                    case 'copy_input':
                        if (this._currentProblemDescription !== null) {
                            vscode.env.clipboard.writeText(this._currentProblemDescription.input);
                        }
                        return;
                    case 'copy_output':
                        if (this._currentProblemDescription !== null) {
                            vscode.env.clipboard.writeText(this._currentProblemDescription.output);
                        }
                        return;
                    case 'origin':
                        if (this._currentProblem !== null) {
                            const info = this._currentProblem;
                            vscode.env.openExternal(vscode.Uri.parse(`https://programming.pku.edu.cn/programming/problem/${info.id}/show.do?problemsId=${info.setId}`));
                        }
                        return;
                    case 'history':
                        if (this._currentProblem !== null) {
                            const info = this._currentProblem;
                            vscode.env.openExternal(vscode.Uri.parse(`https://programming.pku.edu.cn/programming/problem/submit.history?problemId=${info.id}&problemsId=${info.setId}`));
                        }
                        return;
                    case 'answer':
                        if (this._currentProblem !== null) {
                            const info = this._currentProblem;
                            vscode.env.openExternal(vscode.Uri.parse(`https://github.com/Guyutongxue/Introduction_to_Computation/blob/master/pg_answer/${info.id}.cpp`));
                        }
                        return;
                    case 'browser':
                        vscode.env.openExternal(vscode.Uri.parse(message.args[0]));
                        return;
                    case 'open_editor':
                        this.openEditor();
                        return;
                }
            }
        );
        this._webPanel.iconPath = vscode.Uri.file(path.join(__dirname, '../assets/icon.svg'));
        this._webPanel.onDidDispose(() => {
            this._webPanel = null;
            this.save();
            disposable.dispose();
        });
    }

    private _postMessageToWebPanel(command: string, ...args: any[]) {
        if (this._webPanel === null) return;
        this._webPanel.webview.postMessage({
            command: command,
            args: args
        });
    }

    async openProblem(info: IProblemInfo) {
        // Save the old editor before open a new editor
        await this.save();

        this._currentProblem = info;
        this._currentProblemDescription = await getDescription(this._currentProblem);
        if (this._currentProblemDescription === null) {
            vscode.window.showErrorMessage("无法获取题目信息。");
            return;
        }
        if (this._webPanel === null) {
            this._initWebPanel();
        }
        this._webPanel!.webview.html = this._getProblemHtml();
        this.openEditor();
        // sleep 0.1s to let webview panel fully loaded
        // await new Promise<void>((r) => setTimeout(() => (this.openEditor(), r()), 100));
    }


    private async _closeExisted() {
        if (this._textDoc === null || this._textDoc.isClosed) return;
        await vscode.window.showTextDocument(this._textDoc);
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }

    async openEditor() {
        await this._closeExisted();
        this._initEditorContent();
        this._webPanel?.reveal();
        if (this._textDoc === null) {
            this._textDoc = await vscode.workspace.openTextDocument(this._editorCppPath);
        }
        await vscode.window.showTextDocument(this._textDoc, vscode.ViewColumn.Two);
    }

    private _initEditorContent() {
        if (this._currentProblem !== null) {
            let content = getContent(this._solutionStoragePath);
            if (content === "" && clozeMap.has(this._currentProblem.id)) {
                const { pre, post } = clozeMap.get(this._currentProblem.id)!;
                content = pre + "// 请在这里补充代码" + post;
            }
            setContent(this._editorCppPath, content);
        } else {
            createFile(this._editorCppPath);
        }
    }

    private _saveEditorContent() {
        if (!fs.existsSync(this._solutionStoragePath)) {
            createFile(this._solutionStoragePath);
        }
        fs.copyFileSync(this._editorCppPath, this._solutionStoragePath);
    }

    async save() {
        if (this._textDoc !== null && !this._textDoc.isClosed && this._textDoc.isDirty) {
            return this._textDoc.save();
        }
        return false;
    }

    async submit() {
        await this.save();
        if (this._currentProblem === null) {
            vscode.window.showErrorMessage("请先打开一个题目。");
            return;
        }
        if (this._webPanel === null) {
            await this._closeExisted();
            await this.openProblem(this._currentProblem);
            await new Promise<void>((r) => setTimeout(() => (r()), 1000));
        }
        const code = getContent(this._editorCppPath);
        if (code.trim() === "") {
            vscode.window.showErrorMessage("代码不能为空。");
            return;
        }
        if (clozeMap.has(this._currentProblem.id)) {
            const { pre, post } = clozeMap.get(this._currentProblem.id)!;
            if (!code.startsWith(pre) || !code.endsWith(post)) {
                vscode.window.showErrorMessage("未按规定完成代码填空。");
                return;
            }
        }
        if (/\b(system|fork)\b/.test(code)) {
            vscode.window.showErrorMessage("编程网格拒绝带有 system、fork 等单词的代码。");
            return;
        }
        const sid = await submitCode(this._currentProblem, code);
        if (sid === null) return;
        while (true) {
            const result = await getSolution(sid);
            if (result === null) return;
            // Get average performance
            const perfReg = /^Case\s+\d+ :  Time:\s+(\d+) ms,  Memory:\s+(\d+) kB,/gm;
            const time: number[] = [], memory: number[] = [];
            let match: RegExpExecArray | null;
            let perfRes: string;
            while ((match = perfReg.exec(result.details)) !== null) {
                time.push(parseInt(match[1]));
                memory.push(parseInt(match[2]));
            }
            if (time.length !== 0) {
                const aveTime = (time.reduce((a, b) => a + b) / time.length).toFixed();
                const aveMemory = (memory.reduce((a, b) => a + b) / memory.length).toFixed();
                perfRes = `${aveTime}ms/${aveMemory}kB`;
            } else {
                perfRes = "N/A";
            }
            this._postMessageToWebPanel('showSolution', {
                ...getStatusInfo(result.status),
                performance: perfRes,
                details: result.details
            });
            if (result.status !== 'Processing') break;
            await new Promise<void>((r) => setTimeout(() => (r()), 100));
        }
        vscode.commands.executeCommand("programming-grid.refresh", {
            type: "problemSet",
            value: this._currentProblem.setId
        });
    }

    async showCompileInfo(type: "warn" | "err", message: string) {
        const description = type === "warn" ? "存在警告" : "发生错误";
        const show = type === "warn" ? vscode.window.showWarningMessage : vscode.window.showErrorMessage;
        if (this._currentProblem === null) return;
        if (this._webPanel === null) {
            await this._closeExisted();
            await this.openProblem(this._currentProblem);
            await new Promise<void>((r) => setTimeout(() => (r()), 1000));
        }
        show(`编译${description}。`);
        let hint = "";
        if (type === "err" && message.search(/error: ld returned 1 exit status$/m) !== -1) {
            if (message.search(/Permission denied$/m) !== -1) {
                hint = "是否已有正在运行的程序？请在编译之前关闭正在运行的窗口。";
            }
            if (message.search(/undefined reference to `(WinMain|main)'$/m) !== -1) {
                hint = "是否定义了 main 函数？请保证源代码中存在一个 main 函数。";
            }
        }
        if (os.platform() !== "darwin") {
            this._postMessageToWebPanel('showCompileInfo', [
                replaceColorToHtml(message),
                replaceColorToHtml(replaceGccDiagnostics(message, { color: true })),
            ], hint);
        } else {
            this._postMessageToWebPanel('showCompileInfo', replaceColorToHtml(message), hint);
        }

    }

    dispose() {
        this._webPanel?.dispose();
        this._editorListeners.forEach(l => l.dispose());
    }

}

function replaceColorToHtml(content: string): string {
    content = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (os.platform() !== "darwin") {
        // reset color
        return content.replace(/\x1b\[m\x1b\[K/g, `</span>`)
            // error
            .replace(/\x1b\[01;31m\x1b\[K/g, `<span class="fw-bold text-danger">`)
            // warning
            .replace(/\x1b\[01;35m\x1b\[K/g, `<span class="fw-bold diag-warning">`)
            // note, path
            .replace(/\x1b\[01;36m\x1b\[K/g, `<span class="fw-bold text-primary">`)
            // range1 (green)
            .replace(/\x1b\[32m\x1b\[K/g, `<span class="diag-range1">`)
            // range2 (blue)
            .replace(/\x1b\[34m\x1b\[K/g, `<span class="diag-range2">`)
            // locus, quote
            .replace(/\x1b\[01m\x1b\[K/g, `<span class="fw-bold">`)
            // fixit-insert
            .replace(/\x1b\[32m\x1b\[K/g, `<span class="text-success">`)
            // fixit-delete
            .replace(/\x1b\[31m\x1b\[K/g, `<span class="text-danger">`)
            // type-diff
            .replace(/\x1b\[01;32m\x1b\[K/g, `<span class="fw-bold dg-range1">`);
    } else {
        // reset color
        return content.replace(/\x1b\[0m/g, `</span>`)
            // diag text
            .replace(/\x1b\[1m/g, `<span class="fw-bold">`)
            // error
            .replace(/\x1b\[0;1;31m/g, `<span class="fw-bold text-danger">`)
            // warning
            .replace(/\x1b\[0;1;35m/g, `<span class="fw-bold diag-warning">`)
            // note, path
            .replace(/\x1b\[0;1;36m/g, `<span class="fw-bold text-primary">`)
            // range1 (green)
            .replace(/\x1b\[0;1;32m/g, `<span class="fw-bold diag-range1">`)
            // range2 (blue)
            .replace(/\x1b\[0;1;34m/g, `<span class="fw-bold diag-range2">`)
            // // locus, quote
            // .replace(/\x1b\[01m\x1b\[K/g, `<span class="fw-bold">`)
            // // fixit-insert
            // .replace(/\x1b\[32m\x1b\[K/g, `<span class="text-success">`)
            // // fixit-delete
            // .replace(/\x1b\[31m\x1b\[K/g, `<span class="text-danger">`)
            // // type-diff
            // .replace(/\x1b\[01;32m\x1b\[K/g, `<span class="fw-bold dg-range1">`)
            ;

    }
}