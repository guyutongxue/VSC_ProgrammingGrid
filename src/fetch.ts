import { default as fetch, HeadersInit, RequestInit, Response } from 'node-fetch';
import * as cheerio from 'cheerio';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import * as mime from 'mime/lite';
import { URL, URLSearchParams } from 'url';

import { getPassword, getUsername, getCourseId } from './config';
import { IProblemInfo, IProblemSetInfo } from './problemProvider';

let _cookie: string | null = null;
function saveCookie(cookie: string | null) {
    _cookie = cookie;
}
function loadCookie(): { cookie?: string } {
    if (_cookie === null) return {};
    return {
        cookie: _cookie,
    };
}
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36 Edg/92.0.902.73";
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6";
const headers: HeadersInit = {
    'User-Agent': userAgent,
    'Accept-Language': acceptLanguage
};

export async function login(): Promise<boolean> {
    const username = getUsername();
    const password = getPassword();
    if (username === null || password === null) {
        vscode.window.showErrorMessage("登录失败，用户名或密码未设置。");
        return false;
    }
    const data = new URLSearchParams();
    data.append("appid", "ProgrammingGrid");
    data.append("userName", username);
    data.append("password", password);
    data.append("randCode", "");
    data.append("smsCode", "");
    data.append("otpCode", "");
    data.append("redirUrl", "https://programming.pku.edu.cn/authcallback");
    return fetch("https://iaaa.pku.edu.cn/iaaa/oauthlogin.do", {
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        redirect: 'manual',
        body: data
    })
        .then(r => r.json())
        .then(json => {
            console.log(json);
            if (json.success !== true) {
                vscode.window.showErrorMessage("登录失败，请检查用户名和密码是否正确。");
                return false;
            }
            return fetch(`https://programming.pku.edu.cn/authcallback?_rand=${Math.random()}&token=${json.token}`, {
                headers: {
                    ...headers
                },
                redirect: 'manual'
            }).then(r => {
                const cookie = r.headers.get('Set-Cookie');
                if (cookie === null) {
                    vscode.window.showErrorMessage("登录失败。");
                    return false;
                }
                vscode.window.showInformationMessage("登录成功。");
                saveCookie(cookie);
                console.log(cookie);
                return true;
            });
        })
        .catch(err => {
            console.log(err);
            vscode.window.showErrorMessage("登录失败。");
            return false;
        });
}

export async function getCourseName() {
    const id = getCourseId();
    if (id === null) return null;
    const page = `https://programming.pku.edu.cn/programming/course/${id}/show.do`;
    return fetch(page, {
        headers
    })
        .then(r => r.buffer())
        .then(buf => {
            const text = iconv.decode(buf, 'gb2312');
            const $ = cheerio.load(text);
            const title = $(".showtitle");
            title.children().remove();
            return title.text().trim();
        });
}

export async function getProblemSets() {
    const id = getCourseId();
    if (id === null) return [];
    const page = `https://programming.pku.edu.cn/programming/course/${id}/show.do`;
    return fetch(page, {
        headers
    })
        .then(r => r.buffer())
        .then(buf => {
            const text = iconv.decode(buf, 'gb2312');
            const $ = cheerio.load(text);
            const list = $("ul.homework");
            return list.children().map(function (i) {
                const a = $(this).children("a");
                const color = $(this).children("font").attr("color");
                const href = a.attr("href");
                const text = a.text();
                if (typeof href === "undefined") return null;
                const result = /problemsId=([0-9a-f]{32})/.exec(href);
                if (result === null) return null;
                const pId = result[1];
                return <IProblemSetInfo>{
                    id: pId,
                    text: text,
                    available: color !== "green"
                };
            }).toArray();
        });
}

async function tryFetch(url: string, options: RequestInit): Promise<string | null>;
async function tryFetch(url: string, options: RequestInit, decode: true): Promise<string | null>;
async function tryFetch(url: string, options: RequestInit, decode: false): Promise<Response | null>;
async function tryFetch(url: string, options: RequestInit, decode = true): Promise<Response | string | null> {
    function getOptions(): RequestInit {
        return {
            ...options,
            headers: {
                ...options.headers,
                ...loadCookie(),
            }
        };
    }
    let _tried = 0;
    async function retry() {
        switch (_tried++) {
            case 1:
                console.log("Cookie not set or expired, try login...");
                await login();
            case 0:
                return false;
            default:
                return true;
        };
    };
    while (true) {
        if (await retry()) break;
        const r = await fetch(url, getOptions());
        if (r.status === 404) {
            continue;
        }
        const buf = await r.clone().buffer();
        if (r.headers.get('Content-Type')?.includes('application/json')) {
            const text = iconv.decode(buf, 'utf-8');
            const json = JSON.parse(text);
            if (json?.type === 'relogin') {
                continue;
            }
            return decode ? text : r;
        } else {
            const text = iconv.decode(buf, 'gb2312');
            const $ = cheerio.load(text);
            if ($('[name="accessDeny"]').length > 0) {
                continue;
            }
            return decode ? text : r;
        }
    }
    return null;
}

