import type { AiErrorKind } from './deepseek.ts';

/** Why a DeepSeek request failed, in words a reader can act on (G-05, A-05). */
export const FAILURE: Record<AiErrorKind, string> = {
  'no-key': '先在首页填写 DeepSeek API Key',
  'invalid-key': 'API Key 无效，请到首页更换',
  'no-balance': 'DeepSeek 账户余额不足',
  'rate-limit': '请求太频繁，请稍后再试',
  server: 'DeepSeek 暂时不可用，请稍后再试',
  network: '网络连接失败',
  timeout: '等待超时',
  'bad-answer': '没有得到有效的分析',
};
/** Failures that 重试 cannot fix: the key has to change first. */
export const NO_RETRY = new Set<AiErrorKind>(['no-key', 'invalid-key', 'no-balance']);
