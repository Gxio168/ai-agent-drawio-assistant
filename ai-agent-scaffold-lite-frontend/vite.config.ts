import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 后端服务地址（ai-agent-scaffold-lite）
 * 通过 VITE_API_PROXY_TARGET 覆盖，默认指向本地 8091 端口。
 */
const BACKEND_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8091'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 反向代理：前端统一请求同源 /api/v1/**，由 dev server 转发到后端，避免跨域与写死域名
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        // 后端为 SSE 风格的流式响应（chat_stream 使用 ResponseBodyEmitter），必须关闭缓冲
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform'
          })
        },
      },
    },
  },
})
