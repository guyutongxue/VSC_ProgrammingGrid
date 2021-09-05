import path = require('path');
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
        if (username === null) {
            result.push(new Info("尚未登录", "username"));
        } else {
            result.push(new Info(`用户名：${username}`, "username"));
        }
        const courseName = await getCourseName();
        if (courseName === null) {
            result.push(new Info("尚未选择课程", "courseId"));
        } else {
            result.push(new Info(`课程：${courseName}`, "courseId"));
        }
        return Promise.resolve(result);
    }
}

class Info extends vscode.TreeItem {
    constructor(public readonly name: string, context: string) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = context;
        switch (context) {
            case "username":
                this.iconPath = new vscode.ThemeIcon('account');
                break;
            case "courseId":
                this.iconPath = new vscode.ThemeIcon('book');
                break;
        }
    }
}