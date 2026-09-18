import { PROXY_CONFIG } from '../config';

/**
 * 真实现代 Chrome 132 浏览器指纹生成器
 * 精确模拟 Chromium/Windows 桌面真实请求头、Client Hints 与访问顺序
 */
export function buildRealisticHeaders(token: string): Record<string, string> {
  return {
    'Host': 'chat.deepseek.com',
    'Connection': 'keep-alive',
    'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'DNT': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Origin': PROXY_CONFIG.DEEPSEEK_WEB_ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': `${PROXY_CONFIG.DEEPSEEK_WEB_ORIGIN}/`,
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Priority': 'u=1, i',
    'Authorization': `Bearer ${token}`,
    'X-App-Version': '2.0.0',
    'X-Client-Locale': 'zh_CN',
    'X-Client-Platform': 'web',
    'X-Client-Version': '1.0.0-always',
  };
}
