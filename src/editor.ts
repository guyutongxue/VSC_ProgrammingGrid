import { debug, getDescription, ProblemDescription, submitCode } from "./fetch";
import { IProblemInfo } from "./problemProvider";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getStatusInfo } from "./config";

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
        const secs = desc.sections.map(sec => {
            if (["来源", "例子输入", "例子输出"].includes(sec.title)) return "";
            return `<h5><strong>${sec.title}</strong></h5><p>${sec.content}</p>`;
        }).join("\n");
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
        }

        pre {
            background-color: var(--bs-light);
            padding: 1rem 1.5rem;
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

        .highout {
            background-color: bisque;
        }

        .highstd {
            background-color: #eef;
        }

        .codicon {
            transform: translateY(1.5px);
        }
    </style>
</head>

<body>
    <article class="container-md">
        <header
            class="p-3 pb-2 sticky-top bg-white border-bottom border-3 d-flex flex-direction-row justify-content-between align-items-center">
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
            ${secs}
            <h5>
                <strong>样例输入&nbsp;
                    <div class="btn-group">
                        <button class="btn btn-sm btn-light" title="复制" onclick="p('copy_input')">
                            <i class="codicon codicon-copy"></i>
                        </button>
                        <button class="btn btn-sm btn-light" title="使用样例输入运行本地代码" onclick="p('run_with_input')">
                            <i class="codicon codicon-play"></i>
                        </button>
                    </div>
                </strong>
            </h5>
            <pre class="highlight"><code>${desc.input}</code></pre>
            <h5>
                <strong>样例输出&nbsp;
                    <button class="btn btn-sm btn-light" title="复制" onclick="p('copy_output')">
                        <i class="codicon codicon-copy"></i>
                    </button>
                </strong>
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
                    <h4>提交结果</h4>
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
                    <h5><strong>提示</strong></h5>
                    <pre><code id="solutionDetails"></code></pre>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const solutionModal = new bootstrap.Modal(document.querySelector('#solutionModal'), { keyboard: false })
        const vscode = acquireVsCodeApi();
        function p(cmd, ...args) {
            vscode.postMessage({
                command: cmd,
                args: args
            });
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
                case 'showCompileError':
                    // TODO
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
                    case 'open_editor':
                        this.openEditor();
                        return;
                }
            }
        );
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
        // sleep 0.1s to let webview panel fully loaded
        setTimeout(() => this.openEditor(), 100);
    }


    private async _closeExisted() {
        if (this._textDoc === null || this._textDoc.isClosed) return;
        await vscode.window.showTextDocument(this._textDoc);
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }

    async openEditor() {
        // await this._closeExisted();
        this._initEditorContent();
        this._webPanel?.reveal();
        if (this._textDoc === null) {
            this._textDoc = await vscode.workspace.openTextDocument(this._editorCppPath);
        }
        await vscode.window.showTextDocument(this._textDoc, vscode.ViewColumn.Two);
    }

    private _initEditorContent() {
        if (this._currentProblem !== null) {
            const content = getContent(this._solutionStoragePath);
            setContent(this._editorCppPath, content);
        } else {
            createFile(this._editorCppPath);
        }
    }

    private _saveEditorContent() {
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
        if (this._currentProblem === null) return;
        const code = getContent(this._editorCppPath);
        const result = await debug("https://programming.pku.edu.cn/programming/problem/solution.do?solutionId=303f0a22f360429eb3de257dedea3b00");
        // const result = await submitCode(this._currentProblem, code);
        if (result === null) return;
        // Get average performance
        const perfReg = /^Case \d+: Time = (\d+)ms, Memory = (\d+)kB\.$/gm;
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
    }

    showCompileError(error: string) {
        // TODO
    }

    dispose() {
        this._webPanel?.dispose();
        this._editorListeners.forEach(l => l.dispose());
    }

}