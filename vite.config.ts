import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

import submissionTierSnapshotsHandler from './api/submission-tier-snapshots'

const readRequestBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

const applyLocalEnv = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  })
}

const localApiRoutes = (): Plugin => ({
  name: 'local-api-routes',
  apply: 'serve',
  configResolved(config) {
    applyLocalEnv(config.mode)
  },
  configureServer(server) {
    server.middlewares.use('/api/submission-tier-snapshots', async (req, res, next) => {
      try {
        const rawBody = await readRequestBody(req)
        const contentType = String(req.headers['content-type'] || '').toLowerCase()
        const body = rawBody && contentType.includes('application/json') ? JSON.parse(rawBody) : rawBody
        const viteResponse = res as ServerResponse & { status?: (statusCode: number) => ServerResponse }
        viteResponse.status = (statusCode: number) => {
          res.statusCode = statusCode
          return res
        }

        await submissionTierSnapshotsHandler(
          Object.assign(req, { body, query: {} }) as never,
          viteResponse as never
        )
      } catch (error) {
        next(error)
      }
    })
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    ui({
      ui: {
        colors: {
          primary: 'green',
          neutral: 'zinc'
        }
      }
    }),
    localApiRoutes()
  ]
})
