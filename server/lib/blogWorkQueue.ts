import type { PrismaClient } from "@prisma/client";

/** Aggregate only the signed-in owner's work. Never return reader contact data. */
export async function blogWorkQueue(db: PrismaClient, accountId: number) {
  const failed = { in: ["failed", "not_configured"] };
  const [articles, moments, applications, linkReports, articleMail, momentMail, friendMail] = await Promise.all([
    db.blogArticleFeedback.count({where:{accountId,status:"pending"}}),
    db.blogMomentFeedback.count({where:{accountId,status:"pending"}}),
    db.blogFriendLink.count({where:{accountId,status:"pending"}}),
    db.blogFriendFeedback.count({where:{accountId,status:"pending"}}),
    db.blogArticleFeedback.count({where:{accountId,status:{not:"archived"},wantReply:true,replies:{some:{mailStatus:failed}}}}),
    db.blogMomentFeedback.count({where:{accountId,status:{not:"archived"},wantReply:true,replies:{some:{mailStatus:failed}}}}),
    db.blogFriendLink.count({where:{accountId,status:{in:["approved","rejected"]},emailStatus:failed}}),
  ]);
  return {feedback:articles+moments, friends:applications+linkReports, feedbackMail:articleMail+momentMail, friendMail};
}
