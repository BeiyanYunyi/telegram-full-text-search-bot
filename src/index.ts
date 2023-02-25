import { config } from "dotenv";
import crypto from "node:crypto";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { Api } from "telegram";
import ZincSearch from "zincsearch-node";

config();

const zincSearch = new ZincSearch({
  url: process.env.ZINC_URL || "http://127.0.0.1:4080",
  user: process.env.ZINC_USERNAME!,
  password: process.env.ZINC_PASSWORD!,
});
const uuid = crypto.webcrypto.randomUUID();
console.log(uuid);
const bot = new Telegraf(process.env.TG_KEY!);

bot.start((ctx) => {
  ctx.reply("Welcome");
  console.log(ctx.message.text);
});

bot.help((ctx) => ctx.reply("这是个获取tg聊天记录并丢进全文搜索的bot"));

bot.command("help", (ctx) =>
  ctx.reply("这是个获取tg聊天记录并丢进全文搜索的bot")
);

bot.command("quit", async (ctx) => {
  console.log(ctx.message.text);
  if (ctx.message.text.split(" ")[1] === uuid) {
    ctx.reply("leaved");
    await ctx.leaveChat();
  } else {
    ctx.reply("wrong password");
  }
});

bot.command("search", async (ctx) => {
  const text = ctx.message.text.split(" ");
  const queries = text.slice(1).map((txt) => `text:${txt}`);
  const result = await zincSearch.search({
    index: `tg-${ctx.message.chat.id}`,
    query: { term: queries.join(" "), terms: [] },
    search_type: "match",
    sort_fields: ["-_score"],
    max_results: 5,
  });
  if (!result.hits?.hits?.length) {
    return ctx.reply("没有结果");
  }
  const rpy = result.hits.hits.map((hit, index) => {
    const idx = hit._index!.replace("tg--100", "");
    const id = hit._id!;
    const link = `https://t.me/c/${idx}/${id}`;
    return `${index + 1}. ${link} score:${hit._score!.toFixed(3)}`;
  });
  ctx.reply(rpy.join("\n"));
});

bot.on(message("text"), (ctx) => {
  console.log(ctx.message.text);
  zincSearch.document.createOrUpdate({
    id: ctx.message.message_id.toString(),
    index: `tg-${ctx.message.chat.id}`,
    document: ctx.message,
  });
});

bot.on("edited_message", (ctx) => {
  if (ctx.update.edited_message.hasOwnProperty("text")) {
    console.log((ctx.update.edited_message as { text: string }).text);
  }
  zincSearch.document.createOrUpdate({
    id: `${ctx.update.edited_message.chat.id}-${ctx.update.edited_message.message_id}`,
    index: `tg-${ctx.update.edited_message.chat.id}`,
    document: ctx.update.edited_message,
  });
});

bot.on(message("photo"), (ctx) => {
  console.log(ctx.message.caption);
  zincSearch.document.createOrUpdate({
    id: `${ctx.message.chat.id}-${ctx.message.message_id}`,
    index: `tg-${ctx.message.chat.id}`,
    document: ctx.message,
  });
});

bot.on("message", (ctx) => {
  console.log(ctx.message);
});

bot.launch().then(() => {
  bot.telegram.setMyCommands(
    [
      new Api.BotCommand({ command: "start", description: "没啥用" }),
      new Api.BotCommand({ command: "help", description: "显示帮助" }),
      new Api.BotCommand({ command: "quit", description: "让它退出此群聊" }),
      new Api.BotCommand({ command: "search", description: "搜索消息" }),
    ],
    { scope: { type: "all_group_chats" } }
  );
});

process.on("SIGINT", () => bot.stop("SIGINT"));
process.on("SIGTERM", () => bot.stop("SIGTERM"));
