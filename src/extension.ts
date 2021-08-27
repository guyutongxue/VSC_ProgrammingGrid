// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { InfoProvider } from './infoProvider';
import { setCourseId, setUser } from './config';
import { ProblemProvider } from './problemProvider';
import { EditorController, setDirectories } from './editor';
import { Runner } from './runner';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    console.log('Congratulations, your extension "programming-grid" is now active!');

    setDirectories(context);

    const infoProvider = new InfoProvider();
    const problemProvider = new ProblemProvider();
    const editor = new EditorController();
    const runner = new Runner();

    let disposables = [
        vscode.window.registerTreeDataProvider('pgInfo', infoProvider),
        vscode.window.registerTreeDataProvider('pgProblems', problemProvider),
        editor,
        runner,
    
        vscode.commands.registerCommand('programming-grid.setUser', setUser),
        vscode.commands.registerCommand('programming-grid.setCourseId', setCourseId),
        vscode.commands.registerCommand('programming-grid.refresh', (arg) => {
            if (typeof arg === "undefined") {
                infoProvider.refresh();
                problemProvider.refresh();
                return;
            }
            if (arg.type === "problemSet") {
                problemProvider.refresh(arg.value);
            }
        }),
        vscode.commands.registerCommand('programming-grid.run', async (...args) => {
            await editor.save();
            const result = await runner.run(...args);
            if (!result.success) editor.showCompileInfo('err', result.message);
            else if (result.message !== "") editor.showCompileInfo('warn', result.message);
        }),
        vscode.commands.registerCommand('programming-grid.submit', () => {
            editor.submit();
        }),
        vscode.commands.registerCommand('programming-grid.openProblem', (info) => {
            editor.openProblem(info);   
        })
    ];
    context.subscriptions.push(...disposables);
}

// this method is called when your extension is deactivated
export function deactivate() { }