/** Translate image url to base64 */
async function getImage(url: string): Promise<string> {
    let mimeType;
    const buf = await fetch(url, {
        headers: {
            ...headers,
            ...loadCookie(),
        }
    }).then(async r => {
        mimeType = r.headers.get('Content-Type') ?? mime.getType(url);
        if (mimeType?.startsWith("text/html")) {
            if (!(await login())) return Buffer.from("");
            return fetch(url, {
                headers: {
                    ...headers,
                    ...loadCookie()
                }
            }).then(r => r.buffer());
        } else {
            return r.buffer();
        }
    });
    return `data:${mimeType};base64,${buf.toString('base64')}`;
}

export async function getProblems(setId: string) {
    const courseId = getCourseId();
    const page = `https://programming.pku.edu.cn/programming/course/${courseId}/showProblemList.do?problemsId=${setId}&type=json`;
    return tryFetch(page, {
        headers
    }).then(text => {
        if (text === null) {
            vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
            return [];
        }
        const json = JSON.parse(text);
        // const $ = cheerio.load(text);
        // if ($("ol").length === 0) {
        //     vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
        //     return [];
        // }
        // return $("ol").children().map(function (i) {
        //     const a = $(this).children("a").eq(0);
        //     const href = a.attr("href");
        //     const text = a.text();
        //     if (typeof href === "undefined") return null;
        //     const result = /\/programming\/problem\/([0-9a-f]{32})\/show\.do/.exec(href);
        //     if (result === null) return null;
        //     const pId = result[1];
        //     const status = a.hasClass('presult0') ? 'ac' : (a.hasClass('presult1') ? 'wa' : undefined);
        //     return <IProblemInfo>{
        //         id: pId,
        //         setId: setId,
        //         text: text,
        //         index: i + 1,
        //         status: status
        //     };
        // }).toArray();
        console.log(json);
        if (!("problemlist" in json)) {
            vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
            return [];
        }
        return (json.problemlist.problems as any[]).map((p, i) => (<IProblemInfo>{
            id: p.id,
            setId: setId,
            index: i + 1,
            text: p.title,
            status: p.result === null ? undefined : (p.result === "AC" ? 'ac' : 'wa')
        }));

    });
}

export interface ProblemDescription {
    title: string;
    description: string;
    aboutInput: string;
    aboutOutput: string;
    hint: string;
    input: string;
    output: string;
};

export interface SolutionDescription {
    status: string;
    details: string;
}

export async function getDescription(info: IProblemInfo) {
    const page = `https://programming.pku.edu.cn/programming/problem/${info.id}/show.do?problemsId=${info.setId}`;
    return tryFetch(page, {
        headers
    }).then(async text => {
        if (text === null) return null;
        const $ = cheerio.load(text);
        const promises: Promise<void>[] = [];
        // Some very strange problems have image in sample input.
        // Move them to the description section.
        $("#sampleInput img").appendTo("#aboutInput");
        $("#sampleOutput img").appendTo("#aboutOutput");
        $("#problemDescription,#aboutInput,#aboutOutput,#problemHint").find("img").each(function (_) {
            const src = $(this).attr("src");
            if (typeof src === "undefined") return;
            promises.push(getImage((new URL(src, page)).href).then(base64 => {
                $(this).attr("src", base64);
            }));
        });
        await Promise.all(promises);
        function getRawIo(selector: string) {
            let text = $(selector).text().trim();
            const html = $(selector).html();
            if (!text.includes('\n') && html?.includes('<br>')) {
                text = html.replace(/<br>/g, '\n');
            }
            return text.replace(/\u2003|\u200b|\u00a0|&nbsp;/g, ' ');
        }
        const input = getRawIo('#sampleInput');
        const output = getRawIo('#sampleOutput');
        const r: ProblemDescription = {
            title: $("#problemTitle").text(),
            description: $("#problemDescription").html() ?? "",
            aboutInput: $("#aboutInput").html() ?? "",
            aboutOutput: $("#aboutOutput").html() ?? "",
            hint: $("#problemHint").html() ?? "",
            input: input,
            output: output
        };
        console.log(r);
        return r;
    });
}

export function submitCode(info: IProblemInfo, code: string) {
    const HEADER_COMMENT = "// Submitted by 'Programming Grid' VS Code Extension\n\n";
    const page = `https://programming.pku.edu.cn/programming/problem/submit.do`;
    const data = new URLSearchParams();
    data.append('problemId', info.id);
    data.append('problemsId', info.setId);
    data.append('sourceCode', HEADER_COMMENT + code);
    data.append('programLanguage', 'C++');
    data.append('type', 'json');
    return tryFetch(page, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        body: data.toString()
    }).then(async (r) => {
        if (r === null) return null;
        let json: any;
        try {
            json = JSON.parse(r);
        } catch {
            return null;
        }
        if (!json.solution) return null;
        vscode.commands.executeCommand("programming-grid.refresh", {
            type: "problemSet",
            value: info.setId
        });

        return {
            status: json.solution.result,
            details: json.solution.hint
        };
    });
}