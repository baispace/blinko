import net from "node:net";
import tls from "node:tls";
import os from "node:os";

/**
 * 博客邮件通知。
 *
 * 这个项目原本没有任何邮件能力，所以这里自带的 SMTP 客户端是零依赖实现
 * （只用 node:net / node:tls），不引入新的 npm 包。
 *
 * 三种状态如实区分，绝不把「没配置」显示成「已发送」：
 *   sent           —— 服务器确认收到了这封信
 *   failed         —— 发出去了但被拒绝 / 连不上，message 里是真实原因
 *   not_configured —— 没有配置 SMTP，message 里写清楚要配哪几个环境变量
 */

export type MailStatus = "sent" | "failed" | "not_configured";

export type MailResult = {
  status: MailStatus;
  /** 给管理员看的一句话说明：失败原因 / 未配置提示 / 发送成功。 */
  message: string;
};

export type BlogMailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  /** true = 直接 TLS（通常 465）；false = 明文连接，服务器支持时自动 STARTTLS。 */
  secure: boolean;
};

export type BlogMailMessage = {
  to: string;
  subject: string;
  text: string;
};

/**
 * 未配置时的统一提示。缺任何一项都算未配置 —— 不猜、不替用户填默认值。
 *
 * 两条路都写清楚：后台「邮件服务」是日常入口，环境变量是部署期的兜底。
 */
export const MAIL_NOT_CONFIGURED_MESSAGE =
  "未配置邮件服务：请在博客后台「邮件服务」里填写 SMTP 服务器、端口与发件人；也可以在服务端环境变量中设置 BLOG_SMTP_HOST、BLOG_SMTP_PORT、BLOG_SMTP_FROM，需要账号密码时再设置 BLOG_SMTP_USER 与 BLOG_SMTP_PASS。";

/**
 * 把后台配置的邮件设置转成 SMTP 客户端要用的形状。
 *
 * 缺 host / port / from 任意一项就返回 null —— 与环境变量那条路径同一个口径，
 * 不在这里替用户补默认值。
 */
export function blogMailConfigFromSettings(settings: {
  host: string;
  port: number;
  from: string;
  user: string;
  pass: string;
  secure: boolean;
}): BlogMailConfig | null {
  const host = settings.host.trim();
  const from = settings.from.trim();
  if (!host || !Number.isFinite(settings.port) || settings.port <= 0 || !from)
    return null;
  return {
    host,
    port: settings.port,
    user: settings.user.trim(),
    pass: settings.pass,
    from,
    secure: settings.secure,
  };
}

/** 读取 SMTP 配置。返回 null 表示「没配」。 */
export function readBlogMailConfig(
  env: Record<string, string | undefined> = process.env,
): BlogMailConfig | null {
  const host = (env.BLOG_SMTP_HOST || "").trim();
  const port = Number((env.BLOG_SMTP_PORT || "").trim());
  const from = (env.BLOG_SMTP_FROM || "").trim();
  if (!host || !Number.isFinite(port) || port <= 0 || !from) return null;
  return {
    host,
    port,
    user: (env.BLOG_SMTP_USER || "").trim(),
    pass: env.BLOG_SMTP_PASS || "",
    from,
    secure: String(env.BLOG_SMTP_SECURE || "").toLowerCase() === "true",
  };
}

type SmtpReply = { code: number; texts: string[] };

/**
 * 解析 SMTP 应答。
 * 一段应答可能有多行（`250-AAA` 续行、`250 BBB` 收尾），只有见到收尾行才算完整。
 */
function parseReply(buffer: string): { code: number; texts: string[]; consumed: number } | null {
  const lines: string[] = [];
  let index = 0;
  while (true) {
    const eol = buffer.indexOf("\r\n", index);
    if (eol < 0) return null;
    const line = buffer.slice(index, eol);
    index = eol + 2;
    lines.push(line);
    const matched = /^(\d{3})([ -]?)/.exec(line);
    if (!matched) continue;
    if (matched[2] === "-") continue;
    const texts = lines
      .filter((l) => /^\d{3}[ -]/.test(l))
      .map((l) => l.slice(4).trim());
    return { code: Number(matched[1]), texts, consumed: index };
  }
}

/** 一条 SMTP 连接。STARTTLS 升级时会把底层 socket 换成 TLS 的。 */
function smtpClient() {
  let socket: net.Socket | tls.TLSSocket | null = null;
  let buffer = "";
  const waiters: Array<(reply: SmtpReply) => void> = [];

  const onData = (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const reply = parseReply(buffer);
      if (!reply) break;
      buffer = buffer.slice(reply.consumed);
      const waiter = waiters.shift();
      waiter?.({ code: reply.code, texts: reply.texts });
    }
  };
  const onError = (err: Error) => {
    const waiter = waiters.shift();
    waiter?.({ code: 0, texts: [err.message] });
  };

  const attach = (next: net.Socket | tls.TLSSocket) => {
    socket = next;
    next.setEncoding("utf8");
    next.on("data", onData);
    next.on("error", onError);
  };

  return {
    attach,
    write(line: string) {
      if (!socket) throw new Error("SMTP 连接尚未建立");
      socket.write(line + "\r\n");
    },
    writeRaw(data: string) {
      if (!socket) throw new Error("SMTP 连接尚未建立");
      socket.write(data);
    },
    read(): Promise<SmtpReply> {
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    close() {
      socket?.destroy();
      socket = null;
    },
  };
}

