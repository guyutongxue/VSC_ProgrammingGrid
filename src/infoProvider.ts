import * as vscode from 'vscode';
import { getCourseId, getUsername } from './config';
import { getCourseName } from './fetch';


export class InfoProvider implements vscode.TreeDataProvider<Info> {
    private _onDidChangeTreeData: vscode.EventEmitter<Info | undefined | null | void> = new vscode.EventEmitter<Info | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Info | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Info): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: Info): Promise<Info[]> {
        const result: Info[] = [];
        if (element) return Promise.resolve(result);
        const username = getUsername();
        if (typeof username === 'undefined') {
            result.push(new Info("未设置用户名。", "username"));
        } else {
            result.push(new Info(`用户名：${username}`, "username"));
        }
        result.push(new Info(`课程：${await getCourseName()}`, "courseId"));
        return Promise.resolve(result);
    }
}

class Info extends vscode.TreeItem {
    constructor(public readonly name: string, context: string) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = context;
    }
}