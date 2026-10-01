import { pluggyWebhook, readWebhookConfig } from '../../server/pluggy/webhook.js'

export function POST(request: Request): Promise<Response> {
  return pluggyWebhook(request, readWebhookConfig(process.env))
}
