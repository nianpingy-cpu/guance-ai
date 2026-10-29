export interface WebdavGuide {
  id: string;
  name: string;
  recommended?: boolean;
  url: string;
  account: string;
  password: string;
  steps: string[];
  link: string;
  linkLabel: string;
}

export const webdavGuides: WebdavGuide[] = [
  {
    id: 'jianguoyun',
    name: '坚果云',
    recommended: true,
    url: 'https://dav.jianguoyun.com/dav/',
    account: '坚果云登录邮箱',
    password: '第三方应用密码（不是登录密码）',
    steps: [
      '登录坚果云网页版，打开「账户设置 → 安全选项 → 第三方应用管理」。',
      '点「添加应用」，名称填 GuanceAI，生成应用密码并复制。',
      '回到本页：地址填 https://dav.jianguoyun.com/dav/，用户名填坚果云邮箱，密码填刚才的应用密码。',
      '生成并保存同步口令，然后点“保存并测试连接”。',
    ],
    link: 'https://help.jianguoyun.com/?s=WebDAV',
    linkLabel: '查看坚果云 WebDAV 帮助',
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    url: 'https://你的服务器/remote.php/dav/files/你的用户名/',
    account: 'Nextcloud 用户名',
    password: '登录密码；更推荐在“安全”里生成应用密码',
    steps: [
      '登录 Nextcloud，在「文件 → 设置 → WebDAV」查看 WebDAV 地址。',
      '把地址中的“你的服务器”“你的用户名”换成自己的，并保留最后的斜杠。',
      '在「个人设置 → 安全」生成一个应用密码（没有则用登录密码）。',
      '回到本页填写地址、用户名和应用密码，生成同步口令后保存并测试。',
    ],
    link: 'https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html',
    linkLabel: '查看 Nextcloud WebDAV 文档',
  },
  {
    id: 'synology',
    name: '群晖 NAS',
    url: 'https://你的NAS地址:5006/共享文件夹名/',
    account: 'DSM 用户名',
    password: 'DSM 登录密码',
    steps: [
      '在 DSM「套件中心」安装并打开 WebDAV Server，启用 HTTPS（默认端口 5006）。',
      '给使用的 DSM 账号开放一个共享文件夹的读写权限。',
      '地址填 https://你的NAS地址:5006/共享文件夹名/，不要只填 NAS 根地址。',
      '回到本页填写 DSM 用户名和密码，生成同步口令后保存并测试。',
    ],
    link: 'https://kb.synology.com/zh-cn/DSM/tutorial/How_to_access_files_on_Synology_NAS_with_WebDAV',
    linkLabel: '查看群晖 WebDAV 教程',
  },
];
