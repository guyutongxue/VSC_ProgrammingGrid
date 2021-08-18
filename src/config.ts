import { commands, window, workspace } from 'vscode';

export function getUsername() {
    const result: string | undefined = workspace.getConfiguration('programming-grid').get('username');
    if (result === "") return null;
    return result ?? null;
}

export function getPassword() {
    const result: string | undefined = workspace.getConfiguration('programming-grid').get('password');
    if (result === "") return null;
    return result ?? null;
}

export function getCourseId() {
    const result: string | undefined = workspace.getConfiguration('programming-grid').get('courseId');
    if (result === "") return null;
    return result ?? null;
}

export async function setUser() {
    const username = await window.showInputBox({
        prompt: '输入编程网格用户名：',
        placeHolder: '21000xxxxx',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (value === '') return '用户名不能为空';
            return null;
        }
    });
    if (username === undefined) return;
    const password = await window.showInputBox({
        prompt: '输入密码：',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (value === '') return '密码不能为空。';
            return null;
        }
    });
    if (password === undefined) return;
    workspace.getConfiguration('programming-grid').update('username', username, true);
    workspace.getConfiguration('programming-grid').update('password', password, true);
    commands.executeCommand('programming-grid.refresh');
}

export async function setCourseId() {
    const validator = /^https:\/\/programming.pku.edu.cn\/programming\/course\/([0-9a-f]{32})\/show.do$/;
    const result = await window.showInputBox({
        title: '输入课程页面的 URL 地址：',
        placeHolder: '如 https://programming.pku.edu.cn/programming/course/6c45504288b542eca6d96bfe4dc22b4a/show.do',
        ignoreFocusOut: true,
        validateInput: input => {
            if (input === "" || validator.test(input)) {
                return null;
            } else {
                return "不是正确的 URL。";
            }
        }
    });
    if (typeof result === "undefined") return;
    const id = validator.exec(result)![1];
    console.log(id);
    workspace.getConfiguration('programming-grid').update('courseId', id, true);
    commands.executeCommand('programming-grid.refresh');
}

export function hideClosedProblems() {
    const hidden: boolean | undefined = workspace.getConfiguration('programming-grid').get('hideClosedProblems');
    return hidden ?? true;
}