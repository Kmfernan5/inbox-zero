import { ExecutedRuleStatus } from "@prisma/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import prisma from "@/utils/prisma";

const LIMIT = 50;

export async function getExecutedRules(status: ExecutedRuleStatus) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const pendingExecutedRules = await prisma.executedRule.findMany({
    where: { userId: session.user.id, status },
    take: LIMIT,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      rule: true,
      actionItems: true,
      status: true,
      reason: true,
      automated: true,
      createdAt: true,
    },
  });

  const gmail = getGmailClient(session);

  const pendingRulesWithMessage = await Promise.all(
    pendingExecutedRules.map(async (p) => {
      if (!p.rule) return;
      try {
        const message = await getMessage(p.messageId, gmail);

        const threadId = message.threadId;
        if (!threadId) return;

        return {
          ...p,
          message: parseMessage(message),
        };
      } catch (error) {
        console.error("getExecutedRules: error getting message", error);
      }
    }),
  );

  return pendingRulesWithMessage.filter(isDefined);
}