import axios from "axios"
import { authenticator } from 'otplib';

import { getGlobalConfig } from "../config"

export const SendWebhook = async (data: any, webhookType: string, ctx: { id: string }) => {
  try {
    const globalConfig = await getGlobalConfig(ctx)
    if (globalConfig.webhookEndpoint) {
      await axios.post(globalConfig.webhookEndpoint, { data, webhookType, activityType: `blinko.note.${webhookType}` })
    }
  } catch (error) {
    console.log('request webhook error:', error)
  }
}

export function generateTOTP(): string {
  return authenticator.generateSecret();
}

export function generateTOTPQRCode(username: string, secret: string): string {
  return authenticator.keyuri(username, 'Blinko', secret);
}

export function verifyTOTP(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (err) {
    return false;
  }
} 