/** 邮件头的非 ASCII 字符要编码成 RFC 2047 的 encoded-word。 */
function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** 正文整体 base64：绕开行长限制，也不用自己做点转义。 */
function encodeBody(text: string) {
  const base64 = Buffer.from(text.replace(/\r\n/g, "\n"), "utf8").toString("base64");
  const lines = base64.match(/.{1,76}/g) ?? [];
  return lines.join("\r\n");
}

function buildMessage(
  config: BlogMailConfig,
  message: BlogMailMessage,
) {
  return [
    `From: ${encodeHeader(config.from)}`,
    `To: ${encodeHeader(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(message.text),
  ].join("\r\n");
}

async function expect(
  client: ReturnType<typeof smtpClient>,
  code: number,
  label: string,
) {
  const reply = await client.read();
  if (reply.code !== code) {
    const detail = reply.texts.join(" ") || String(reply.code);
    throw new Error(`${label}失败：${detail}`);
  }
  return reply;
}

async function smtpExchange(
  config: BlogMailConfig,
  message: BlogMailMessage,
  timeoutMs: number,
) {
  const client = smtpClient();
  const localName = os.hostname() || "localhost";
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    client.attach(socket);
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) =>
        reject(new Error(`连接邮件服务器失败：${err.message}`));
      const onReady = () => {
        socket.off("error", onError);
        resolve();
      };
      socket.once("error", onError);
      socket.once(config.secure ? "secureConnect" : "connect", onReady);
    });

    const timerPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`邮件服务器在 ${Math.round(timeoutMs / 1000)} 秒内没有回应`)),
        timeoutMs,
      );
    });
    const run = async () => {
      await expect(client, 220, "连接邮件服务器");

      let capabilities = "";
      const sayHello = async () => {
        client.write(`EHLO ${localName}`);
        const reply = await expect(client, 250, "EHLO");
        capabilities = reply.texts.join("\n");
      };
      await sayHello();

      // 明文连接时，如果服务器支持 STARTTLS 就升级 —— 认证信息不会裸奔。
      if (!config.secure && /STARTTLS/i.test(capabilities)) {
        client.write("STARTTLS");
        await expect(client, 220, "启用 TLS");
        const secureSocket = tls.connect({ socket, servername: config.host });
        client.attach(secureSocket);
        await new Promise<void>((resolve, reject) => {
          secureSocket.once("secureConnect", () => resolve());
          secureSocket.once("error", (err) =>
            reject(new Error(`TLS 握手失败：${err.message}`)),
          );
        });
        await sayHello();
      }

      if (config.user) {
        if (/AUTH[^\n]*\bPLAIN\b/i.test(capabilities)) {
          const token = Buffer.from(
            `\u0000${config.user}\u0000${config.pass}`,
          ).toString("base64");
          client.write(`AUTH PLAIN ${token}`);
        } else if (/AUTH[^\n]*\bLOGIN\b/i.test(capabilities)) {
          client.write("AUTH LOGIN");
          await expect(client, 334, "AUTH LOGIN");
          client.write(Buffer.from(config.user).toString("base64"));
          await expect(client, 334, "AUTH LOGIN");
          client.write(Buffer.from(config.pass).toString("base64"));
        } else {
          throw new Error("邮件服务器不支持所配置的认证方式（仅支持 PLAIN / LOGIN）。");
        }
        await expect(client, 235, "身份验证");
      }

      client.write(`MAIL FROM:<${config.from}>`);
      await expect(client, 250, "发送 MAIL FROM");
      client.write(`RCPT TO:<${message.to}>`);
      await expect(client, 250, "发送 RCPT TO");
      client.write("DATA");
      await expect(client, 354, "发送 DATA");
      client.writeRaw(buildMessage(config, message) + "\r\n.\r\n");
      await expect(client, 250, "投递邮件");
      client.write("QUIT");
    };

    await Promise.race([run(), timerPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    client.close();
  }
}

/**
 * 发一封邮件。返回的状态永远如实反映结果 ——
 * 调用方据此写进后台的「邮件发送状态」，不自己编。
 *
 * config 必须由调用方显式传入（没有默认值）：发信用哪份配置是业务决定，
 * 不能靠「忘了传就退回环境变量」这种隐式兜底。
 */
export async function sendBlogMail(
  message: BlogMailMessage,
  config: BlogMailConfig | null,
  timeoutMs = 15_000,
): Promise<MailResult> {
  if (!config) {
    return { status: "not_configured", message: MAIL_NOT_CONFIGURED_MESSAGE };
  }
  try {
    await smtpExchange(config, message, timeoutMs);
    return { status: "sent", message: "邮件已发送。" };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
