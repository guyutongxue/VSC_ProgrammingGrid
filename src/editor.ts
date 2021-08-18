import { getDescription, ProblemDescription, submitCode } from "./fetch";
import { IProblemInfo } from "./problemProvider";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
        pre {
            background-color: var(--bs-light);
            padding: 1rem 1.5rem;
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
            <button class="btn btn-link btn-small flex-shrink-0" onclick="p('origin')">打开原网页</button>
        </footer>
    </article>
    <script>
        const vscode = acquireVsCodeApi();
        function p(cmd, ...args) {
            vscode.postMessage({
                command: cmd,
                args: args
            });
        }
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
                }
            }
        );
        this._webPanel.onDidDispose(() => {
            this._webPanel = null;
            this.save();
            disposable.dispose();
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
        const result = await submitCode(this._currentProblem, code);
    }

    showCompileError(error: string) {
        // TODO
    }

    dispose() {
        this._webPanel?.dispose();
        this._editorListeners.forEach(l => l.dispose());
    }

}