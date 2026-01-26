import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'
import { viteBundler } from '@vuepress/bundler-vite'

export default defineUserConfig({
  lang: 'zh-CN',
  title: 'postmessage-duplex',
  description: '轻量级、类型安全的 postMessage 双工通讯库',
  
  base: '/postmessage-duplex/',
  
  head: [
    ['link', { rel: 'icon', href: '/postmessage-duplex/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ],

  bundler: viteBundler(),

  theme: defaultTheme({
    logo: '/logo.svg',
    repo: 'ljquan/postmessage-duplex',
    docsDir: 'docs',
    editLink: true,
    editLinkText: '在 GitHub 上编辑此页',
    lastUpdated: true,
    lastUpdatedText: '上次更新',
    contributorsText: '贡献者',
    
    navbar: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: '示例', link: '/examples/' },
      { text: '🎮 Playground', link: '/playground/' },
      {
        text: '更多',
        children: [
          { text: 'FAQ', link: '/faq/' },
          { text: '更新日志', link: 'https://github.com/ljquan/postmessage-duplex/blob/master/CHANGELOG.md' },
          { text: 'GitHub', link: 'https://github.com/ljquan/postmessage-duplex' },
        ]
      }
    ],
    
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          children: [
            '/guide/README.md',
            '/guide/getting-started.md',
            '/guide/iframe-communication.md',
            '/guide/service-worker.md',
            '/guide/typescript.md',
            '/guide/debugging.md',
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          children: [
            '/api/README.md',
            '/api/iframe-channel.md',
            '/api/service-worker-channel.md',
            '/api/types.md',
            '/api/errors.md',
          ]
        }
      ],
      '/examples/': [
        {
          text: '示例',
          children: [
            '/examples/README.md',
            '/examples/basic.md',
            '/examples/vue.md',
            '/examples/react.md',
            '/examples/advanced.md',
          ]
        }
      ]
    },
    
    // 语言切换
    locales: {
      '/': {
        selectLanguageName: '简体中文',
      },
      '/en/': {
        selectLanguageName: 'English',
      }
    }
  }),

  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'postmessage-duplex',
      description: '轻量级、类型安全的 postMessage 双工通讯库',
    },
    '/en/': {
      lang: 'en-US',
      title: 'postmessage-duplex',
      description: 'Lightweight, type-safe duplex communication library based on postMessage API',
    }
  }
})
