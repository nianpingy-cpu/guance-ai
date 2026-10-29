import type { Platform } from '@/types/desktop';

export interface PlatformGuide {
  id: Platform;
  name: string;
  appIdPlaceholder: string;
  appIdHint: string;
  secretLabel: string;
  secretPlaceholder: string;
  secretHint: string;
  loginUrl: string;
  loginLabel: string;
  docsUrl: string;
  docsLabel: string;
  steps: string[];
  caution: string;
}

export const platformGuides: PlatformGuide[] = [
  {
    id: 'wechat',
    name: '微信公众号',
    appIdPlaceholder: '例如 wx1234567890abcdef',
    appIdHint: '在公众号后台「设置与开发 → 基本配置」中的“开发者ID(AppID)”，不是公众号名称或微信号。',
    secretLabel: '应用密钥（AppSecret）',
    secretPlaceholder: '32位字母和数字',
    secretHint: '在同一个「基本配置」页生成或重置“开发者密码(AppSecret)”。它只完整显示一次，请立即粘贴保存。',
    loginUrl: 'https://mp.weixin.qq.com/',
    loginLabel: '打开微信公众平台登录',
    docsUrl: 'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html',
    docsLabel: '查看公众号官方开发文档',
    steps: [
      '用公众号管理员微信扫码登录微信公众平台。',
      '进入「设置与开发 → 基本配置」。',
      '复制“开发者ID(AppID)”；生成或重置“开发者密码(AppSecret)”后立即复制。',
      '回到本页，平台选择“微信公众号”，粘贴 AppID 与 AppSecret 并保存。',
    ],
    caution: '需要已认证的公众号和对应接口权限。AppSecret 不是公众号登录密码，泄露后请立刻在后台重置。本版只保存凭据，不会用它们登录或采集。',
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    appIdPlaceholder: '开放平台应用详情中的 App ID',
    appIdHint: '在小红书开放平台「应用管理 → 应用详情」查看 App ID，不是小红书号或店铺账号。',
    secretLabel: '应用密钥（App Secret）',
    secretPlaceholder: '开放平台应用详情中的 App Secret',
    secretHint: '与 App ID 在同一应用详情页。若后台不显示，请按平台要求重置或联系平台。',
    loginUrl: 'https://open.xiaohongshu.com/',
    loginLabel: '打开小红书开放平台登录',
    docsUrl: 'https://open.xiaohongshu.com/document/api',
    docsLabel: '查看小红书开放平台文档',
    steps: [
      '用已入驻的企业或商家账号登录小红书开放平台。',
      '完成开发者入驻，创建应用并提交需要的数据能力审核。',
      '在「应用管理 → 应用详情」复制 App ID 和 App Secret。',
      '回到本页，平台选择“小红书”，粘贴两项内容并保存。',
    ],
    caution: '个人账号不一定能申请；能查到哪些数据取决于获批的能力范围。App Secret 不是小红书登录密码。本版只保存凭据，不会启用采集。',
  },
  {
    id: 'douyin',
    name: '抖音',
    appIdPlaceholder: '开放平台应用详情中的 App ID',
    appIdHint: '在抖音开放平台「控制台 → 应用管理 → 应用详情」查看 App ID，不是抖音号或手机号。',
    secretLabel: '应用密钥（App Secret / Client Secret）',
    secretPlaceholder: '应用详情中的 App Secret',
    secretHint: '与 App ID 在同一应用详情页；有些页面写作 Client Secret。重置后旧密钥会失效。',
    loginUrl: 'https://open.douyin.com/',
    loginLabel: '打开抖音开放平台登录',
    docsUrl: 'https://open.douyin.com/platform/resource/docs/ability/search-management/video/',
    docsLabel: '查看抖音视频搜索能力说明',
    steps: [
      '用抖音开放平台账号登录，完成开发者资质认证。',
      '创建应用并通过审核，进入「控制台 → 应用管理 → 应用详情」。',
      '复制 App ID 和 App Secret（Client Secret）。',
      '如需关键词搜索，另行申请 video.search 能力；回到本页保存两项凭据。',
    ],
    caution: 'video.search 仅限自身业务获批关键词、最近1天，不能查询竞品词或通用品类。未获批时保存凭据也不会启用采集。App Secret 不是抖音登录密码。',
  },
];

export function platformGuide(id: Platform): PlatformGuide {
  return platformGuides.find((guide) => guide.id === id) ?? platformGuides[0];
}
