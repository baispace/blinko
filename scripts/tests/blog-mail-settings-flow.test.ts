import { describe, expect, test } from "bun:test";
import { testSavedMailSettings } from "../../app/src/components/BlinkoBlog/mailSettingsFlow";

describe("mail settings save and test", () => {
  test("awaits successful save before sending", async () => {
    const events: string[] = [];
    const result = await testSavedMailSettings({ dirty: true,
      save: async () => { await Promise.resolve(); events.push("saved"); return true; },
      send: async () => { events.push("sent"); return "ok"; },
    });
    expect(events).toEqual(["saved", "sent"]);
    expect(result).toEqual({skipped:false,result:"ok"});
  });
  test("failed validation or save does not send", async () => {
    let sent = false;
    expect(await testSavedMailSettings({dirty:true, save:async()=>false, send:async()=>{sent=true;}})).toEqual({skipped:true});
    expect(sent).toBe(false);
  });
  test("unchanged settings send without redundant save", async () => {
    let saved = false;
    await testSavedMailSettings({dirty:false,save:async()=>{saved=true;return true;},send:async()=>"ok"});
    expect(saved).toBe(false);
  });
  test("save exception prevents sending", async () => {
    let sent = false;
    await expect(testSavedMailSettings({dirty:true,save:async()=>{throw new Error("conflict");},send:async()=>{sent=true;}})).rejects.toThrow("conflict");
    expect(sent).toBe(false);
  });
  test("delivery failure does not retry save or send", async () => {
    let saves = 0, sends = 0;
    await expect(testSavedMailSettings({dirty:true,save:async()=>{saves++;return true;},send:async()=>{sends++;throw new Error("SMTP unavailable");}})).rejects.toThrow("SMTP unavailable");
    expect([saves,sends]).toEqual([1,1]);
  });
});
