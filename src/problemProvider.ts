import * as vscode from 'vscode';
import { TreeItem } from 'vscode';
import { hideClosedProblems } from './config';
import { getProblems, getProblemSets } from './fetch';

export interface IProblemInfo {
    id: string;
    setId: string;
    text: string;
    index: number;
}
export interface IProblemSetInfo extends IProblemInfo {
    id: string;
    text: string;
    available: boolean;
}

class Problem extends TreeItem {
    constructor(public readonly info: IProblemInfo) {
        super(`${info.index}. ${info.text}`, vscode.TreeItemCollapsibleState.None);
        this.id = info.setId + '/' + info.id;
        this.command = {
            title: "Open Problem",
            command: "programming-grid.openProblem",
            arguments: [this.info]
        };
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (element && element instanceof ProblemSet) {
            return element.getChildren();
        } else {
            const infos = await getProblemSets();
            return infos.filter(i => {
                if (hideClosedProblems()) {
                    return i.available;
                } else {
                    return true;
                }
            }).map(problemSet => new ProblemSet(problemSet));
        }
    }
}