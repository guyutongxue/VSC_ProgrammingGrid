import { default as fetch, HeadersInit, RequestInit, Response } from 'node-fetch';
import * as cheerio from 'cheerio';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import * as mime from 'mime/lite';
import { URL, URLSearchParams } from 'url';

import { getPassword, getUsername, getCourseId } from './config';
import { IProblemInfo, IProblemSetInfo } from './problemProvider';

let passport: string | null = null;
function saveCookie(cookie: string | null) {
    if (cookie === null) return;
    // passport=1b71be3637ac8531eb8aa48fc8d5c554137ed8d473557e7cc26b01f510e85c8879f4cc342418fbd398b318fd67da53cf; Path=/
    const result = /passport=([0-9a-f]{96});/.exec(cookie);
    if (result === null) return;
    passport = result[1];
}
function loadCookie(): { cookie?: string } {
    if (passport === null) return {};
    return {
        cookie: `passport=${passport}`,
    };
}
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36 Edg/92.0.902.73";
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6";
const headers: HeadersInit = {
    'User-Agent': userAgent,
    'Accept-Language': acceptLanguage
};

async function login(): Promise<boolean> {
    const username = getUsername();
    const password = getPassword();
    if (username === null || password === null) {
        vscode.window.showErrorMessage("登录失败，用户名或密码未设置。");
        return false;
    }
    const data = new URLSearchParams();
    data.append('username', username);
    data.append('password', password);
    return fetch("https://programming.pku.edu.cn/programming/login.do", {
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        redirect: 'manual',
        body: data.toString() + "&login=%B5%C7%C2%BC" // 登录 in GB2312
    }).then(r => {
        const cookie = r.headers.get('Set-Cookie');
        if (cookie === null) {
            vscode.window.showErrorMessage("登录失败，请检查用户名和密码是否正确。");
            return false;
        } else {
            vscode.window.showInformationMessage("登录成功。");
            saveCookie(cookie);
            return true;
        }
    });
}

export async function getCourseName() {
    const id = getCourseId();
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
        const buf = await r.buffer();
        const text = iconv.decode(buf, 'gb2312');
        const $ = cheerio.load(text);
        if ($('[name="accessDeny"]').length > 0) {
            continue;
        }
        return decode ? text : r;
    }
    return null;
}

/** Translate image url to base64 */
async function getImage(url: string): Promise<string> {
    const buf = await fetch(url, {
        headers: {
            ...headers,
            ...loadCookie(),
        }
    }).then(async r => {
        if (r.headers.get("Content-Type")?.startsWith("text/html")) {
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
    const mimeType = mime.getType(url);
    return `data:${mimeType};base64,${buf.toString('base64')}`;
}

export async function getProblems(setId: string) {
    const courseId = getCourseId();
    const page = `https://programming.pku.edu.cn/programming/course/${courseId}/showProblemList.do?problemsId=${setId}`;
    return tryFetch(page, {
        headers
    }).then(text => {
        if (text === null) return [];
        const $ = cheerio.load(text);
        if ($("ol").length === 0) {
            vscode.window.showErrorMessage("获取题目列表失败，请检查是否拥有访问该课程的权限。");
            return [];
        }
        return $("ol").children().map(function (i) {
            const a = $(this).children("a").eq(0);
            const href = a.attr("href");
            const text = a.text();
            if (typeof href === "undefined") return null;
            const result = /\/programming\/problem\/([0-9a-f]{32})\/show\.do/.exec(href);
            if (result === null) return null;
            const pId = result[1];
            const font = $(this).find("font");
            const status = font.length === 0 ? undefined : font.attr('color') === 'red' ? 'wa' : 'ac' ;
            return <IProblemInfo>{
                id: pId,
                setId: setId,
                text: text,
                index: i + 1,
                status: status
            };
        }).toArray();
    });
}

export interface ProblemDescription {
    title: string;
    sections: {
        title: string;
        content: string;
    }[];
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
        $('.highin,.highout').children('br').remove();
        const mainContent = $(".fieldname,.fieldvalue");
        const length = mainContent.length;
        if (length < 4) return null;
        const descRaw = mainContent.slice(1, length - 3);
        const r: ProblemDescription = {
            title: info.text,
            sections: [],
            input: "",
            output: ""
        };
        for (const i of descRaw) {
            if ($(i).hasClass('fieldname')) {
                r.sections.push({
                    title: $(i).text(),
                    content: ""
                });
            }
            if ($(i).hasClass('fieldvalue')) {
                // Replace img source
                // $.each doesn't support async, so gather all promises here
                const promises: Promise<void>[] = [];
                $(i).find("img").each(function (_) {
                    const src = $(this).attr("src");
                    if (typeof src === "undefined") return;
                    promises.push(getImage((new URL(src, page)).href).then(base64 => {
                        $(this).attr("src", base64);
                    }));
                });
                // Remove extra empty pre
                $(i).find("pre").filter(function (_) {
                    return $(this).text() === "";
                }).each(function (_) {
                    $(this).remove();
                });
                await Promise.all(promises);
                r.sections[r.sections.length - 1].content = $(i).html() ?? "";
            }
        }
        r.input = $('.highin').text();
        r.output = $('.highout').text();
        console.log(r);
        return r;
    });
}

// TODO: inline in `submitCode` when server is on
function parseSolutionPage(text: string): SolutionDescription | null {
    const $ = cheerio.load(text);
    const status = $('.showtitle').text().trim();
    const values = $('.fieldvalue');
    if (values.length !== 3) return null;
    const details = values.eq(1).children().html();
    return {
        status: status,
        details: details ?? ""
    };
}

// TODO: remove this when server is on
export async function debug(page: string) {
    return tryFetch(page, {
        headers
    }).then(text => {
        if (text === null) {
            vscode.window.showErrorMessage("获取失败");
            return null;
        }
        const r = parseSolutionPage(text);
        console.log(r);
        return r;
    });
}

export function submitCode(info: IProblemInfo, code: string) {
    const page = `https://programming.pku.edu.cn/programming/problem/submit.do`;
    const data = new URLSearchParams();
    data.append('problemId', info.id);
    data.append('problemsId', info.setId);
    data.append('sourceCode', code);
    data.append('programLanguage', 'C++');
    return tryFetch(page, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: data.toString()
    }, false).then(async r => {
        if (r === null) {
            vscode.window.showErrorMessage("提交失败，请检查是否拥有访问该课程的权限。");
            return null;
        }
        if (r.status !== 200) {
            vscode.window.showErrorMessage("提交失败。可能是编程网格服务器出现问题，请稍后再试。");
            return null;
        }
        const text = iconv.decode(await r.buffer(), "gb2312");
        return parseSolutionPage(text);
    });
}