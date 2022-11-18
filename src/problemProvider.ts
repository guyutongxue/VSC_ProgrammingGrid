import path = require('path');
import * as vscode from 'vscode';
import { TreeItem } from 'vscode';
import { hideClosedProblems } from './config';
import { getProblems, getProblemSets } from './fetch';

export interface IProblemInfo {
    id: string;
    setId: string;
    text: string;
    index: number;
    status?: 'ac' | 'wa';
}
export interface IProblemSetInfo {
    id: string;
    text: string;
    available: boolean;
}

class Problem extends TreeItem {
    constructor(public readonly info: IProblemInfo) {
        super(`${info.index}. ${info.text}`, vscode.TreeItemCollapsibleState.None);
        console.log(info);
        this.id = info.setId + '/' + info.id;
        this.command = {
            title: "Open Problem",
            command: "programming-grid.openProblem",
            arguments: [this.info]
        };
        if (info.status === 'ac') {
            this.iconPath = new vscode.ThemeIcon('check');
        } else if (info.status === 'wa') {
            this.iconPath = new vscode.ThemeIcon('close');
        }
    }
}

class ProblemSet extends TreeItem {
    constructor(public readonly info: IProblemSetInfo) {
        super(info.text, vscode.TreeItemCollapsibleState.Collapsed);
        if (!info.available) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.tooltip = "题集已关闭";
        }
        this.id = info.id;
    }

    public async getChildren(): Promise<Problem[]> {
        const problems = await getProblems(this.info.id);
        return problems.map(problem => new Problem(problem));
    }
}

export class ProblemProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _problemSets: ProblemSet[] = [];

    refresh(setId?: string): void {
        if (typeof setId === "undefined") {
            this._onDidChangeTreeData.fire();
            return;
        }
        const problemSet = this._problemSets.find(problemSet => problemSet.id === setId);
        if (typeof problemSet !== "undefined") {
            this._onDidChangeTreeData.fire(problemSet);
        }
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (element && element instanceof ProblemSet) {
            return element.getChildren();
        } else {
            const infos = await getProblemSets();
            return this._problemSets = infos.filter(i => {
                if (hideClosedProblems()) {
                    return i.available;
                } else {
                    return true;
                }
            }).map(problemSet => new ProblemSet(problemSet));
        }
    }
}