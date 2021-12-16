import { default as fetch, HeadersInit, RequestInit, Response } from 'node-fetch';
import * as cheerio from 'cheerio';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import * as mime from 'mime/lite';
import { URL, URLSearchParams } from 'url';

import { getPassword, getUsername, getCourseId } from './config';
import { IProblemInfo, IProblemSetInfo } from './problemProvider';

let _cookie: Record<string, string> = {
    "PG_client": "vscode_ext; Max-Age=315360000; Expires=Fri, 05-Dec-2031 05:34:07 GMT; Path=/; Secure"
};
function saveCookie(cookie: string[]) {
    for (const c of cookie) {
        const [key, ...value] = c.split('=');
        _cookie[key] = value.join('');
    }
}
function loadCookie(): { cookie?: string } {
    const cookie = Object.entries(_cookie).map(([k, v]) => `${k}=${v}`).join('; ');
    return {
        cookie
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
                    ...headers,
                    ...loadCookie()
                },
                redirect: 'manual'
            }).then(r => {
                const cookie = r.headers.get('Set-Cookie');
                if (cookie === null) {
                    vscode.window.showErrorMessage("登录失败。");
                    return false;
                }
                vscode.window.showInformationMessage("登录成功。");
                saveCookie(cookie.split(', '));
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
    const page = `https://programming.pku.edu.cn/course/${id}/?type=json`;
    return tryFetch(page, {
        headers
    })
        .then(r => {
            if (r === null) return null;
            const json = JSON.parse(r);
            return json.course.title;
        });
}

export async function getProblemSets() {
    const id = getCourseId();
    if (id === null) return [];
    const page = `https://programming.pku.edu.cn/course/${id}/?type=json`;
    return tryFetch(page, {
        headers
    })
        .then(r => {
            if (r === null) return [];
            const json = JSON.parse(r);
            const sets: any[] = json.course.problemlists;
           
            return sets.map(set => {
                const openDate = new Date(set.assignment.openTime);
                const closeDate = new Date(set.assignment.closeTime);
                const now = new Date();
                const isAvailable = now >= openDate && now <= closeDate;
                return <IProblemSetInfo>{
                    id: set.id,
                    text: set.title,
                    available: isAvailable
                };
            }); 
        });
}

async function tryFetch(url: string, options: RequestInit): Promise<string | null> {
    function getOptions(): RequestInit {
        return {
            ...options,
            redirect: 'manual',
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
            console.log(json);
            if (json.status !== 'OK') {
                continue;
            }
            return text;
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
    const page = `https://programming.pku.edu.cn/probset/${setId}/?type=json`;
    return tryFetch(page, {
        headers
    }).then(async (text) => {
        if (text === null) {
            vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
            return [];
        }
        const json = JSON.parse(text);
        if (!("problemlist" in json)) {
            vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
            return [];
        }

        const data = new URLSearchParams();
        data.append('query', 'results');
        data.append('username', getUsername() ?? '');
        data.append('probsetId', setId);
        const results = await tryFetch(`https://programming.pku.edu.cn/account/query.do`, {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: data.toString(),
        });
        const status: Record<string, string> = {};
        if (results !== null) {
            const json = JSON.parse(results);
            if (json.status === 'OK') {
                for (const r of json.results) {
                    status[r.id] = (r.result as string).toLowerCase();
                }
            }
        }

        return (json.problemlist.problems as any[]).map((p, i) => (<IProblemInfo>{
            id: p.id,
            setId: setId,
            index: i + 1,
            text: p.title,
            status: p.id in status ? status[p.id] : undefined,
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
    const page = `https://programming.pku.edu.cn/probset/${info.setId}/${info.id}/?type=json`;
    return tryFetch(page, {
        headers
    }).then(async text => {
        if (text === null) return null;
        const json = JSON.parse(text);
        for (const i in json.problem) {
            const html = json.problem[i];
            const $ = cheerio.load(html);
            const promises: Promise<void>[] = [];
            $("img").each(function (_) {
                const src = $(this).attr("src");
                if (typeof src === "undefined") return;
                promises.push(getImage((new URL(src, page)).href).then(base64 => {
                    $(this).attr("src", base64);
                }));
            });
            await Promise.all(promises);
            json.problem[i] = $('body').html();
        }
        function getRawIo(text: string) {
            return text.replace(/\r/,'').replace(/\u2003|\u200b|\u00a0|&nbsp;/g, ' ');
        }
        const input = getRawIo(json.problem.sampleInput);
        const output = getRawIo(json.problem.sampleOutput);
        const r: ProblemDescription = {
            title: json.problem.title,
            description: json.problem.description,
            aboutInput: json.problem.aboutInput,
            aboutOutput: json.problem.aboutOutput,
            hint: json.problem.hint,
            input: input,
            output: output
        };
        console.log(r);
        return r;
    });
}

export function submitCode(info: IProblemInfo, code: string) {
    const HEADER_COMMENT = "// Submitted by 'Programming Grid' VS Code Extension\n\n";
    const page = `https://programming.pku.edu.cn/probset/${info.setId}/${info.id}/submit.do`;
    const data = new URLSearchParams();
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
        return json.solution.id as string;
    });
}

let _ellipseCnt = 0;
function ellipse() {
    _ellipseCnt = (_ellipseCnt + 1) % 3;
    return ".".repeat(_ellipseCnt + 1);
}

export function getSolution(solutionId: string) {
    const page = `https://programming.pku.edu.cn/solution/${solutionId}/status.do`;
    return tryFetch(page, {
        headers
    }).then(async (r) => {
        if (r === null) return null;
        const json = JSON.parse(r);
        if (!json.solution) return null;
        return {
            status: json.solution.result,
            details: json.solution.result === 'Processing' ? '处理中，请稍候' + ellipse() : json.solution.hint
        };
    });
}