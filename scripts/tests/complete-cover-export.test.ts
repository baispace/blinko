import { test, expect, spyOn } from "bun:test";
import { createRequire } from "node:module";
import { exportCoverImage } from "../../server/lib/blogCoverGeneration";
import { FileService } from "../../server/lib/files";
const sharp = createRequire(import.meta.dir + "/../../server/index.js")("sharp");

test("complete covers export their pixels even when a client submits legacy tile settings", async () => {
  const source = await sharp({create:{width:320,height:180,channels:3,background:"#10a080"}}).png().toBuffer();
  const read = spyOn(FileService, "getFileBuffer").mockResolvedValue(source);
  try {
    for (const key of ["blogAICover", "aiCover"]) {
      const db: any = {
        notes: {findFirst: async () => ({metadata:{},publication:{title:"整图",draftCoverAttachmentId:12}})},
        attachments: {findFirst: async () => ({id:12,path:"/private.webp",metadata:{[key]:{assetKind:"complete-cover"}}})},
      };
      const result = await exportCoverImage(db, 1, {noteId:2,placement:"share",width:320,height:180,config:{mode:"overlay",artwork:"tile",title:"不应出现的文字",subtitle:"",templateVersion:"v8",align:"left",sizeScale:1,palette:"violet"}});
      const buffer = Buffer.from(result.dataURL.split(",")[1], "base64");
      const {data,info} = await sharp(buffer).raw().toBuffer({resolveWithObject:true});
      expect(info.width).toBe(320);
      expect(info.height).toBe(180);
      for (const pixel of [0, Math.floor(info.width*info.height/2), info.width*info.height-1]) {
        const offset = pixel * info.channels;
        expect(Math.abs(data[offset]-16)).toBeLessThan(6);
        expect(Math.abs(data[offset+1]-160)).toBeLessThan(6);
        expect(Math.abs(data[offset+2]-128)).toBeLessThan(6);
      }
    }
  } finally { read.mockRestore(); }
});
