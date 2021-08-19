import * as vscode from "vscode";
import * as cp from "child_process";
import * as os from "os";
import * as path from "path";
import { sync as commandExists } from "command-exists";
import { getEditorCppPath, getEditorExecutablePath } from "./editor";
import * as terminals from "./terminal_emulators.json";
import { getTerminalCommand, setTerminalCommand } from "./config";

type CompileResult = {
    success: true;
} | {
    success: false;
    message: string;
};

export class Runner implements vscode.Disposable {
    private readonly _editorCppPath: string;
    private readonly _editorExecutablePath: string;
    private readonly _pauseScriptPath: string;

    private _runTerminal: vscode.Terminal | null = null;
    private _closeTerminalListener: vscode.Disposable;

    constructor() {
        this._editorCppPath = getEditorCppPath();
        this._editorExecutablePath = getEditorExecutablePath();
        if (os.platform() === "win32") {
            this._pauseScriptPath = path.join(__dirname, "../scripts/pause-console.ps1");
        } else {
            this._pauseScriptPath = path.join(__dirname, "../scripts/pause-console.sh");
        }

        this._closeTerminalListener = vscode.window.onDidCloseTerminal(t => {
            if (t === this._runTerminal) {
                this._runTerminal = null;
            }
        });
    }

    private _compile() {
        return new Promise<CompileResult>(resolve => {
            cp.execFile("g++", [
                "-std=c++14",
                this._editorCppPath,
                "-o",
                this._editorExecutablePath
            ], (err, stdout, stderr) => {
                if (err) {
                    resolve({
                        success: false,
                        message: stderr
                    });
                } else {
                    resolve({
                        success: true
                    });
                }
            });
        });
    }

    private _getTerminal(): vscode.Terminal {
        if (this._runTerminal === null) {
            const TERMINAL_NAME = "Programming Grid: Run";
            const TERMINAL_EXE = os.platform() === "win32" ? "C:\\Windows\\System32\\cmd.exe" : "bash";
            this._runTerminal = vscode.window.createTerminal(TERMINAL_NAME, TERMINAL_EXE);
        }
        return this._runTerminal;
    }

    runWindows(scriptArg: string, exeArg: string, inputArg: string) {
        this._getTerminal().sendText(`START C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\powershell.exe -ExecutionPolicy ByPass -NoProfile -File ${scriptArg} ${exeArg} ${inputArg}`);
    }

    runMac(scriptArg: string, exeArg: string, inputArg: string) {
        this._getTerminal().sendText(`open -a Terminal.app ${scriptArg} ${exeArg} ${inputArg}`);
    }

    runLinux(scriptArg: string, exeArg: string, inputArg: string) {
        let command = getTerminalCommand();
        if (command === "") {
            for (const terminal of terminals) {
                if (commandExists(terminal.name)) {
                    command = terminal.command;
                    break;
                }
            }
            if (command === "") {
                vscode.window.showErrorMessage("未检测到常见的终端模拟器。请手动设置 programming-grid.terminalCommand。");
                return;
            }
            vscode.window.showInformationMessage(`将使用 ${command} 作为启动终端模拟器的命令行。`);
            setTerminalCommand(command);
        }
        const result = command.replace("$cmd", scriptArg).replace("$args", `${exeArg} ${inputArg}`);
        this._getTerminal().sendText(result);
    }

    async run(inputfile?: string): Promise<string | null> {
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "编译中...",
            cancellable: false
        }, () => {
            return this._compile();
        });
        console.log(result);
        if (typeof inputfile === "undefined") {
            inputfile = "";
        } else {
            inputfile = JSON.stringify(inputfile);
        }
        if (result.success) {
            const scriptArg = JSON.stringify(this._pauseScriptPath);
            const exeArg = JSON.stringify(this._editorExecutablePath);
            if (os.platform() === "win32") {
                this.runWindows(scriptArg, exeArg, inputfile);
            } else if (os.platform() === "darwin") {
                this.runMac(scriptArg, exeArg, inputfile);
            } else {
                this.runLinux(scriptArg, exeArg, inputfile);
            }
            return null;
        } else {
            vscode.window.showErrorMessage("编译发生错误。");
            return result.message;
        }
    }

    dispose() {
        this._closeTerminalListener.dispose();
        if (this._runTerminal !== null) {
            this._runTerminal.dispose();
        }
    }

}