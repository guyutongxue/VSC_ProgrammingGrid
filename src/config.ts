import { commands, window, workspace } from 'vscode';
import { login } from './fetch';

export function getUsername() {
    const result = workspace.getConfiguration('programming-grid').get<string>('info.username');
    if (result === "") return null;
    return result ?? null;
}

export function getPassword() {
    const result = workspace.getConfiguration('programming-grid').get<string>('info.password');
    if (result === "") return null;
    return result ?? null;
}

export function getCourseId() {
    const result = workspace.getConfiguration('programming-grid').get<string>('info.courseId');
    if (result === "") return null;
    return result ?? null;
}

export async function setUser() {
    const username = await window.showInputBox({
        prompt: '输入北大学号：',
        placeHolder: '21000xxxxx',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (value === '') return '用户名不能为空';
            return null;
        }
    });
    if (username === undefined) return;
    const password = await window.showInputBox({
        prompt: '输入个人门户密码：',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (value === '') return '密码不能为空。';
            return null;
        }
    });
    if (password === undefined) return;
    await Promise.all([
        workspace.getConfiguration('programming-grid').update('info.username', username, true),
        workspace.getConfiguration('programming-grid').update('info.password', password, true)
    ]);
    commands.executeCommand('programming-grid.refresh');
    await login();
}

export async function setCourseId() {
    const validator = /^https:\/\/programming.pku.edu.cn(\/programming)?\/course\/([0-9a-f]{32})(\/(show.do)?)?$/;
    const result = await window.showInputBox({
        title: '输入课程页面的 URL 地址：',
        placeHolder: '如 https://programming.pku.edu.cn/course/8e6b7866023a4489babca3f56973f317/',
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
    const id = validator.exec(result)![2];
    console.log(id);
    await workspace.getConfiguration('programming-grid').update('info.courseId', id, true);
    commands.executeCommand('programming-grid.refresh');
}

export function hideClosedProblems() {
    const hidden = workspace.getConfiguration('programming-grid').get<boolean>('hideClosedProblems');
    return hidden ?? true;
}

export function getTerminalCommand() {
    const command = workspace.getConfiguration('programming-grid').get<string>('terminalCommand');
    return command ?? "";
}
export function setTerminalCommand(value: string) {
    workspace.getConfiguration('programming-grid').update('terminalCommand', value, true);
}

const colorMap: {
    [key: string]: {
        [key: string]: string
    }
} = {
    'luogu': {
        'Passed': '82, 196, 26',
        'WrongAnswer': '231, 76, 60',
        'RuntimeError': '157, 61, 207',
        'CompileError': '250, 219, 20',
        'TimeOut': '5, 34, 66',
        'OutOfMemory': '5, 34, 66',
        'EmptyOutput': '0, 164, 151',
        'OutputExceeded': '0, 164, 151',

        'Unknown': '204, 49, 124'
    },
    'pku': {
        'Passed': '0, 0, 255',
        'WrongAnswer': '255, 0, 0',
        'RuntimeError': '255, 0, 255',
        'CompileError': '0, 128, 0',
        'TimeOut': '255, 0, 255',
        'OutOfMemory': '255, 0, 255',
        'EmptyOutput': '255, 0, 0',
        'OutputExceeded': '255, 0, 0',

        'Unknown': '170, 34, 34'
    }
};

function getStatusColor(status: string) {
    const theme = workspace.getConfiguration('programming-grid').get<string>('colorTheme') ?? 'luogu';
    const colors = colorMap[theme] ?? colorMap['luogu'];
    return colors[status] ?? colors['Unknown'];
}

const chineseMap: {
    [key: string]: string
} = {
    'Passed': '通过',
    'WrongAnswer': '错误答案',
    'RuntimeError': '运行错误',
    'CompileError': '编译错误',
    'TimeOut': '时间超限',
    'OutOfMemory': '内存超限',
    'EmptyOutput': '空输出',
    'OutputExceeded': '输出超限',

    'Unknown': '未知情形'
};

const englishMap: Record<string, string> = {
    'Passed': 'Accepted',
    'WrongAnswer': 'Wrong Answer',
    'RuntimeError': 'Runtime Error',
    'CompileError': 'Compile Error',
    'TimeOut': 'Time Limit Exceeded',
    'OutOfMemory': 'Memory Limit Exceeded',
    'EmptyOutput': 'Empty Output',
    'OutputExceeded': 'Output Limit Exceeded',

    'Unknown': 'Unknown'
};

const abbrMap: {
    [key: string]: string
} = {
    'Passed': 'AC',
    'WrongAnswer': 'WA',
    'RuntimeError': 'RE',
    'CompileError': 'CE',
    'TimeOut': 'TLE',
    'OutOfMemory': 'MLE',
    'EmptyOutput': 'WA',
    'OutputExceeded': 'OLE',

    'Unknown': 'UNK'
};

export function getStatusInfo(status: string) {
    const color = getStatusColor(status);
    const title = englishMap[status];
    const chinese = chineseMap[status] ?? chineseMap['Unknown'];
    const abbr = abbrMap[status] ?? abbrMap['Unknown'];
    return {
        color,
        title,
        chinese,
        abbr
    };
}