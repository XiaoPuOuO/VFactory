import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  agents,
  companies,
  companyMemberships,
  heartbeatRunEvents,
  userNotificationPreferences,
} from "@paperclipai/db";
import { notifyAgentExecutionFailureEmail } from "../services/agent-execution-failure-email.js";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

function createDbStub(params: {
  markerRows: Array<Record<string, unknown>>;
  membershipsRows: Array<{ userId: string }>;
  prefsRows: Array<{ userId: string; emailEnabled: boolean }>;
  usersRows: Array<{ email: string }>;
  agentRows: Array<{ name: string }>;
  companyRows: Array<{ name: string }>;
}) {
  const rowsByTable = new Map<any, any>([
    [heartbeatRunEvents, params.markerRows],
    [companyMemberships, params.membershipsRows],
    [userNotificationPreferences, params.prefsRows],
    [authUsers, params.usersRows],
    [agents, params.agentRows],
    [companies, params.companyRows],
  ]);

  const insertValuesSpy = vi.fn(async () => undefined);

  const db: Partial<Db> & { insertValuesSpy: typeof insertValuesSpy } = {
    insertValuesSpy,
    select: vi.fn(() => ({
      from: vi.fn((table: any) => ({
        where: vi.fn(async () => rowsByTable.get(table) ?? []),
      })),
    })),
    insert: vi.fn(() => ({
      values: insertValuesSpy,
    })),
  };

  return db as Db & { insertValuesSpy: typeof insertValuesSpy };
}

function setValidSmtpEnv() {
  process.env.MAIL_MAILER = "smtp";
  process.env.MAIL_HOST = "smtp.gmail.com";
  process.env.MAIL_PORT = "587";
  process.env.MAIL_USERNAME = "user@example.com";
  process.env.MAIL_PASSWORD = "super-secret-password";
  process.env.MAIL_ENCRYPTION = "tls";
  process.env.MAIL_FROM_ADDRESS = "sender@example.com";
  process.env.MAIL_FROM_NAME = "HopeWonderland Studio";
}

describe("notifyAgentExecutionFailureEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockResolvedValue(undefined);
    createTransportMock.mockClear();
    delete process.env.MAIL_MAILER;
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_PORT;
    delete process.env.MAIL_USERNAME;
    delete process.env.MAIL_PASSWORD;
    delete process.env.MAIL_ENCRYPTION;
    delete process.env.MAIL_FROM_ADDRESS;
    delete process.env.MAIL_FROM_NAME;
    delete process.env.PAPERCLIP_PUBLIC_URL;
  });

  it("skips sending when SMTP env is missing", async () => {
    const db = createDbStub({
      markerRows: [],
      membershipsRows: [{ userId: "u1" }],
      prefsRows: [{ userId: "u1", emailEnabled: true }],
      usersRows: [{ email: "u1@example.com" }],
      agentRows: [{ name: "Agent A" }],
      companyRows: [{ name: "Company X" }],
    });

    await notifyAgentExecutionFailureEmail(db, {
      id: "run-1",
      companyId: "c1",
      agentId: "a1",
      invocationSource: "automation",
      triggerDetail: "scheduled",
      status: "failed",
      errorCode: "adapter_failed",
      finishedAt: new Date("2026-03-27T00:00:00.000Z"),
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(db.insertValuesSpy).not.toHaveBeenCalled();
  });

  it("skips sending when all owners have email disabled", async () => {
    setValidSmtpEnv();

    const db = createDbStub({
      markerRows: [],
      membershipsRows: [{ userId: "u1" }, { userId: "u2" }],
      prefsRows: [
        { userId: "u1", emailEnabled: false },
        { userId: "u2", emailEnabled: false },
      ],
      usersRows: [{ email: "should-not-be-used@example.com" }],
      agentRows: [{ name: "Agent A" }],
      companyRows: [{ name: "Company X" }],
    });

    await notifyAgentExecutionFailureEmail(db, {
      id: "run-1",
      companyId: "c1",
      agentId: "a1",
      invocationSource: "automation",
      triggerDetail: "scheduled",
      status: "failed",
      errorCode: "adapter_failed",
      finishedAt: new Date("2026-03-27T00:00:00.000Z"),
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(db.insertValuesSpy).not.toHaveBeenCalled();
  });

  it("skips sending when marker already exists", async () => {
    setValidSmtpEnv();

    const db = createDbStub({
      markerRows: [{ id: 123 }],
      membershipsRows: [{ userId: "u1" }],
      prefsRows: [{ userId: "u1", emailEnabled: true }],
      usersRows: [{ email: "u1@example.com" }],
      agentRows: [{ name: "Agent A" }],
      companyRows: [{ name: "Company X" }],
    });

    await notifyAgentExecutionFailureEmail(db, {
      id: "run-1",
      companyId: "c1",
      agentId: "a1",
      invocationSource: "automation",
      triggerDetail: "scheduled",
      status: "failed",
      errorCode: "adapter_failed",
      finishedAt: new Date("2026-03-27T00:00:00.000Z"),
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(db.insertValuesSpy).not.toHaveBeenCalled();
  });

  it("sends email and inserts marker on success", async () => {
    setValidSmtpEnv();
    process.env.PAPERCLIP_PUBLIC_URL = "https://paperclip.example.com";

    const db = createDbStub({
      markerRows: [],
      membershipsRows: [{ userId: "u1" }, { userId: "u2" }],
      prefsRows: [
        { userId: "u1", emailEnabled: true },
        { userId: "u2", emailEnabled: false },
      ],
      usersRows: [{ email: "u1@example.com" }],
      agentRows: [{ name: "Agent A" }],
      companyRows: [{ name: "Company X" }],
    });

    const runId = "run-1";
    const agentId = "a1";

    await notifyAgentExecutionFailureEmail(db, {
      id: runId,
      companyId: "c1",
      agentId,
      invocationSource: "automation",
      triggerDetail: "scheduled",
      status: "failed",
      errorCode: "adapter_failed",
      finishedAt: new Date("2026-03-27T00:00:00.000Z"),
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArg = sendMailMock.mock.calls[0]?.[0];
    expect(mailArg).toBeTruthy();
    expect(mailArg.to).toContain("u1@example.com");
    expect(mailArg.subject).toContain("Agent 執行失敗");
    expect(mailArg.text).toContain(`companyId: c1`);
    expect(mailArg.text).toContain(`runId: ${runId}`);
    expect(mailArg.text).toContain(`errorCode: adapter_failed`);
    expect(mailArg.text).toContain(
      `https://paperclip.example.com/agents/${agentId}/runs/${runId}`,
    );
    expect(mailArg.text).toContain("2026-03-27T00:00:00.000Z");

    expect(db.insertValuesSpy).toHaveBeenCalledTimes(1);
    const inserted = db.insertValuesSpy.mock.calls[0]?.[0];
    expect(inserted.runId).toBe(runId);
    expect(inserted.agentId).toBe(agentId);
    expect(inserted.eventType).toBe("notification.agent_execution_failure_email_sent");
  });
});

